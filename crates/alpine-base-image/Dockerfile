FROM alpine:latest

RUN apk add --no-cache wget tar

RUN wget https://github.com/moparisthebest/static-curl/releases/download/v7.83.1/curl-amd64 -O /tmp/curl && \
    echo downloaded && \
    chmod +x /tmp/curl && \
    echo chmoded

RUN wget https://github.com/uutils/coreutils/releases/download/0.0.17/coreutils-0.0.17-x86_64-unknown-linux-musl.tar.gz -O /tmp/coreutils.tar.gz && \
    cd /tmp && \
    tar -xvzf coreutils.tar.gz && \
    cp coreutils-0.0.17-x86_64-unknown-linux-musl/coreutils /tmp/coreutils && \
    chmod +x /tmp/coreutils && \
    rm -rf coreutils-0.0.17-x86_64-unknown-linux-musl coreutils.tar.gz && \
    echo coreutils downloaded

CMD ["sh"]
