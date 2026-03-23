pub mod handlers;
pub mod terminal;

use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::{get, Router};
use rust_embed::Embed;
use tower_http::cors::CorsLayer;

use self::terminal::Terminals;

#[derive(Clone)]
pub struct AppState {
    pub terminals: Terminals,
    pub static_dir: Option<Arc<PathBuf>>,
}

#[derive(Embed)]
#[folder = "frontend/static/"]
struct FrontendAssets;

fn try_read_static_dir(
    static_dir: &Option<Arc<PathBuf>>,
    filename: &str,
) -> Option<(String, Vec<u8>)> {
    let dir = static_dir.as_ref()?;
    let file_path = dir.join(filename);
    if !file_path.starts_with(dir.as_ref()) {
        return None;
    }
    let data = std::fs::read(&file_path).ok()?;
    let mime = mime_guess::from_path(filename)
        .first_or_octet_stream()
        .to_string();
    Some((mime, data))
}

fn resolve_static(static_dir: &Option<Arc<PathBuf>>, filename: &str) -> Option<(String, Vec<u8>)> {
    if let Some(result) = try_read_static_dir(static_dir, filename) {
        return Some(result);
    }
    FrontendAssets::get(filename).map(|content| {
        let mime = mime_guess::from_path(filename)
            .first_or_octet_stream()
            .to_string();
        (mime, content.data.to_vec())
    })
}

async fn serve_frontend(
    State(state): State<AppState>,
    uri: axum::http::Uri,
) -> impl axum::response::IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    if let Some((mime, data)) = resolve_static(&state.static_dir, path) {
        return ([(axum::http::header::CONTENT_TYPE, mime)], data).into_response();
    }

    if let Some((mime, data)) = resolve_static(&state.static_dir, "index.html") {
        return ([(axum::http::header::CONTENT_TYPE, mime)], data).into_response();
    }

    axum::http::StatusCode::NOT_FOUND.into_response()
}

async fn serve_index(State(state): State<AppState>) -> impl axum::response::IntoResponse {
    match resolve_static(&state.static_dir, "index.html") {
        Some((mime, data)) => ([(axum::http::header::CONTENT_TYPE, mime)], data).into_response(),
        None => axum::http::StatusCode::NOT_FOUND.into_response(),
    }
}

pub fn create_app(terminals: Terminals, static_dir: Option<PathBuf>) -> Router {
    let cors = CorsLayer::very_permissive();

    let state = AppState {
        terminals,
        static_dir: static_dir.map(Arc::new),
    };

    Router::new()
        .route("/api/sessions", get(handlers::get_sessions))
        .route("/ping", get(handlers::ping))
        .route("/terminal/{terminal_id}", get(handlers::get_terminal))
        .route("/connect_to_terminal", get(handlers::ws_connect_terminal))
        .route(
            "/connect_browser_to_terminal",
            get(handlers::ws_connect_browser),
        )
        .route("/s/{terminal_id}", get(serve_index))
        .fallback(serve_frontend)
        .layer(cors)
        .with_state(state)
}
