use crate::{
    requests::{self, db_error, fail, ApiResult},
    schedule::{self, Preference},
    AppState,
};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::Response,
    Json,
};
use chrono::{DateTime, Duration, Utc};
use object_store::path::Path as ObjectPath;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Clone, Serialize, sqlx::FromRow)]
pub struct User {
    id: Uuid,
    email: String,
    display_name: String,
    role: String,
    preferred_language: String,
    contact_channels: Value,
}
impl User {
    pub(crate) fn id(&self) -> Uuid {
        self.id
    }
    pub(crate) fn role(&self) -> &str {
        &self.role
    }
}
#[derive(Serialize)]
pub struct AuthReply {
    token: String,
    user: User,
}
#[derive(Deserialize)]
pub struct Registration {
    email: String,
    password: String,
    display_name: String,
    role: String,
    preferred_language: String,
}
#[derive(Deserialize)]
pub struct Login {
    email: String,
    password: String,
}
#[derive(Deserialize)]
pub struct UpdateMe {
    display_name: String,
    preferred_language: String,
    contact_channels: Value,
}

fn language_ok(language: &str) -> bool {
    ["en", "ru", "sr"].contains(&language)
}
fn email_ok(email: &str) -> bool {
    email.len() <= 254
        && email.contains('@')
        && email.contains('.')
        && !email.chars().any(|c| c.is_whitespace() || c.is_control())
}
fn channels_ok(channels: &Value) -> bool {
    let Some(values) = channels.as_object() else {
        return false;
    };
    values.len() <= 5
        && values.iter().all(|(name, value)| {
            ["email", "telegram", "whatsapp", "viber", "instagram"].contains(&name.as_str())
                && value.as_str().is_some_and(|text| {
                    let text = text.trim();
                    !text.is_empty()
                        && text.len() <= 140
                        && !text.chars().any(|c| c.is_control() || c == '<' || c == '>')
                        && (name != "email" || email_ok(text))
                })
        })
}

fn auth_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|v| v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit()))
}
pub(crate) async fn authenticated(headers: &HeaderMap, db: &sqlx::PgPool) -> ApiResult<User> {
    let token =
        auth_token(headers).ok_or_else(|| fail(StatusCode::UNAUTHORIZED, "unauthorized"))?;
    sqlx::query_as::<_, User>(
        "SELECT u.id,u.email,u.display_name,u.role,u.preferred_language,u.contact_channels FROM app_users u JOIN user_sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",
    )
    .bind(requests::digest(token))
    .fetch_optional(db)
    .await
    .map_err(db_error)?
    .ok_or_else(|| fail(StatusCode::UNAUTHORIZED, "unauthorized"))
}
async fn maybe_user(headers: &HeaderMap, db: &sqlx::PgPool) -> ApiResult<Option<User>> {
    if auth_token(headers).is_some() {
        Ok(Some(authenticated(headers, db).await?))
    } else {
        Ok(None)
    }
}
fn guard_role(user: &User, role: &str) -> ApiResult<()> {
    if user.role != role {
        Err(fail(StatusCode::FORBIDDEN, "forbidden"))
    } else {
        Ok(())
    }
}
async fn new_session(db: &sqlx::PgPool, user: User) -> ApiResult<AuthReply> {
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    sqlx::query("INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)")
        .bind(requests::digest(&token))
        .bind(user.id)
        .bind(Utc::now() + Duration::days(30))
        .execute(db)
        .await
        .map_err(db_error)?;
    Ok(AuthReply { token, user })
}

pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<Registration>,
) -> ApiResult<(StatusCode, Json<AuthReply>)> {
    let email = body.email.trim().to_lowercase();
    let name = body.display_name.trim();
    if !email_ok(&email)
        || name.chars().count() < 2
        || name.chars().count() > 120
        || body.password.len() < 10
        || body.password.len() > 256
        || !["artist", "client"].contains(&body.role.as_str())
        || !language_ok(&body.preferred_language)
    {
        return Err(fail(StatusCode::BAD_REQUEST, "invalid_registration"));
    }
    let salt = SaltString::encode_b64(Uuid::new_v4().as_bytes())
        .map_err(|_| fail(StatusCode::SERVICE_UNAVAILABLE, "service_unavailable"))?;
    let password_hash = Argon2::default()
        .hash_password(body.password.as_bytes(), &salt)
        .map_err(|_| fail(StatusCode::SERVICE_UNAVAILABLE, "service_unavailable"))?
        .to_string();

    let insert = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO app_users (email, display_name, password_hash, role, preferred_language) VALUES($1,$2,$3,$4,$5) RETURNING id",
    )
    .bind(&email).bind(name).bind(password_hash).bind(&body.role).bind(&body.preferred_language)
    .fetch_one(&state.db).await;
    let id = match insert {
        Ok(id) => id,
        Err(error)
            if error
                .as_database_error()
                .is_some_and(|e| e.is_unique_violation()) =>
        {
            return Err(fail(StatusCode::CONFLICT, "email_in_use"))
        }
        Err(error) => return Err(db_error(error)),
    };
    let user = User {
        id,
        email,
        display_name: name.into(),
        role: body.role,
        preferred_language: body.preferred_language,
        contact_channels: serde_json::json!({}),
    };
    Ok((
        StatusCode::CREATED,
        Json(new_session(&state.db, user).await?),
    ))
}

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<Login>,
) -> ApiResult<Json<AuthReply>> {
    let result = sqlx::query_as::<_, (Uuid,String,String,String,String,Value,String)>(
        "SELECT id,email,display_name,role,preferred_language,contact_channels,password_hash FROM app_users WHERE lower(email)=lower($1)",
    )
    .bind(body.email.trim())
    .fetch_optional(&state.db)
    .await.map_err(db_error)?
    .ok_or_else(|| fail(StatusCode::UNAUTHORIZED, "invalid_credentials"))?;
    let hash = PasswordHash::new(&result.6)
        .map_err(|_| fail(StatusCode::UNAUTHORIZED, "invalid_credentials"))?;
    if Argon2::default()
        .verify_password(body.password.as_bytes(), &hash)
        .is_err()
    {
        return Err(fail(StatusCode::UNAUTHORIZED, "invalid_credentials"));
    }
    Ok(Json(
        new_session(
            &state.db,
            User {
                id: result.0,
                email: result.1,
                display_name: result.2,
                role: result.3,
                preferred_language: result.4,
                contact_channels: result.5,
            },
        )
        .await?,
    ))
}
pub async fn me(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Json<User>> {
    Ok(Json(authenticated(&headers, &state.db).await?))
}
pub async fn update_me(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<UpdateMe>,
) -> ApiResult<Json<User>> {
    let user = authenticated(&headers, &state.db).await?;
    if body.display_name.trim().chars().count() < 2
        || body.display_name.chars().count() > 120
        || !language_ok(&body.preferred_language)
        || !channels_ok(&body.contact_channels)
    {
        return Err(fail(StatusCode::BAD_REQUEST, "invalid_profile"));
    }
    let updated = sqlx::query_as::<_, User>(
        "UPDATE app_users SET display_name=$2,preferred_language=$3,contact_channels=$4 WHERE id=$1 RETURNING id,email,display_name,role,preferred_language,contact_channels",
    )
    .bind(user.id).bind(body.display_name.trim()).bind(&body.preferred_language).bind(&body.contact_channels)
    .fetch_one(&state.db).await.map_err(db_error)?;
    Ok(Json(updated))
}
pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<StatusCode> {
    if let Some(token) = auth_token(&headers) {
        sqlx::query("DELETE FROM user_sessions WHERE token_hash=$1")
            .bind(requests::digest(token))
            .execute(&state.db)
            .await
            .map_err(db_error)?;
    }
    Ok(StatusCode::NO_CONTENT)
}
pub async fn auth_providers() -> Json<Value> {
    Json(
        serde_json::json!({"available":[], "message":"OAuth requires developer credentials and verified callbacks"}),
    )
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Artist {
    id: Uuid,
    slug: String,
    display_name: String,
    bio: String,
    city: String,
    contact_channels: Value,
    accepting_requests: bool,
}
#[derive(Deserialize)]
pub struct ArtistUpdate {
    slug: String,
    display_name: String,
    bio: String,
    city: String,
    contact_channels: Value,
    accepting_requests: bool,
}
fn slug_ok(slug: &str) -> bool {
    slug.len() >= 3
        && slug.len() <= 48
        && !slug.starts_with('-')
        && !slug.ends_with('-')
        && !slug.contains("--")
        && slug
            .bytes()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == b'-')
}
pub async fn save_artist(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ArtistUpdate>,
) -> ApiResult<Json<Artist>> {
    let user = authenticated(&headers, &state.db).await?;
    guard_role(&user, "artist")?;
    if !slug_ok(&body.slug)
        || body.display_name.trim().chars().count() < 2
        || body.display_name.len() > 120
        || body.bio.len() > 3000
        || body.city.len() > 120
        || !channels_ok(&body.contact_channels)
    {
        return Err(fail(StatusCode::BAD_REQUEST, "invalid_artist"));
    }
    let result = sqlx::query_as::<_, Artist>(
        "INSERT INTO artists(user_id,slug,display_name,bio,city,contact_channels,published,active,accepting_requests) VALUES($1,$2,$3,$4,$5,$6,true,true,$7) ON CONFLICT(user_id) DO UPDATE SET slug=excluded.slug,display_name=excluded.display_name,bio=excluded.bio,city=excluded.city,contact_channels=excluded.contact_channels,accepting_requests=excluded.accepting_requests,published=true RETURNING id,slug,display_name,bio,city,contact_channels,accepting_requests",
    )
    .bind(user.id).bind(&body.slug).bind(body.display_name.trim())
    .bind(body.bio.trim()).bind(body.city.trim()).bind(body.contact_channels)
    .bind(body.accepting_requests)
    .fetch_one(&state.db).await;
    match result {
        Ok(artist) => Ok(Json(artist)),
        Err(err)
            if err
                .as_database_error()
                .is_some_and(|e| e.is_unique_violation()) =>
        {
            Err(fail(StatusCode::CONFLICT, "slug_in_use"))
        }
        Err(err) => Err(db_error(err)),
    }
}
pub async fn my_artist(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Option<Artist>>> {
    let user = authenticated(&headers, &state.db).await?;
    guard_role(&user, "artist")?;
    let artist = sqlx::query_as::<_, Artist>(
        "SELECT id,slug,display_name,bio,city,contact_channels,accepting_requests FROM artists WHERE user_id=$1",
    )
    .bind(user.id).fetch_optional(&state.db).await.map_err(db_error)?;
    Ok(Json(artist))
}
pub async fn public_artist(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> ApiResult<Json<Artist>> {
    let artist = sqlx::query_as::<_, Artist>(
        "SELECT id,slug,display_name,bio,city,contact_channels,accepting_requests FROM artists WHERE slug=$1 AND published=true AND active=true",
    ).bind(slug).fetch_optional(&state.db).await.map_err(db_error)?
    .ok_or_else(|| fail(StatusCode::NOT_FOUND, "artist_not_found"))?;
    Ok(Json(artist))
}

#[derive(Deserialize)]
pub struct Intake {
    kind: String,
    client_name: String,
    #[serde(default)]
    contact_email: Option<String>,
    #[serde(default = "empty_object")]
    contact_channels: Value,
    description: String,
    answers: Value,
    preferred_at: Option<DateTime<Utc>>,
    consent_to_contact: bool,
    #[serde(default)]
    website: String,
    #[serde(default)]
    availability_preferences: Vec<Preference>,
}
fn empty_object() -> Value {
    serde_json::json!({})
}

#[derive(Serialize)]
pub struct CreatedRequest {
    id: Uuid,
    status: &'static str,
    upload_token: String,
    claim_token: Option<String>,
}
pub async fn create_request(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Intake>,
) -> ApiResult<(StatusCode, Json<CreatedRequest>)> {
    let account = maybe_user(&headers, &state.db).await?;
    let artist_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM artists WHERE slug=$1 AND published=true AND active=true AND accepting_requests=true",
    ).bind(&slug).fetch_optional(&state.db).await.map_err(db_error)?
    .ok_or_else(|| fail(StatusCode::NOT_FOUND, "artist_unavailable"))?;
    if !["consultation", "session"].contains(&body.kind.as_str())
        || !(10..=5000).contains(&body.description.trim().chars().count())
        || body.answers.to_string().len() > 10000
        || !body.answers.is_object()
        || !body.consent_to_contact
        || !body.website.is_empty()
        || (body.kind != "session" && body.preferred_at.is_some())
        || body.preferred_at.as_ref().is_some_and(|d| d <= &Utc::now())
    {
        return Err(fail(StatusCode::BAD_REQUEST, "invalid_request"));
    }

    if body.kind != "session" && !body.availability_preferences.is_empty() {
        return Err(fail(StatusCode::BAD_REQUEST, "invalid_preferences"));
    }
    schedule::validate_preferences(&state.db, artist_id, &body.availability_preferences).await?;

    let name = if body.client_name.trim().is_empty() {
        account
            .as_ref()
            .map(|u| u.display_name.as_str())
            .unwrap_or("")
    } else {
        body.client_name.trim()
    };
    if !(2..=120).contains(&name.chars().count()) {
        return Err(fail(StatusCode::BAD_REQUEST, "invalid_name"));
    }
    let channels = if body
        .contact_channels
        .as_object()
        .is_some_and(|x| x.is_empty())
    {
        account
            .as_ref()
            .map(|u| u.contact_channels.clone())
            .unwrap_or_else(empty_object)
    } else {
        body.contact_channels
    };
    let email = body.contact_email.unwrap_or_default().trim().to_owned();
    let email = if email.is_empty() && channels.as_object().is_some_and(|x| x.is_empty()) {
        account
            .as_ref()
            .map(|u| u.email.clone())
            .unwrap_or_default()
    } else {
        email
    };
    if (!email.is_empty() && !email_ok(&email))
        || !channels_ok(&channels)
        || (email.is_empty() && channels.as_object().is_none_or(|x| x.is_empty()))
    {
        return Err(fail(StatusCode::BAD_REQUEST, "contact_required"));
    }
    let width = body.answers.get("width_cm").and_then(Value::as_f64);
    let height = body.answers.get("height_cm").and_then(Value::as_f64);
    if width.is_some() != height.is_some()
        || width.is_some_and(|v| !(0.5..=100.0).contains(&v))
        || height.is_some_and(|v| !(0.5..=100.0).contains(&v))
    {
        return Err(fail(StatusCode::BAD_REQUEST, "invalid_dimensions"));
    }
    let upload_token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let claim_token = if account.is_none() {
        Some(format!(
            "{}{}",
            Uuid::new_v4().simple(),
            Uuid::new_v4().simple()
        ))
    } else {
        None
    };
    let claim_hash = claim_token.as_ref().map(|token| requests::digest(token));
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO intake_requests(artist_id,client_user_id,kind,client_name,contact_email,contact_channels,description,answers,preferred_at,consent_to_contact,form_version,upload_token_hash,availability_preferences,claim_token_hash) VALUES($1,$2,$3::request_kind,$4,$5,$6,$7,$8,$9,true,3,$10,$11,$12) RETURNING id",
    )
    .bind(artist_id).bind(account.as_ref().map(|u| u.id)).bind(&body.kind)
    .bind(name).bind(&email).bind(channels).bind(body.description.trim())
    .bind(body.answers).bind(body.preferred_at).bind(requests::digest(&upload_token))
    .bind(serde_json::to_value(&body.availability_preferences).map_err(|_|fail(StatusCode::BAD_REQUEST,"invalid_preferences"))?)
    .bind(claim_hash)
    .fetch_one(&state.db).await.map_err(db_error)?;
    Ok((
        StatusCode::CREATED,
        Json(CreatedRequest {
            id,
            status: "new",
            upload_token,
            claim_token,
        }),
    ))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Summary {
    id: Uuid,
    artist_name: String,
    artist_slug: Option<String>,
    kind: String,
    status: String,
    client_name: String,
    description: String,
    created_at: DateTime<Utc>,
}
pub async fn artist_requests(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Vec<Summary>>> {
    let user = authenticated(&headers, &state.db).await?;
    guard_role(&user, "artist")?;
    let rows = sqlx::query_as::<_,Summary>(
        "SELECT r.id,a.display_name AS artist_name,a.slug AS artist_slug,r.kind::text AS kind,r.status::text AS status,r.client_name,r.description,r.created_at FROM intake_requests r JOIN artists a ON a.id=r.artist_id WHERE a.user_id=$1 ORDER BY r.created_at DESC LIMIT 200",
    ).bind(user.id).fetch_all(&state.db).await.map_err(db_error)?;
    Ok(Json(rows))
}
#[derive(Deserialize)]
pub struct ClaimBody {
    claim_token: String,
}
pub async fn claim_guest_request(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(body): Json<ClaimBody>,
) -> ApiResult<StatusCode> {
    let user = authenticated(&headers, &state.db).await?;
    guard_role(&user, "client")?;
    if body.claim_token.len() != 64
        || !body
            .claim_token
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(fail(StatusCode::BAD_REQUEST, "invalid_claim_token"));
    }
    let updated=sqlx::query(
        "UPDATE intake_requests SET client_user_id=$2, claim_token_hash=NULL WHERE id=$1 AND client_user_id IS NULL AND claim_token_hash=$3 AND created_at > now()-interval '7 days'",
    ).bind(id).bind(user.id).bind(requests::digest(&body.claim_token))
        .execute(&state.db).await.map_err(db_error)?;
    if updated.rows_affected() != 1 {
        return Err(fail(StatusCode::NOT_FOUND, "claim_not_found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn client_requests(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Vec<Summary>>> {
    let user = authenticated(&headers, &state.db).await?;
    guard_role(&user, "client")?;
    let rows=sqlx::query_as::<_,Summary>(
        "SELECT r.id,a.display_name AS artist_name,a.slug AS artist_slug,r.kind::text AS kind,r.status::text AS status,r.client_name,r.description,r.created_at FROM intake_requests r JOIN artists a ON a.id=r.artist_id WHERE r.client_user_id=$1 ORDER BY r.created_at DESC LIMIT 200",
    ).bind(user.id).fetch_all(&state.db).await.map_err(db_error)?;
    Ok(Json(rows))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Detail {
    id: Uuid,
    kind: String,
    status: String,
    client_name: String,
    contact_email: String,
    contact_channels: Value,
    description: String,
    answers: Value,
    preferred_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    form_version: i32,
    availability_preferences: Value,
}
#[derive(Serialize, sqlx::FromRow)]
pub struct Attachment {
    id: Uuid,
    filename: String,
    media_type: String,
    size_bytes: i64,
}
#[derive(Serialize)]
pub struct FullDetail {
    #[serde(flatten)]
    detail: Detail,
    attachments: Vec<Attachment>,
}

pub async fn client_request(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> ApiResult<Json<FullDetail>> {
    let user = authenticated(&headers, &state.db).await?;
    guard_role(&user, "client")?;
    let detail = sqlx::query_as::<_, Detail>(
        "SELECT id,kind::text AS kind,status::text AS status,client_name,contact_email,contact_channels,description,answers,preferred_at,created_at,form_version,availability_preferences FROM intake_requests WHERE id=$1 AND client_user_id=$2",
    )
    .bind(id).bind(user.id).fetch_optional(&state.db).await.map_err(db_error)?
    .ok_or_else(|| fail(StatusCode::NOT_FOUND, "not_found"))?;
    let attachments = sqlx::query_as::<_, Attachment>(
        "SELECT id,filename,media_type,size_bytes FROM request_attachments WHERE request_id=$1 ORDER BY created_at",
    ).bind(id).fetch_all(&state.db).await.map_err(db_error)?;
    Ok(Json(FullDetail {
        detail,
        attachments,
    }))
}

pub async fn artist_request(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> ApiResult<Json<FullDetail>> {
    let user = authenticated(&headers, &state.db).await?;
    guard_role(&user, "artist")?;
    let detail=sqlx::query_as::<_,Detail>(
        "SELECT r.id,r.kind::text AS kind,r.status::text AS status,r.client_name,r.contact_email,r.contact_channels,r.description,r.answers,r.preferred_at,r.created_at,r.form_version,r.availability_preferences FROM intake_requests r JOIN artists a ON a.id=r.artist_id WHERE r.id=$1 AND a.user_id=$2",
    ).bind(id).bind(user.id).fetch_optional(&state.db).await.map_err(db_error)?
    .ok_or_else(|| fail(StatusCode::NOT_FOUND,"not_found"))?;
    let attachments=sqlx::query_as::<_,Attachment>(
        "SELECT id,filename,media_type,size_bytes FROM request_attachments WHERE request_id=$1 ORDER BY created_at",
    ).bind(id).fetch_all(&state.db).await.map_err(db_error)?;
    Ok(Json(FullDetail {
        detail,
        attachments,
    }))
}
#[derive(Deserialize)]
pub struct StatusUpdate {
    status: String,
}
pub async fn change_status(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(body): Json<StatusUpdate>,
) -> ApiResult<StatusCode> {
    let user = authenticated(&headers, &state.db).await?;
    guard_role(&user, "artist")?;
    if !["new", "in_review", "needs_info", "accepted", "declined"].contains(&body.status.as_str()) {
        return Err(fail(StatusCode::BAD_REQUEST, "invalid_status"));
    }
    let updated=sqlx::query(
        "UPDATE intake_requests r SET status=$3::request_status FROM artists a WHERE r.id=$1 AND r.artist_id=a.id AND a.user_id=$2",
    ).bind(id).bind(user.id).bind(&body.status).execute(&state.db).await.map_err(db_error)?;
    if updated.rows_affected() == 0 {
        return Err(fail(StatusCode::NOT_FOUND, "not_found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn protected_attachment(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let user = authenticated(&headers, &state.db).await?;
    let found=sqlx::query_as::<_,(String,Option<Vec<u8>>)>(
        "SELECT f.media_type,f.contents FROM request_attachments f JOIN intake_requests r ON r.id=f.request_id JOIN artists a ON a.id=r.artist_id WHERE f.id=$1 AND (a.user_id=$2 OR r.client_user_id=$2)",
    ).bind(id).bind(user.id).fetch_optional(&state.db).await.map_err(db_error)?
    .ok_or_else(|| fail(StatusCode::NOT_FOUND,"not_found"))?;
    let bytes = if let Some(bytes) = found.1 {
        bytes.into()
    } else {
        state
            .storage
            .get(&ObjectPath::from(id.to_string()))
            .await
            .map_err(|_| fail(StatusCode::SERVICE_UNAVAILABLE, "storage_unavailable"))?
            .bytes()
            .await
            .map_err(|_| fail(StatusCode::SERVICE_UNAVAILABLE, "storage_unavailable"))?
    };
    let mut response = Response::new(Body::from(bytes));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&found.0)
            .map_err(|_| fail(StatusCode::SERVICE_UNAVAILABLE, "storage_unavailable"))?,
    );
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    Ok(response)
}
pub async fn delete_request(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> ApiResult<StatusCode> {
    let user = authenticated(&headers, &state.db).await?;
    guard_role(&user, "artist")?;
    let mut tx = state.db.begin().await.map_err(db_error)?;
    let exists=sqlx::query_scalar::<_,Uuid>(
        "SELECT r.id FROM intake_requests r JOIN artists a ON a.id=r.artist_id WHERE r.id=$1 AND a.user_id=$2 FOR UPDATE OF r",
    ).bind(id).bind(user.id).fetch_optional(&mut *tx).await.map_err(db_error)?
    .ok_or_else(|| fail(StatusCode::NOT_FOUND,"not_found"))?;
    let files =
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM request_attachments WHERE request_id=$1")
            .bind(exists)
            .fetch_all(&mut *tx)
            .await
            .map_err(db_error)?;
    sqlx::query("DELETE FROM intake_requests WHERE id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    for file in files {
        if state.remote_storage {
            if let Err(err) = state
                .storage
                .delete(&ObjectPath::from(file.to_string()))
                .await
            {
                tracing::warn!(id=%file, error=%err, "orphan object deletion needs retry");
            }
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

// Only one-time legacy migration. A valid artist account AND the original server secret are required.
pub async fn claim_legacy(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let user = authenticated(&headers, &state.db).await?;
    guard_role(&user, "artist")?;
    let candidate = headers
        .get("x-legacy-admin-key")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| fail(StatusCode::FORBIDDEN, "forbidden"))?;
    if !state
        .legacy_admin_hash
        .as_deref()
        .is_some_and(|hash| requests::same_hash(hash, &requests::digest(candidate)))
    {
        return Err(fail(StatusCode::FORBIDDEN, "forbidden"));
    }
    let artist_id = sqlx::query_scalar::<_, Uuid>("SELECT id FROM artists WHERE user_id=$1")
        .bind(user.id)
        .fetch_optional(&state.db)
        .await
        .map_err(db_error)?
        .ok_or_else(|| fail(StatusCode::BAD_REQUEST, "complete_artist_profile_first"))?;
    let updated=sqlx::query(
        "UPDATE intake_requests SET artist_id=$1 WHERE artist_id IN (SELECT id FROM artists WHERE user_id IS NULL AND slug IS NULL)",
    ).bind(artist_id).execute(&state.db).await.map_err(db_error)?;
    Ok(Json(
        serde_json::json!({"migrated":updated.rows_affected()}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reject_invalid_slug() {
        assert!(!slug_ok("bad Slug"));
        assert!(!slug_ok("-leading"));
        assert!(slug_ok("tattoo-master"));
    }
    #[test]
    fn require_contact_channel() {
        assert!(channels_ok(&serde_json::json!({"telegram":"@artist"})));
        assert!(!channels_ok(&serde_json::json!({"unknown":"x"})));
    }
}
