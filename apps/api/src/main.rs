mod accounts;
mod requests;
mod schedule;

use axum::{
    extract::DefaultBodyLimit,
    http::{header, Method},
    routing::{get, post},
    Json, Router,
};
use object_store::{aws::AmazonS3Builder, local::LocalFileSystem, ObjectStore};
use serde::Serialize;
use sqlx::PgPool;
use std::{env, net::SocketAddr, path::PathBuf, sync::Arc};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
struct AppState {
    db: PgPool,
    storage: Arc<dyn ObjectStore>,
    remote_storage: bool,
    legacy_admin_hash: Option<String>,
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
}
async fn health() -> Json<Health> {
    Json(Health { status: "ok" })
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "make_my_request_api=info,tower_http=info".into()),
        )
        .init();

    let db = PgPool::connect(&env::var("DATABASE_URL")?).await?;
    sqlx::migrate!("./migrations").run(&db).await?;

    let remote_storage = env::var("R2_ENDPOINT").is_ok();
    if env::var("REQUIRE_REMOTE_STORAGE").as_deref() == Ok("true") && !remote_storage {
        return Err("R2 required but R2_ENDPOINT is not set".into());
    }
    let storage: Arc<dyn ObjectStore> = if let Ok(endpoint) = env::var("R2_ENDPOINT") {
        Arc::new(
            AmazonS3Builder::new()
                .with_endpoint(endpoint)
                .with_bucket_name(env::var("R2_BUCKET")?)
                .with_region("auto")
                .with_access_key_id(env::var("R2_ACCESS_KEY_ID")?)
                .with_secret_access_key(env::var("R2_SECRET_ACCESS_KEY")?)
                .build()?,
        )
    } else {
        let dir =
            PathBuf::from(env::var("UPLOAD_DIR").unwrap_or_else(|_| "./private_uploads".into()));
        tokio::fs::create_dir_all(&dir).await?;
        Arc::new(LocalFileSystem::new_with_prefix(dir)?)
    };

    // Only the historic one-time claim flow can use this secret; it cannot access new users' data.
    let legacy_admin_hash = env::var("ADMIN_TOKEN")
        .ok()
        .filter(|secret| secret.len() >= 32)
        .map(|secret| requests::digest(&secret));

    let origin = env::var("WEB_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".into());
    let cors = CorsLayer::new()
        .allow_origin(origin.parse::<axum::http::HeaderValue>()?)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::PUT,
            Method::DELETE,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::HeaderName::from_static("x-upload-token"),
            header::HeaderName::from_static("x-legacy-admin-key"),
        ]);

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/v1/auth/register", post(accounts::register))
        .route("/api/v1/auth/login", post(accounts::login))
        .route("/api/v1/auth/logout", post(accounts::logout))
        .route(
            "/api/v1/auth/me",
            get(accounts::me).put(accounts::update_me),
        )
        .route("/api/v1/auth/providers", get(accounts::auth_providers))
        .route(
            "/api/v1/artist/me",
            get(accounts::my_artist).put(accounts::save_artist),
        )
        .route("/api/v1/artist/claim-legacy", post(accounts::claim_legacy))
        .route("/api/v1/artist/requests", get(accounts::artist_requests))
        .route(
            "/api/v1/artist/requests/{id}",
            get(accounts::artist_request)
                .patch(accounts::change_status)
                .delete(accounts::delete_request),
        )
        .route("/api/v1/client/requests", get(accounts::client_requests))
        .route(
            "/api/v1/client/requests/{id}",
            get(accounts::client_request),
        )
        .route(
            "/api/v1/attachments/{id}",
            get(accounts::protected_attachment),
        )
        .route("/api/v1/artists/{slug}", get(accounts::public_artist))
        .route("/api/v1/artists/{slug}/schedule", get(schedule::public_schedule))
        .route(
            "/api/v1/artists/{slug}/requests",
            post(accounts::create_request),
        )
        .route(
            "/api/v1/requests/{id}/attachments",
            post(requests::upload_attachment),
        )
        .layer(DefaultBodyLimit::max(6 * 1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(AppState {
            db,
            storage,
            remote_storage,
            legacy_admin_hash,
        });

    let host = env::var("API_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = env::var("API_PORT")
        .unwrap_or_else(|_| "8080".into())
        .parse()?;
    let address: SocketAddr = format!("{host}:{port}").parse()?;
    tracing::info!(%address, "API started");
    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
