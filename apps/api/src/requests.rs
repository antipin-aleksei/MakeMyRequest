use crate::AppState;
use axum::{extract::State, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Serialize)]
pub struct Artist {
    id: Uuid,
    display_name: String,
    bio: String,
}

#[derive(Deserialize)]
pub struct NewRequest {
    kind: RequestKind,
    client_name: String,
    contact_email: String,
    description: String,
    answers: Value,
    preferred_at: Option<DateTime<Utc>>,
    consent_to_contact: bool,
}

#[derive(Deserialize, Serialize, sqlx::Type)]
#[sqlx(type_name = "request_kind", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
enum RequestKind {
    Consultation,
    Session,
}

#[derive(Serialize)]
pub struct CreatedRequest {
    id: Uuid,
    status: &'static str,
}

#[derive(Serialize)]
pub struct ApiError {
    error: &'static str,
}

pub async fn public_artist(
    State(state): State<AppState>,
) -> Result<Json<Artist>, (StatusCode, Json<ApiError>)> {
    let row: Option<(Uuid, String, String)> = sqlx::query_as(
        "SELECT id, display_name, bio FROM artists WHERE active = true ORDER BY created_at LIMIT 1"
    )
    .fetch_optional(&state.db).await.map_err(internal_error)?;

    let (id, display_name, bio) = row.ok_or((StatusCode::NOT_FOUND, Json(ApiError { error: "artist_not_found" })))?;
    Ok(Json(Artist { id, display_name, bio }))
}

pub async fn create_request(
    State(state): State<AppState>,
    Json(body): Json<NewRequest>,
) -> Result<(StatusCode, Json<CreatedRequest>), (StatusCode, Json<ApiError>)> {
    if !validate(&body) {
        return Err((StatusCode::BAD_REQUEST, Json(ApiError { error: "invalid_request" })));
    }

    let artist_id: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM artists WHERE active = true ORDER BY created_at LIMIT 1"
    ).fetch_optional(&state.db).await.map_err(internal_error)?;
    let artist_id = artist_id.ok_or((StatusCode::SERVICE_UNAVAILABLE, Json(ApiError { error: "artist_unavailable" })))?.0;

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO intake_requests (artist_id, kind, client_name, contact_email, description, answers, preferred_at, consent_to_contact, form_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1) RETURNING id"
    )
    .bind(artist_id)
    .bind(body.kind)
    .bind(body.client_name.trim())
    .bind(body.contact_email.trim())
    .bind(body.description.trim())
    .bind(body.answers)
    .bind(body.preferred_at)
    .bind(body.consent_to_contact)
    .fetch_one(&state.db).await.map_err(internal_error)?;

    Ok((StatusCode::CREATED, Json(CreatedRequest { id: id.0, status: "new" })))
}

fn validate(body: &NewRequest) -> bool {
    let name = body.client_name.trim();
    let email = body.contact_email.trim();
    let description = body.description.trim();
    !name.is_empty() && name.len() <= 120
        && email.len() <= 254 && email.contains('@') && !email.contains(' ')
        && description.len() >= 10 && description.len() <= 5000
        && body.answers.is_object()
        && body.answers.to_string().len() <= 10000
        && body.consent_to_contact
        && (body.preferred_at.is_none() || matches!(body.kind, RequestKind::Session))
}

fn internal_error(error: sqlx::Error) -> (StatusCode, Json<ApiError>) {
    tracing::error!(%error, "database query failed");
    (StatusCode::SERVICE_UNAVAILABLE, Json(ApiError { error: "service_unavailable" }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_invalid_request() {
        let body = NewRequest {
            kind: RequestKind::Consultation,
            client_name: " ".into(),
            contact_email: "bad".into(),
            description: "short".into(),
            answers: serde_json::json!({}),
            preferred_at: None,
            consent_to_contact: false,
        };
        assert!(!validate(&body));
    }
}
