mod constants;
mod encryption;
mod names;
mod server;
mod share;
mod types;

use clap::{Parser, Subcommand};
use rand::Rng;

fn random_string(n: usize) -> String {
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
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
            default_value = "8000",
            help = "port the server is running on"
        )]
        port: u16,
        #[arg(
            long,
            default_value = "http://localhost",
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
    },
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

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .without_time()
        .with_target(false)
        .with_level(false)
        .init();

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
                    .serve(app.into_make_service())
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
                eprintln!(
                    "termpair v{} listening on http://{}",
                    constants::TERMPAIR_VERSION,
                    addr
                );
                axum::serve(listener, app).await.expect("server failed");
            }
        }
        Commands::Share {
            cmd,
            port,
            host,
            read_only,
            open_browser,
            public,
        } => {
            if !host.starts_with("http://") && !host.starts_with("https://") {
                eprintln!("host must start with either http:// or https://");
                std::process::exit(1);
            }

            let url = if port != 0 {
                format!("{}:{}/", host.trim_end_matches('/'), port)
            } else {
                let h = host.trim_end_matches('/');
                format!("{}/", h)
            };

            let cmd_parts: Vec<String> =
                shell_words::split(&cmd).unwrap_or_else(|_| vec![cmd.clone()]);

            let allow_browser_control = if public { false } else { !read_only };
            let opts = share::ShareOptions {
                cmd: cmd_parts,
                url,
                allow_browser_control,
                open_browser,
                is_public: public,
            };
            if let Err(e) = share::broadcast_terminal(opts).await {
                eprintln!("error: {}", e);
                std::process::exit(1);
            }
        }
    }
}
