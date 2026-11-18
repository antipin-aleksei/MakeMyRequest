use crate::AppState;
use axum::{
    extract::{Multipart, Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use object_store::{path::Path as ObjectPath, PutPayload};
use serde::Serialize;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use uuid::Uuid;

#[derive(Serialize)]
pub struct ApiError {
    pub error: &'static str,
}
pub type ApiResult<T> = Result<T, (StatusCode, Json<ApiError>)>;
pub fn fail(code: StatusCode, error: &'static str) -> (StatusCode, Json<ApiError>) {
    (code, Json(ApiError { error }))
}
pub fn db_error(error: sqlx::Error) -> (StatusCode, Json<ApiError>) {
    tracing::error!(code = ?error.as_database_error().and_then(|x| x.code()), "database failure");
    fail(StatusCode::SERVICE_UNAVAILABLE, "service_unavailable")
}
pub fn digest(input: &str) -> String {
    format!("{:x}", Sha256::digest(input.as_bytes()))
}
pub fn same_hash(a: &str, b: &str) -> bool {
    a.as_bytes().ct_eq(b.as_bytes()).unwrap_u8() == 1
}
fn detect_media(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}
#[derive(Serialize)]
pub struct Attachment {
    pub id: Uuid,
    pub filename: String,
    pub media_type: String,
    pub size_bytes: i64,
}

pub async fn upload_attachment(
    State(state): State<AppState>,
    Path(request_id): Path<Uuid>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> ApiResult<(StatusCode, Json<Attachment>)> {
    let token = headers
        .get("x-upload-token")
        .and_then(|x| x.to_str().ok())
        .ok_or_else(|| fail(StatusCode::UNAUTHORIZED, "unauthorized"))?;
    let expected: Option<String> = sqlx::query_scalar::<_, Option<String>>(
        "SELECT upload_token_hash FROM intake_requests WHERE id=$1 AND created_at > now()-interval '24 hours'",
    )
    .bind(request_id)
    .fetch_optional(&state.db)
    .await
    .map_err(db_error)?
    .flatten();
    if !expected.is_some_and(|x| same_hash(&digest(token), &x)) {
        return Err(fail(StatusCode::UNAUTHORIZED, "unauthorized"));
    }
    let field = multipart
        .next_field()
        .await
        .map_err(|_| fail(StatusCode::BAD_REQUEST, "invalid_multipart"))?
        .ok_or_else(|| fail(StatusCode::BAD_REQUEST, "missing_file"))?;
    if field.name() != Some("file") {
        return Err(fail(StatusCode::BAD_REQUEST, "missing_file"));
    }
    let filename: String = field
        .file_name()
        .unwrap_or("reference")
        .chars()
        .filter(|x| x.is_alphanumeric() || ['.', '-', '_'].contains(x))
        .take(120)
        .collect();
    let bytes = field
        .bytes()
        .await
        .map_err(|_| fail(StatusCode::BAD_REQUEST, "invalid_file"))?;
    if bytes.is_empty() || bytes.len() > 5 * 1024 * 1024 {
        return Err(fail(StatusCode::BAD_REQUEST, "file_size_invalid"));
    }
    let media_type =
        detect_media(&bytes).ok_or_else(|| fail(StatusCode::BAD_REQUEST, "unsupported_file"))?;
    let id = Uuid::new_v4();
    let stored = if state.remote_storage {
        state
            .storage
            .put(&ObjectPath::from(id.to_string()), PutPayload::from(bytes.to_vec()))
            .await
            .map_err(|_| fail(StatusCode::SERVICE_UNAVAILABLE, "storage_unavailable"))?;
        None
    } else {
        Some(bytes.to_vec()) // persisted in Neon instead of volatile Render disk
    };
    let insert = sqlx::query(
        "INSERT INTO request_attachments(id, request_id, filename, media_type, size_bytes, contents) VALUES ($1,$2,$3,$4,$5,$6)",
    )
    .bind(id)
    .bind(request_id)
    .bind(&filename)
    .bind(media_type)
    .bind(bytes.len() as i64)
    .bind(stored)
    .execute(&state.db)
    .await;
    if let Err(error) = insert {
        if state.remote_storage {
            let _ = state.storage.delete(&ObjectPath::from(id.to_string())).await;
        }
        if error.as_database_error().and_then(|e| e.constraint())
            == Some("request_attachments_max_three")
        {
            return Err(fail(StatusCode::CONFLICT, "attachment_limit"));
        }
        return Err(db_error(error));
    }
    Ok((
        StatusCode::CREATED,
        Json(Attachment {
            id,
            filename,
            media_type: media_type.into(),
            size_bytes: bytes.len() as i64,
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn signatures() {
        assert_eq!(detect_media(&[0xff, 0xd8, 0xff, 0]), Some("image/jpeg"));
        assert_eq!(detect_media(b"<script>"), None);
    }
    #[test]
    fn secret_matches_constant_time() {
        assert!(same_hash(&digest("known"), &digest("known")));
        assert!(!same_hash(&digest("known"), &digest("other")));
    }
}
