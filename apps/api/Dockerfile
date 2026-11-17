FROM rust:1-bookworm AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/make-my-request-api /usr/local/bin/api
ENV API_HOST=0.0.0.0
EXPOSE 10000
USER 65532:65532
CMD ["/usr/local/bin/api"]
