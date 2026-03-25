mod share;

use clap::Parser;
use termpair_common::constants;

#[derive(Parser)]
#[command(
    name = "termpair",
    about = "share your terminal session securely with end-to-end encryption",
    version = constants::TERMPAIR_VERSION,
    after_long_help = "\
USAGE EXAMPLES:
  termpair                              Share with default server
  termpair --public                     Public session (listed, read-only, no encryption)
  termpair --host https://my-server.com Share via a custom server
  termpair --cmd bash                   Share a specific shell
  termpair --read-only                  Viewers can watch but not type

HOW IT WORKS:
  1. termpair launches your shell inside a shared terminal
  2. Terminal output is encrypted and relayed through the server via WebSocket
  3. Browsers decrypt and render the terminal in real-time
  4. The server is a blind relay — it never sees your data (private sessions)

LINKS:
  GitHub:  https://github.com/cs01/termpair"
)]
struct TermpairArgs {
    #[arg(long, default_value_t = default_shell(), help = "command to run in the shared terminal")]
    cmd: String,
    #[arg(
        short,
        long,
        default_value_t = constants::TERMPAIR_PORT,
        help = "port the server is running on"
    )]
    port: u16,
    #[arg(
        long,
        default_value = constants::TERMPAIR_HOST,
        help = "URL of the termpair server"
    )]
    host: String,
    #[arg(short, long, help = "prevent browser viewers from typing")]
    read_only: bool,
    #[arg(
        short = 'b',
        long,
        help = "automatically open the share link in a browser"
    )]
    open_browser: bool,
    #[arg(
        long,
        help = "make session publicly discoverable (no encryption, read-only for viewers)"
    )]
    public: bool,
    #[arg(short, long, help = "skip confirmation prompt and start immediately")]
    yes: bool,
    #[arg(
        long,
        default_value = "300",
        help = "seconds to retry reconnecting after server disconnect (0 = disable)"
    )]
    reconnect_timeout: u64,
}

#[derive(Parser)]
#[command(
    name = "sharemyclaude",
    about = "share your Claude Code session live in the browser",
    version = constants::TERMPAIR_VERSION,
    after_long_help = "\
INSTALL:
  curl -fsSL https://raw.githubusercontent.com/cs01/sharemyclaude/main/install.sh | sh

USAGE EXAMPLES:
  sharemyclaude                  Private session (end-to-end encrypted, link-only access)
  sharemyclaude --public         Public session (listed on sharemyclau.de, read-only, no encryption)
  sharemyclaude -- --model sonnet                       Pass flags to claude after --
  sharemyclaude --public -- --dangerously-skip-permissions

HOW IT WORKS:
  1. sharemyclaude launches Claude Code inside a shared terminal
  2. Terminal output is encrypted and relayed through the server via WebSocket
  3. Browsers decrypt and render the terminal in real-time
  4. The server is a blind relay — it never sees your data (private sessions)

LINKS:
  Website:    https://sharemyclau.de
  GitHub:     https://github.com/cs01/sharemyclaude
  Powered by: https://github.com/cs01/termpair"
)]
struct ShareMyClaudeArgs {
    #[arg(long, help = "make session publicly listed (no encryption, read-only)")]
    public: bool,
    #[arg(short, long, help = "viewers can watch but not type")]
    read_only: bool,
    #[arg(
        short = 'b',
        long,
        help = "automatically open the share link in a browser"
    )]
    open_browser: bool,
    #[arg(
        long,
        default_value = constants::SHAREMYCLAUDE_HOST,
        help = "override server URL"
    )]
    host: String,
    #[arg(
        short,
        long,
        default_value_t = constants::SHAREMYCLAUDE_PORT,
        help = "override server port"
    )]
    port: u16,
    #[arg(short, long, help = "skip confirmation prompt and start immediately")]
    yes: bool,
    #[arg(last = true)]
    claude_args: Vec<String>,
}

fn default_shell() -> String {
    #[cfg(unix)]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string())
    }
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    }
}

fn binary_name() -> String {
    std::env::args()
        .next()
        .and_then(|a| {
            std::path::Path::new(&a)
                .file_name()
                .map(|f| f.to_string_lossy().into_owned())
        })
        .unwrap_or_default()
}

fn build_share_url(host: &str, port: u16) -> String {
    if !host.starts_with("http://") && !host.starts_with("https://") {
        eprintln!("host must start with either http:// or https://");
        std::process::exit(1);
    }
    let is_default_port = (host.starts_with("https://") && port == 443)
        || (host.starts_with("http://") && port == 80);
    if port != 0 && !is_default_port {
        format!("{}:{}/", host.trim_end_matches('/'), port)
    } else {
        format!("{}/", host.trim_end_matches('/'))
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_share(
    cmd_parts: Vec<String>,
    host: String,
    port: u16,
    read_only: bool,
    open_browser: bool,
    public: bool,
    yes: bool,
    reconnect_timeout: u64,
) {
    let url = build_share_url(&host, port);
    let allow_browser_control = if public { false } else { !read_only };
    let opts = share::ShareOptions {
        cmd: cmd_parts,
        url,
        allow_browser_control,
        open_browser,
        is_public: public,
        yes,
        reconnect_timeout,
    };
    if let Err(e) = share::broadcast_terminal(opts).await {
        eprintln!("error: {}", e);
        std::process::exit(1);
    }
}

async fn run_sharemyclaude() {
    let args = ShareMyClaudeArgs::parse();

    if which::which(constants::SHAREMYCLAUDE_CMD).is_err() {
        eprintln!("error: claude not found. install Claude Code first:");
        eprintln!("  https://docs.anthropic.com/en/docs/claude-code");
        std::process::exit(1);
    }

    let mut cmd_parts = vec![constants::SHAREMYCLAUDE_CMD.to_string()];
    cmd_parts.extend(args.claude_args);

    run_share(
        cmd_parts,
        args.host,
        args.port,
        args.read_only,
        args.open_browser,
        args.public,
        args.yes,
        300,
    )
    .await;
}

async fn run_termpair() {
    let args = TermpairArgs::parse();
    let cmd_parts: Vec<String> =
        shell_words::split(&args.cmd).unwrap_or_else(|_| vec![args.cmd.clone()]);
    run_share(
        cmd_parts,
        args.host,
        args.port,
        args.read_only,
        args.open_browser,
        args.public,
        args.yes,
        args.reconnect_timeout,
    )
    .await;
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();

    if binary_name() == "sharemyclaude" {
        run_sharemyclaude().await;
    } else {
        run_termpair().await;
    }
}
