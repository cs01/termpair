pub mod handlers;
pub mod signing;
pub mod terminal;
pub mod themes;

use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::State;
use axum::http::{header, HeaderName};
use axum::response::IntoResponse;
use axum::routing::{get, Router};
use rust_embed::Embed;
use tower_http::set_header::SetResponseHeaderLayer;

use self::terminal::{ConnectionTracker, Terminals};

#[derive(Clone)]
pub struct AppState {
    pub terminals: Terminals,
    pub static_dir: Option<Arc<PathBuf>>,
    pub connections: Arc<ConnectionTracker>,
    pub signing_key: Arc<[u8; 32]>,
    pub theme_config: Arc<serde_json::Value>,
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
    let canonical = file_path.canonicalize().ok()?;
    if !canonical.starts_with(dir.as_ref()) {
        return None;
    }
    let data = std::fs::read(&canonical).ok()?;
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

fn inject_theme_into_html(html: Vec<u8>, theme_config: &serde_json::Value) -> Vec<u8> {
    if theme_config.get("name").and_then(|v| v.as_str()) == Some("termpair") {
        return html;
    }
    let html_str = String::from_utf8_lossy(&html);
    let json = serde_json::to_string(theme_config).unwrap_or_default();
    let encoded = json.replace('&', "&amp;").replace('"', "&quot;");
    let meta = format!("<meta name=\"termpair-theme\" content=\"{}\">", encoded);
    let injected = html_str.replace("</head>", &format!("{}</head>", meta));
    injected.into_bytes()
}

fn serve_with_theme(
    mime: String,
    data: Vec<u8>,
    theme: &serde_json::Value,
) -> axum::response::Response {
    if mime.contains("html") {
        let injected = inject_theme_into_html(data, theme);
        ([(header::CONTENT_TYPE, mime)], injected).into_response()
    } else {
        ([(header::CONTENT_TYPE, mime)], data).into_response()
    }
}

async fn serve_frontend(
    State(state): State<AppState>,
    uri: axum::http::Uri,
) -> impl axum::response::IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    if let Some((mime, data)) = resolve_static(&state.static_dir, path) {
        return serve_with_theme(mime, data, &state.theme_config);
    }

    if let Some(sub) = path.strip_prefix("s/") {
        if let Some((mime, data)) = resolve_static(&state.static_dir, sub) {
            return serve_with_theme(mime, data, &state.theme_config);
        }
    }

    if let Some((mime, data)) = resolve_static(&state.static_dir, "index.html") {
        return serve_with_theme(mime, data, &state.theme_config);
    }

    axum::http::StatusCode::NOT_FOUND.into_response()
}

async fn serve_index(
    State(state): State<AppState>,
    axum::extract::Path(terminal_id): axum::extract::Path<String>,
) -> impl axum::response::IntoResponse {
    if terminal_id.contains('.') && !terminal_id.contains("..") && !terminal_id.contains('/') {
        if let Some((mime, data)) = resolve_static(&state.static_dir, &terminal_id) {
            return serve_with_theme(mime, data, &state.theme_config);
        }
    }
    match resolve_static(&state.static_dir, "index.html") {
        Some((mime, data)) => serve_with_theme(mime, data, &state.theme_config),
        None => axum::http::StatusCode::NOT_FOUND.into_response(),
    }
}

async fn get_theme(State(state): State<AppState>) -> impl IntoResponse {
    axum::response::Json(state.theme_config.as_ref().clone())
}

pub fn create_app(terminals: Terminals, static_dir: Option<PathBuf>, theme: &str) -> Router {
    let signing_key = signing::load_signing_key();
    let theme_config = themes::get_theme_config(theme);
    let state = AppState {
        terminals,
        static_dir: static_dir.map(Arc::new),
        connections: Arc::new(ConnectionTracker::new(
            crate::constants::MAX_CONNECTIONS_PER_IP,
        )),
        signing_key: Arc::new(signing_key),
        theme_config: Arc::new(theme_config),
    };

    Router::new()
        .route("/api/theme", get(get_theme))
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
        .layer(SetResponseHeaderLayer::overriding(
            header::REFERRER_POLICY,
            header::HeaderValue::from_static("no-referrer"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_FRAME_OPTIONS,
            header::HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            header::HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("content-security-policy"),
            header::HeaderValue::from_static(
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
            ),
        ))
        .with_state(state)
}
