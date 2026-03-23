FROM docker.io/library/rust:1.86-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY termpair-rs/ ./termpair-rs/

WORKDIR /build/termpair-rs
RUN cargo build --release && strip target/release/termpair

FROM docker.io/library/debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r termpair && useradd -r -g termpair -s /usr/sbin/nologin termpair

COPY --from=builder /build/termpair-rs/target/release/termpair /usr/local/bin/termpair

USER termpair
EXPOSE 8000

ENTRYPOINT ["termpair"]
CMD ["serve", "--host", "0.0.0.0", "--port", "8000"]
