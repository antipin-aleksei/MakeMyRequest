mod requests;

use axum::{http::{header, Method}, routing::{get, post}, Json, Router};
use serde::Serialize;
use sqlx::PgPool;
use std::{env, net::SocketAddr};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
struct AppState {
    db: PgPool,
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
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "make_my_request_api=info,tower_http=info".into()))
        .init();

    let db_url = env::var("DATABASE_URL")?;
    let db = PgPool::connect(&db_url).await?;
    sqlx::migrate!("./migrations").run(&db).await?;

    let origin = env::var("WEB_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".to_owned());
    let cors = CorsLayer::new()
        .allow_origin(origin.parse::<axum::http::HeaderValue>()?)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE]);

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/v1/artist", get(requests::public_artist))
        .route("/api/v1/requests", post(requests::create_request))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(AppState { db });

    let host = env::var("API_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = env::var("API_PORT").unwrap_or_else(|_| "8080".into()).parse()?;
    let address: SocketAddr = format!("{host}:{port}").parse()?;
    tracing::info!(%address, "API started");
    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
