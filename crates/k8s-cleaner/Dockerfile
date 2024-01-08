FROM rust:1.72 as builder
WORKDIR /usr/src/k8s-cleaner
COPY . .
RUN cargo build --release

FROM debian:buster-slim

# show backtraces
ENV RUST_BACKTRACE 1

# install tools and dependencies
RUN apt-get update && \
	DEBIAN_FRONTEND=noninteractive apt-get install -y \
	libssl1.1 \
	ca-certificates && \
	# apt cleanup
	apt-get autoremove -y && \
	apt-get clean && \
	find /var/lib/apt/lists/ -type f -not -name lock -delete;

WORKDIR /usr/local/bin
COPY --from=builder /usr/src/k8s-cleaner/target/release/k8s-cleaner k8s-cleaner
CMD ["./k8s-cleaner"]
