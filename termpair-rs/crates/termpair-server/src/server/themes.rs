use serde_json::{json, Value};

pub fn get_theme_config(name: &str) -> Value {
    match name {
        "sharemyclaude" => json!({
            "name": "sharemyclaude",
            "appName": "Share My Claude",
            "tagline": "Watch and interact with live Claude Code sessions",
            "logoHtml": "<span class=\"logo-sparkle\">✦</span><span class=\"logo-text\">Share My Claude</span>",
            "heroLogoHtml": "<h1><span class=\"hero-sparkle\">✦</span><span class=\"hero-title\">Share My Claude</span></h1>",
            "githubUrl": "https://github.com/cs01/sharemyclaude",
            "showFeatures": false,
            "showCallout": false,
            "showDisclaimer": true,
            "disclaimerText": "Not affiliated with or endorsed by Anthropic",
            "installCmd": "curl -fsSL https://raw.githubusercontent.com/cs01/sharemyclaude/main/install.sh | sh",
            "shareCmd": "sharemyclaude",
            "shareCmdPublic": "sharemyclaude --public",
            "cssVars": {
                "--bg": "#1a1a1a",
                "--surface": "#2a2a2a",
                "--border": "#3a3a3a",
                "--text": "#e8e0d4",
                "--text-muted": "#a09888",
                "--accent": "#d4a574",
                "--accent-hover": "#e0b88a",
                "--success": "#8bc48a",
                "--error": "#d47474",
                "--warning": "#d4b474",
                "--topbar-bg": "#111",
                "--footer-bg": "#111",
                "--terminal-bg": "#111111"
            },
            "footerLinks": [
                {"text": "GitHub", "url": "https://github.com/cs01/sharemyclaude"},
                {"text": "chadsmith.dev", "url": "https://chadsmith.dev"},
                {"text": "Powered by TermPair", "url": "https://github.com/cs01/termpair"}
            ]
        }),
        _ => json!({
            "name": "termpair"
        }),
    }
}
