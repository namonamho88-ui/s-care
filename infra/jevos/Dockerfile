FROM ubuntu:22.04
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt
ARG RELEASE=jevos-v4
RUN curl -fL --retry 3 https://github.com/feder-cr/jev/releases/download/${RELEASE}/jev-linux-x64.tar.gz -o jev-linux-x64.tar.gz \
 && curl -fL --retry 3 https://github.com/feder-cr/jev/releases/download/${RELEASE}/jevos-v4-openvino-int8.zip -o jevos-v4-openvino-int8.zip \
 && curl -fL --retry 3 https://github.com/feder-cr/jev/releases/download/${RELEASE}/SHA256SUMS.txt -o SHA256SUMS.txt \
 && grep -E ' [*]?(jev-linux-x64.tar.gz|jevos-v4-openvino-int8.zip)$' SHA256SUMS.txt | sha256sum -c - \
 && tar -xzf jev-linux-x64.tar.gz \
 && unzip -q jevos-v4-openvino-int8.zip -d jev \
 && rm jev-linux-x64.tar.gz jevos-v4-openvino-int8.zip SHA256SUMS.txt \
 && useradd -m brain && chown -R brain:brain /opt/jev
WORKDIR /opt/jev
USER brain
EXPOSE 8017
# Avoid compiling all prompt lengths while idle and retaining state snapshots.
# This keeps a single-user demo smaller; first requests may take longer.
ENTRYPOINT ["./jev","serve","--host","0.0.0.0","--port","8017","--threads","2","--warmup","0","--batch-tokens","0","--state-cache","0","--state-cache-tokens","0"]
