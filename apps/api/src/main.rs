mod requests;

use axum::{
    extract::DefaultBodyLimit,
    http::{header, Method},
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;
use object_store::{ObjectStore, aws::AmazonS3Builder, local::LocalFileSystem};
use std::{env, net::SocketAddr, path::PathBuf, sync::Arc};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
struct AppState {
    db: PgPool,
    admin_token_hash: String,
    storage: Arc<dyn ObjectStore>,
}

#[derive(Serialize)]
struct Health { status: &'static str }

async fn health() -> Json<Health> { Json(Health { status: "ok" }) }

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "make_my_request_api=info,tower_http=info".into()))
        .init();

    let database_url = env::var("DATABASE_URL")?;
    let db = PgPool::connect(&database_url).await?;
    sqlx::migrate!("./migrations").run(&db).await?;

    let admin_token = env::var("ADMIN_TOKEN")?;
    if admin_token.len() < 32 {
        return Err("ADMIN_TOKEN must contain at least 32 characters".into());
    }

    if env::var("REQUIRE_REMOTE_STORAGE").as_deref() == Ok("true") && env::var("R2_ENDPOINT").is_err() {
        return Err("REQUIRE_REMOTE_STORAGE=true but R2_ENDPOINT is unset".into());
    }
    // R2 uses the same private object-store interface as local development.
    let storage: Arc<dyn ObjectStore> = if let Ok(endpoint) = env::var("R2_ENDPOINT") {
        Arc::new(AmazonS3Builder::new()
            .with_endpoint(endpoint)
            .with_bucket_name(env::var("R2_BUCKET")?)
            .with_region("auto")
            .with_access_key_id(env::var("R2_ACCESS_KEY_ID")?)
            .with_secret_access_key(env::var("R2_SECRET_ACCESS_KEY")?)
            .build()?)
    } else {
        let upload_dir = PathBuf::from(env::var("UPLOAD_DIR").unwrap_or_else(|_| "./private_uploads".into()));
        tokio::fs::create_dir_all(&upload_dir).await?;
        Arc::new(LocalFileSystem::new_with_prefix(upload_dir)?)
    };
    let state = AppState {
        db,
        admin_token_hash: requests::digest(&admin_token),
        storage,
    };

    let origin = env::var("WEB_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".into());
    let cors = CorsLayer::new()
        .allow_origin(origin.parse::<axum::http::HeaderValue>()?)
        .allow_methods([Method::GET, Method::POST, Method::PATCH])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, header::HeaderName::from_static("x-upload-token")]);

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/v1/artist", get(requests::public_artist))
        .route("/api/v1/requests", post(requests::create_request))
        .route("/api/v1/requests/{id}/attachments", post(requests::upload_attachment))
        .route("/api/v1/admin/requests", get(requests::list_requests))
        .route("/api/v1/admin/requests/{id}", get(requests::get_request).patch(requests::change_status))
        .route("/api/v1/admin/attachments/{id}", get(requests::download_attachment))
        .layer(DefaultBodyLimit::max(6 * 1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state);

    let host = env::var("API_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = env::var("API_PORT").unwrap_or_else(|_| "8080".into()).parse()?;
    let address: SocketAddr = format!("{host}:{port}").parse()?;
    tracing::info!(%address, "API started");
    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
