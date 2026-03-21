mod constants;
mod encryption;
mod server;
mod share;
mod types;

use clap::{Parser, Subcommand};
use rand::Rng;

fn random_string(n: usize) -> String {
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
    (0..n).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect()
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
    #[command(about = "run termpair server to route messages between terminals and browsers")]
    Serve {
        #[arg(short, long, default_value = "8000")]
        port: u16,
        #[arg(long, default_value = "localhost")]
        host: String,
        #[arg(short, long)]
        certfile: Option<String>,
        #[arg(short, long)]
        keyfile: Option<String>,
    },
    #[command(about = "share your terminal session with one or more browsers")]
    Share {
        #[arg(long, default_value_t = default_shell())]
        cmd: String,
        #[arg(short, long, default_value = "8000")]
        port: u16,
        #[arg(long, default_value = "http://localhost")]
        host: String,
        #[arg(short, long)]
        read_only: bool,
        #[arg(short = 'b', long)]
        open_browser: bool,
    },
}

fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string())
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
        } => {
            let terminals = server::terminal::new_terminals();
            let app = server::create_app(terminals);

            let addr = format!("{}:{}", host, port);

            if certfile.is_some() || keyfile.is_some() {
                let cert = certfile.expect("--certfile required with --keyfile");
                let key = keyfile.expect("--keyfile required with --certfile");

                let tls_config = axum_server::tls_rustls::RustlsConfig::from_pem_file(&cert, &key)
                    .await
                    .expect("failed to load TLS config");

                axum_server::bind_rustls(addr.parse().unwrap(), tls_config)
                    .serve(app.into_make_service())
                    .await
                    .expect("server failed");
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
                }.expect("failed to create socket");
                socket.set_reuseaddr(false).ok();
                socket.bind(sock_addr).unwrap_or_else(|_| {
                    eprintln!("error: port {} is already in use", port);
                    eprintln!("  try: termpair serve --port {}", port + 1);
                    std::process::exit(1);
                });
                let listener = socket.listen(1024).expect("failed to listen");
                eprintln!("termpair v{} listening on http://{}", constants::TERMPAIR_VERSION, addr);
                axum::serve(listener, app).await.expect("server failed");
            }
        }
        Commands::Share {
            cmd,
            port,
            host,
            read_only,
            open_browser,
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

            let allow_browser_control = !read_only;
            if let Err(e) =
                share::broadcast_terminal(cmd_parts, url, allow_browser_control, open_browser).await
            {
                eprintln!("error: {}", e);
                std::process::exit(1);
            }
        }
    }
}
