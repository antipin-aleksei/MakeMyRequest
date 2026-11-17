use crate::AppState;
use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::Response,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use uuid::Uuid;

type ApiResult<T> = Result<T, (StatusCode, Json<ApiError>)>;

#[derive(Serialize)]
pub struct ApiError { error: &'static str }
fn fail(code: StatusCode, error: &'static str) -> (StatusCode, Json<ApiError>) {
    (code, Json(ApiError { error }))
}
fn db_error(error: sqlx::Error) -> (StatusCode, Json<ApiError>) {
    tracing::error!(error_type = ?error.as_database_error().map(|e| e.code()), "database query failed");
    fail(StatusCode::SERVICE_UNAVAILABLE, "service_unavailable")
}
fn io_error() -> (StatusCode, Json<ApiError>) {
    fail(StatusCode::SERVICE_UNAVAILABLE, "storage_unavailable")
}
pub fn digest(input: &str) -> String {
    format!("{:x}", Sha256::digest(input.as_bytes()))
}
fn authorized(headers: &HeaderMap, state: &AppState) -> ApiResult<()> {
    let token = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| fail(StatusCode::UNAUTHORIZED, "unauthorized"))?;
    if digest(token).as_bytes().ct_eq(state.admin_token_hash.as_bytes()).unwrap_u8() != 1 {
        return Err(fail(StatusCode::UNAUTHORIZED, "unauthorized"));
    }
    Ok(())
}

#[derive(Serialize)]
pub struct Artist { id: Uuid, display_name: String, bio: String }

#[derive(Deserialize)]
pub struct NewRequest {
    kind: RequestKind,
    client_name: String,
    contact_email: String,
    description: String,
    answers: Value,
    preferred_at: Option<DateTime<Utc>>,
    consent_to_contact: bool,
    #[serde(default)]
    website: String, // honeypot; filled-in bots are rejected
}
#[derive(Clone, Copy, Deserialize, Serialize, sqlx::Type)]
#[sqlx(type_name = "request_kind", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
enum RequestKind { Consultation, Session }

#[derive(Serialize)]
pub struct CreatedRequest { id: Uuid, status: &'static str, upload_token: String }

pub async fn public_artist(State(state): State<AppState>) -> ApiResult<Json<Artist>> {
    let row: Option<(Uuid, String, String)> = sqlx::query_as(
        "SELECT id, display_name, bio FROM artists WHERE active = true ORDER BY created_at LIMIT 1"
    ).fetch_optional(&state.db).await.map_err(db_error)?;
    let (id, display_name, bio) = row.ok_or_else(|| fail(StatusCode::NOT_FOUND, "artist_not_found"))?;
    Ok(Json(Artist { id, display_name, bio }))
}

pub async fn create_request(
    State(state): State<AppState>,
    Json(body): Json<NewRequest>,
) -> ApiResult<(StatusCode, Json<CreatedRequest>)> {
    if !validate(&body) { return Err(fail(StatusCode::BAD_REQUEST, "invalid_request")); }
    let artist_id = repository::active_artist(&state.db).await.map_err(db_error)?
        .ok_or_else(|| fail(StatusCode::SERVICE_UNAVAILABLE, "artist_unavailable"))?;
    let upload_token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let id = repository::insert_request(&state.db, artist_id, &body, &digest(&upload_token))
        .await.map_err(db_error)?;
    Ok((StatusCode::CREATED, Json(CreatedRequest { id, status: "new", upload_token })))
}

fn validate(body: &NewRequest) -> bool {
    let name = body.client_name.trim();
    let email = body.contact_email.trim();
    let description = body.description.trim();
    name.chars().count() >= 2 && name.chars().count() <= 120
        && email.len() <= 254 && email.contains('@') && email.contains('.')
        && !email.contains(char::is_whitespace)
        && (10..=5000).contains(&description.chars().count())
        && body.answers.is_object() && body.answers.to_string().len() <= 10000
        && body.consent_to_contact && body.website.is_empty()
        && (body.preferred_at.is_none() || matches!(body.kind, RequestKind::Session))
        && body.preferred_at.is_none_or(|time| time > Utc::now())
}

#[derive(Serialize)]
pub struct Attachment {
    id: Uuid,
    filename: String,
    media_type: String,
    size_bytes: i64,
}
fn detect_media(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) { Some("image/jpeg") }
    else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") { Some("image/png") }
    else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" { Some("image/webp") }
    else { None }
}

pub async fn upload_attachment(
    State(state): State<AppState>,
    Path(request_id): Path<Uuid>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> ApiResult<(StatusCode, Json<Attachment>)> {
    let upload_token = headers.get("x-upload-token").and_then(|v| v.to_str().ok())
        .ok_or_else(|| fail(StatusCode::UNAUTHORIZED, "unauthorized"))?;
    let expected_hash: Option<String> = sqlx::query_scalar(
        "SELECT upload_token_hash FROM intake_requests WHERE id = $1 AND created_at > now() - interval '24 hours'"
    ).bind(request_id).fetch_optional(&state.db).await.map_err(db_error)?.flatten();
    let expected_hash = expected_hash.ok_or_else(|| fail(StatusCode::UNAUTHORIZED, "unauthorized"))?;
    if digest(upload_token).as_bytes().ct_eq(expected_hash.as_bytes()).unwrap_u8() != 1 {
        return Err(fail(StatusCode::UNAUTHORIZED, "unauthorized"));
    }
    let field = multipart.next_field().await.map_err(|_| fail(StatusCode::BAD_REQUEST, "invalid_multipart"))?
        .ok_or_else(|| fail(StatusCode::BAD_REQUEST, "missing_file"))?;
    if field.name() != Some("file") { return Err(fail(StatusCode::BAD_REQUEST, "missing_file")); }
    let original_name = field.file_name().unwrap_or("reference").chars().filter(|c| c.is_alphanumeric() || *c == '.' || *c == '_' || *c == '-').take(120).collect::<String>();
    let bytes = field.bytes().await.map_err(|_| fail(StatusCode::BAD_REQUEST, "invalid_file"))?;
    if bytes.is_empty() || bytes.len() > 5 * 1024 * 1024 { return Err(fail(StatusCode::BAD_REQUEST, "file_size_invalid")); }
    let media_type = detect_media(&bytes).ok_or_else(|| fail(StatusCode::BAD_REQUEST, "unsupported_file"))?;
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM request_attachments WHERE request_id = $1")
        .bind(request_id).fetch_one(&state.db).await.map_err(db_error)?;
    if count >= 3 { return Err(fail(StatusCode::CONFLICT, "attachment_limit")); }
    let id = Uuid::new_v4();
    // Random opaque filename; never serve private uploads via a static file route.
    let path = state.upload_dir.join(id.to_string());
    tokio::fs::write(&path, &bytes).await.map_err(|_| io_error())?;
    let result = sqlx::query(
        "INSERT INTO request_attachments(id, request_id, filename, media_type, size_bytes) VALUES ($1,$2,$3,$4,$5)"
    ).bind(id).bind(request_id).bind(&original_name).bind(media_type).bind(bytes.len() as i64)
        .execute(&state.db).await;
    if let Err(error) = result {
        let _ = tokio::fs::remove_file(path).await;
        if let sqlx::Error::Database(ref e) = error {
            if e.constraint() == Some("request_attachments_max_three") {
                return Err(fail(StatusCode::CONFLICT, "attachment_limit"));
            }
        }
        return Err(db_error(error));
    }
    Ok((StatusCode::CREATED, Json(Attachment { id, filename: original_name, media_type: media_type.into(), size_bytes: bytes.len() as i64 })))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct RequestListItem {
    id: Uuid,
    kind: String,
    status: String,
    client_name: String,
    description: String,
    created_at: DateTime<Utc>,
}
pub async fn list_requests(
    State(state): State<AppState>, headers: HeaderMap
) -> ApiResult<Json<Vec<RequestListItem>>> {
    authorized(&headers, &state)?;
    let records = sqlx::query_as::<_, RequestListItem>(
        "SELECT id, kind::text AS kind, status::text AS status, client_name, description, created_at FROM intake_requests ORDER BY created_at DESC LIMIT 100"
    ).fetch_all(&state.db).await.map_err(db_error)?;
    Ok(Json(records))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct RequestDetail {
    id: Uuid,
    kind: String,
    status: String,
    client_name: String,
    contact_email: String,
    description: String,
    answers: Value,
    preferred_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}
#[derive(Serialize)]
pub struct DetailedRequest { #[serde(flatten)] request: RequestDetail, attachments: Vec<Attachment> }

pub async fn get_request(
    State(state): State<AppState>, Path(id): Path<Uuid>, headers: HeaderMap
) -> ApiResult<Json<DetailedRequest>> {
    authorized(&headers, &state)?;
    let request = sqlx::query_as::<_, RequestDetail>(
        "SELECT id, kind::text AS kind, status::text AS status, client_name, contact_email, description, answers, preferred_at, created_at FROM intake_requests WHERE id = $1"
    ).bind(id).fetch_optional(&state.db).await.map_err(db_error)?
        .ok_or_else(|| fail(StatusCode::NOT_FOUND, "not_found"))?;
    let attachments = sqlx::query_as::<_, AttachmentRow>(
        "SELECT id, filename, media_type, size_bytes FROM request_attachments WHERE request_id = $1 ORDER BY created_at"
    ).bind(id).fetch_all(&state.db).await.map_err(db_error)?
        .into_iter().map(|row| Attachment { id: row.id, filename: row.filename, media_type: row.media_type, size_bytes: row.size_bytes }).collect();
    Ok(Json(DetailedRequest { request, attachments }))
}
#[derive(sqlx::FromRow)]
struct AttachmentRow { id: Uuid, filename: String, media_type: String, size_bytes: i64 }

#[derive(Deserialize)]
pub struct ChangeStatus { status: String }
pub async fn change_status(
    State(state): State<AppState>, Path(id): Path<Uuid>, headers: HeaderMap, Json(body): Json<ChangeStatus>
) -> ApiResult<StatusCode> {
    authorized(&headers, &state)?;
    if !matches!(body.status.as_str(), "new" | "in_review" | "needs_info" | "accepted" | "declined") {
        return Err(fail(StatusCode::BAD_REQUEST, "invalid_status"));
    }
    let updated = sqlx::query("UPDATE intake_requests SET status = $2::request_status WHERE id = $1")
        .bind(id).bind(body.status).execute(&state.db).await.map_err(db_error)?;
    if updated.rows_affected() == 0 { return Err(fail(StatusCode::NOT_FOUND, "not_found")); }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn download_attachment(
    State(state): State<AppState>, Path(id): Path<Uuid>, headers: HeaderMap
) -> ApiResult<Response> {
    authorized(&headers, &state)?;
    let row = sqlx::query_as::<_, (String,)>("SELECT media_type FROM request_attachments WHERE id = $1")
        .bind(id).fetch_optional(&state.db).await.map_err(db_error)?
        .ok_or_else(|| fail(StatusCode::NOT_FOUND, "not_found"))?;
    let bytes = tokio::fs::read(state.upload_dir.join(id.to_string())).await.map_err(|_| io_error())?;
    let mut response = Response::new(Body::from(bytes));
    response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_str(&row.0).map_err(|_| io_error())?);
    response.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("private, no-store"));
    response.headers_mut().insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    Ok(response)
}

mod repository {
    use super::{NewRequest, Uuid};
    use sqlx::PgPool;
    pub async fn active_artist(pool: &PgPool) -> Result<Option<Uuid>, sqlx::Error> {
        Ok(sqlx::query_as::<_, (Uuid,)>(
            "SELECT id FROM artists WHERE active = true ORDER BY created_at LIMIT 1"
        ).fetch_optional(pool).await?.map(|row| row.0))
    }
    pub async fn insert_request(pool: &PgPool, artist_id: Uuid, body: &NewRequest, token_hash: &str) -> Result<Uuid, sqlx::Error> {
        Ok(sqlx::query_as::<_, (Uuid,)>(
            "INSERT INTO intake_requests (artist_id, kind, client_name, contact_email, description, answers, preferred_at, consent_to_contact, form_version, upload_token_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9) RETURNING id"
        )
        .bind(artist_id).bind(body.kind).bind(body.client_name.trim()).bind(body.contact_email.trim())
        .bind(body.description.trim()).bind(&body.answers).bind(body.preferred_at)
        .bind(body.consent_to_contact).bind(token_hash)
        .fetch_one(pool).await?.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blocks_invalid_requests() {
        let body = NewRequest {
            kind: RequestKind::Consultation, client_name: "  ".into(),
            contact_email: "invalid".into(), description: "short".into(),
            answers: serde_json::json!({}), preferred_at: None,
            consent_to_contact: false, website: String::new(),
        };
        assert!(!validate(&body));
    }
    #[test]
    fn detects_only_approved_image_signatures() {
        assert_eq!(detect_media(&[0xff, 0xd8, 0xff, 0x00]), Some("image/jpeg"));
        assert_eq!(detect_media(b"javascript"), None);
        assert_eq!(detect_media(b"\x89PNG\r\n\x1a\nanything"), Some("image/png"));
    }
}
