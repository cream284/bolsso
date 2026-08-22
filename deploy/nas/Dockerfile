FROM alpine:3.24.1

ARG PB_VERSION=0.39.11
ARG PB_SHA256=08b9fcda0d5fd42cb315dc15a36dfa121c993855bd635f01d347c31b4328ec34

RUN apk add --no-cache ca-certificates unzip \
    && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O /tmp/pocketbase.zip \
    && echo "${PB_SHA256}  /tmp/pocketbase.zip" | sha256sum -c - \
    && mkdir -p /pb \
    && unzip /tmp/pocketbase.zip -d /pb \
    && rm /tmp/pocketbase.zip \
    && addgroup -g 1000 -S pocketbase \
    && adduser -u 1000 -S -D -H -G pocketbase pocketbase \
    && chown -R pocketbase:pocketbase /pb

WORKDIR /pb
USER pocketbase
EXPOSE 8080

ENTRYPOINT ["/pb/pocketbase"]
