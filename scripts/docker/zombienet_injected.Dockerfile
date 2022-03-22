FROM docker.io/library/node:16-buster-slim

LABEL io.parity.image.authors="devops-team@parity.io" \
    io.parity.image.vendor="Parity Technologies" \
    io.parity.image.title="parity/zombienet" \
    io.parity.image.description="Zombienet" \
    io.parity.image.source="https://github.com/paritytech/zombienet/blob/${VCS_REF}/scripts/docker/zombienet_injected.Dockerfile" \
    io.parity.image.revision="${VCS_REF}" \
    io.parity.image.created="${BUILD_DATE}"

RUN apt-get update && \
    apt-get install -y curl gnupg lsb-release jq tini && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# install gcloud and kubectl
WORKDIR /home/nonroot/
ENV CLOUDSDK_INSTALL_DIR /usr/local/gcloud
RUN curl -sSL https://sdk.cloud.google.com | bash
ENV PATH $PATH:/usr/local/gcloud/google-cloud-sdk/bin
RUN gcloud components install kubectl

# Non-root user for security purposes.
#
# UIDs below 10,000 are a security risk, as a container breakout could result
# in the container being ran as a more privileged user on the host kernel with
# the same UID.
#
# Static GID/UID is also useful for chown'ing files outside the container where
# such a user does not exist.
RUN groupadd --gid 10001 nonroot && \
    useradd  --home-dir /home/nonroot \
    --create-home \
    --shell /bin/bash \
    --gid nonroot \
    --groups nonroot \
    --uid 10000 nonroot

WORKDIR /home/nonroot/zombie-net
COPY ./artifacts/dist ./dist
COPY static-configs ./static-configs
COPY scripts ./scripts
COPY tests ./tests
COPY artifacts/package* ./
RUN npm install --production
RUN chown -R nonroot. /home/nonroot

# Change `cli` permissions and link to easy call
RUN chmod +x ./dist/cli.js
RUN ln -s /home/nonroot/zombie-net/dist/cli.js /usr/local/bin/zombie

# Dependency for run test script when run inside container
RUN mkdir -p /var/log/zombie-net
RUN chown -R nonroot. /var/log/zombie-net
RUN mkdir -p /etc/zombie-net
RUN chown -R nonroot. /etc/zombie-net

# Use the non-root user to run our application
# Tell run test script that it runs in container
ENV RUN_IN_CONTAINER 1
USER nonroot
# Tini allows us to avoid several Docker edge cases, see https://github.com/krallin/tini.
ENTRYPOINT ["tini", "--", "bash"]

