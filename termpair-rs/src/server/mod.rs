pub mod handlers;
pub mod terminal;

use axum::response::IntoResponse;
use axum::routing::{get, Router};
use rust_embed::Embed;
use tower_http::cors::CorsLayer;

use self::terminal::Terminals;

#[derive(Embed)]
#[folder = "frontend/static/"]
struct FrontendAssets;

async fn serve_frontend(
    uri: axum::http::Uri,
) -> impl axum::response::IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match FrontendAssets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            (
                [(axum::http::header::CONTENT_TYPE, mime.as_ref())],
                content.data.to_vec(),
            )
                .into_response()
        }
        None => {
            if let Some(content) = FrontendAssets::get("index.html") {
                let mime = mime_guess::from_path("index.html").first_or_octet_stream();
                (
                    [(axum::http::header::CONTENT_TYPE, mime.as_ref())],
                    content.data.to_vec(),
                )
                    .into_response()
            } else {
                axum::http::StatusCode::NOT_FOUND.into_response()
            }
        }
    }
}

async fn serve_index() -> impl axum::response::IntoResponse {
    match FrontendAssets::get("index.html") {
        Some(content) => {
            (
                [(axum::http::header::CONTENT_TYPE, "text/html")],
                content.data.to_vec(),
            )
                .into_response()
        }
        None => axum::http::StatusCode::NOT_FOUND.into_response(),
    }
}

pub fn create_app(terminals: Terminals) -> Router {
    let cors = CorsLayer::very_permissive();

    Router::new()
        .route("/ping", get(handlers::ping))
        .route("/terminal/{terminal_id}", get(handlers::get_terminal))
        .route(
            "/connect_to_terminal",
            get(handlers::ws_connect_terminal),
        )
        .route(
            "/connect_browser_to_terminal",
            get(handlers::ws_connect_browser),
        )
        .route("/s/{terminal_id}", get(serve_index))
        .fallback(serve_frontend)
        .layer(cors)
        .with_state(terminals)
}
