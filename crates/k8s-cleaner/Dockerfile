FROM rust:1.72 as builder
WORKDIR /usr/src/k8s-cleaner
COPY . .
RUN cargo build --release

FROM debian:buster-slim
WORKDIR /usr/local/bin
RUN apt update && \
    apt install openssl -y
COPY --from=builder /usr/src/k8s-cleaner/target/release/k8s-cleaner k8s-cleaner
CMD ["./k8s-cleaner"]
