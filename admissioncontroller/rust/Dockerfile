FROM rust:1.72 as builder
WORKDIR /usr/src/app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release
FROM debian:buster-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /usr/src/app/target/release/k8s-mutating-webhook .
RUN chmod +x ./k8s-mutating-webhook
EXPOSE 4443
CMD ["./k8s-mutating-webhook"]
