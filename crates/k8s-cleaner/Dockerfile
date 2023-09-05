FROM rust:1.55 as builder
WORKDIR /usr/src/k8s-cleaner
COPY . .
RUN cargo build --release

FROM debian:buster-slim
WORKDIR /usr/local/bin
COPY --from=builder /usr/src/k8s-cleaner/target/release/myrustapp k8s-cleaner
CMD ["./k8s-cleaner"]
