# Our first stage, that is the Builder
FROM node:16-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install
RUN npm run clean
RUN npm run build

# Our Second stage, that creates an image for production
FROM node:16-buster-slim AS runtime

RUN apt-get update && \
     apt-get install -y curl gnupg lsb-release jq tini vim && \
# # install github cli
# # https://github.com/cli/cli/blob/trunk/docs/install_linux.md
#     echo "deb https://cli.github.com/packages buster main" > /etc/apt/sources.list.d/gh.list && \
#     apt-key adv --keyserver keyserver.ubuntu.com --recv-key C99B11DEB97541F0 && \
#     apt-get update && \
#     apt-get install -y --no-install-recommends \
#         gh  && \
# apt clean up
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*



# install kubectl
# RUN curl -L -o /usr/local/bin/kubectl  \
#      "https://storage.googleapis.com/kubernetes-release/release/$(curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt)/bin/linux/amd64/kubectl" && \
#      chmod +x /usr/local/bin/kubectl

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
COPY --from=builder ./app/dist ./dist
COPY static-configs ./static-configs
COPY scripts ./scripts
COPY package* ./
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

