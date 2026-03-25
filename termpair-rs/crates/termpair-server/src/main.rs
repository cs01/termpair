use clap::Parser;
use termpair_common::constants;
use termpair_server::server;

#[derive(Parser)]
#[command(
    name = "termpair-server",
    about = "run the termpair server to route encrypted terminal sharing sessions",
    version = constants::TERMPAIR_VERSION
)]
struct Args {
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
    #[arg(
        long,
        default_value = "termpair",
        help = "frontend theme (termpair, sharemyclaude)"
    )]
    theme: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();

    let args = Args::parse();

    let static_path = args.static_dir.map(|s| {
        let p = std::path::PathBuf::from(&s);
        if !p.is_dir() {
            eprintln!("error: --static-dir '{}' is not a directory", s);
            std::process::exit(1);
        }
        p.canonicalize().unwrap_or(p)
    });
    let terminals = server::terminal::new_terminals();
    let app = server::create_app(terminals, static_path, &args.theme);

    let addr = format!("{}:{}", args.host, args.port);

    if args.certfile.is_some() || args.keyfile.is_some() {
        let cert = match args.certfile {
            Some(c) => c,
            None => {
                eprintln!("error: --certfile is required when --keyfile is provided");
                std::process::exit(1);
            }
        };
        let key = match args.keyfile {
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
                    eprintln!("  check that --certfile and --keyfile point to valid PEM files");
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
            eprintln!("error: port {} is already in use", args.port);
            eprintln!("  try: termpair-server --port {}", args.port + 1);
            std::process::exit(1);
        });
        let listener = socket.listen(1024).expect("failed to listen");
        if args.host != "localhost" && args.host != "127.0.0.1" && args.host != "::1" {
            eprintln!(
                "\x1b[1;33mwarning:\x1b[0m serving without TLS on {}. \
                 encryption keys will be sent over plaintext HTTP. \
                 use --certfile/--keyfile for production deployments.",
                args.host
            );
        }
        eprintln!(
            "termpair-server v{} listening on http://{}",
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
