mod constants;
mod encryption;
mod names;
mod server;
mod share;
mod types;

use clap::{Parser, Subcommand};
use rand::rngs::OsRng;
use rand::Rng;

fn random_string(n: usize) -> String {
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = OsRng;
    (0..n)
        .map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char)
        .collect()
}

#[derive(Parser)]
#[command(
    name = "termpair",
    about = "view and control remote terminals from your browser",
    version = constants::TERMPAIR_VERSION
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    #[command(about = "run termpair server to route messages between terminals and browsers", version = constants::TERMPAIR_VERSION)]
    Serve {
        #[arg(short, long, default_value = "8000", help = "port to listen on")]
        port: u16,
        #[arg(
            long,
            default_value = "localhost",
            help = "host to bind to (use 0.0.0.0 to expose publicly)"
        )]
        host: String,
        #[arg(short, long, help = "path to SSL certificate (.crt) for HTTPS")]
        certfile: Option<String>,
        #[arg(short, long, help = "path to SSL private key (.key) for HTTPS")]
        keyfile: Option<String>,
        #[arg(
            long,
            help = "directory of static files to serve instead of the built-in frontend"
        )]
        static_dir: Option<String>,
    },
    #[command(about = "share your terminal session with one or more browsers", version = constants::TERMPAIR_VERSION)]
    Share {
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
    },
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

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();

    if binary_name() == "sharemyclaude" {
        run_sharemyclaude().await;
        return;
    }

    let cli = Cli::parse();

    match cli.command {
        Commands::Serve {
            port,
            host,
            certfile,
            keyfile,
            static_dir,
        } => {
            let static_path = static_dir.map(|s| {
                let p = std::path::PathBuf::from(&s);
                if !p.is_dir() {
                    eprintln!("error: --static-dir '{}' is not a directory", s);
                    std::process::exit(1);
                }
                p.canonicalize().unwrap_or(p)
            });
            let terminals = server::terminal::new_terminals();
            let app = server::create_app(terminals, static_path);

            let addr = format!("{}:{}", host, port);

            if certfile.is_some() || keyfile.is_some() {
                let cert = match certfile {
                    Some(c) => c,
                    None => {
                        eprintln!("error: --certfile is required when --keyfile is provided");
                        std::process::exit(1);
                    }
                };
                let key = match keyfile {
                    Some(k) => k,
                    None => {
                        eprintln!("error: --keyfile is required when --certfile is provided");
                        std::process::exit(1);
                    }
                };

                let tls_config =
                    match axum_server::tls_rustls::RustlsConfig::from_pem_file(&cert, &key).await {
                        Ok(c) => c,
                        Err(e) => {
                            eprintln!("error: failed to load TLS config — {}", e);
                            eprintln!(
                                "  check that --certfile and --keyfile point to valid PEM files"
                            );
                            std::process::exit(1);
                        }
                    };

                let bind_addr = addr.parse().unwrap_or_else(|e| {
                    eprintln!("error: invalid address '{}' — {}", addr, e);
                    std::process::exit(1);
                });
                if let Err(e) = axum_server::bind_rustls(bind_addr, tls_config)
                    .serve(app.into_make_service_with_connect_info::<std::net::SocketAddr>())
                    .await
                {
                    eprintln!("error: server failed — {}", e);
                    std::process::exit(1);
                }
            } else {
                let sock_addr = tokio::net::lookup_host(&addr)
                    .await
                    .unwrap_or_else(|e| {
                        eprintln!("error: cannot resolve {} — {}", addr, e);
                        std::process::exit(1);
                    })
                    .next()
                    .unwrap_or_else(|| {
                        eprintln!("error: no addresses found for {}", addr);
                        std::process::exit(1);
                    });
                let socket = if sock_addr.is_ipv6() {
                    tokio::net::TcpSocket::new_v6()
                } else {
                    tokio::net::TcpSocket::new_v4()
                }
                .expect("failed to create socket");
                socket.set_reuseaddr(false).ok();
                socket.bind(sock_addr).unwrap_or_else(|_| {
                    eprintln!("error: port {} is already in use", port);
                    eprintln!("  try: termpair serve --port {}", port + 1);
                    std::process::exit(1);
                });
                let listener = socket.listen(1024).expect("failed to listen");
                if host != "localhost" && host != "127.0.0.1" && host != "::1" {
                    eprintln!(
                        "\x1b[1;33mwarning:\x1b[0m serving without TLS on {}. \
                         encryption keys will be sent over plaintext HTTP. \
                         use --certfile/--keyfile for production deployments.",
                        host
                    );
                }
                eprintln!(
                    "termpair v{} listening on http://{}",
                    constants::TERMPAIR_VERSION,
                    addr
                );
                axum::serve(
                    listener,
                    app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
                )
                .await
                .expect("server failed");
            }
        }
        Commands::Share {
            cmd,
            port,
            host,
            read_only,
            open_browser,
            public,
            yes,
            reconnect_timeout,
        } => {
            let cmd_parts: Vec<String> =
                shell_words::split(&cmd).unwrap_or_else(|_| vec![cmd.clone()]);
            run_share(
                cmd_parts,
                host,
                port,
                read_only,
                open_browser,
                public,
                yes,
                reconnect_timeout,
            )
            .await;
        }
    }
}
