FROM docker.io/library/node:20-bullseye-slim

LABEL io.parity.image.authors="devops-team@parity.io" \
    io.parity.image.vendor="Parity Technologies" \
    io.parity.image.title="parity/zombienet" \
    io.parity.image.description="Zombienet" \
    io.parity.image.source="https://github.com/paritytech/zombienet/blob/${VCS_REF}/scripts/ci/docker/zombienet_injected.Dockerfile" \
    io.parity.image.revision="${VCS_REF}" \
    io.parity.image.created="${BUILD_DATE}"

RUN apt-get update && \
    apt-get install -y curl gnupg lsb-release jq tini vim procps build-essential && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# install gcloud and kubectl
WORKDIR /home/nonroot/
ENV CLOUDSDK_INSTALL_DIR /usr/local/gcloud
RUN curl -sSL https://sdk.cloud.google.com | bash
ENV PATH $PATH:/usr/local/gcloud/google-cloud-sdk/bin:/root/.cargo/bin
RUN gcloud components install kubectl

# Non-root user for security purposes.
#
# UIDs below 10,000 are a security risk, as a container breakout could result
# in the container being ran as a more privileged user on the host kernel with
# the same UID.
#
# Static GID/UID is also useful for chown'ing files outside the container where
# such a user does not exist.

# RUN groupadd --gid 10001 nonroot && \
#     useradd  --home-dir /home/nonroot \
#     --create-home \
#     --shell /bin/bash \
#     --gid nonroot \
#     --groups nonroot \
#     --uid 10000 nonroot

WORKDIR /home/nonroot/zombie-net
COPY javascript/packages ./packages
COPY scripts ./scripts
COPY tests ./tests
COPY javascript/package.json ./
COPY javascript/package-lock.json ./
RUN npm install --production
# RUN chown -R nonroot. /home/nonroot

# RUN ls -la /home/nonroot/zombie-net/packages/cli/dist

# Change `cli` permissions and link to easy call
RUN chmod +x /home/nonroot/zombie-net/packages/cli/dist/cli.js
RUN ln -s /home/nonroot/zombie-net/packages/cli/dist/cli.js /usr/local/bin/zombie

# Dependency for run test script when run inside container
RUN mkdir -p /var/log/zombie-net
# RUN chown -R nonroot. /var/log/zombie-net
RUN mkdir -p /etc/zombie-net
# RUN chown -R nonroot. /etc/zombie-net

# Use the non-root user to run our application
# USER nonroot

# install rust
ENV RUST_VERSION=1.80.0
RUN curl https://sh.rustup.rs -sSf | sh -s -- --default-toolchain $RUST_VERSION -y
ENV PATH $PATH:/home/nonroot/.cargo/bin
# install nextest
RUN cargo install cargo-nextest --locked

# Tini allows us to avoid several Docker edge cases, see https://github.com/krallin/tini.
ENTRYPOINT ["tini", "--", "bash"]

