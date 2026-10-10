FROM python:3.14-slim
ARG HERMES_REVISION=a7b2ba02e3b9bb95d0cac87a6312cc82a3bc3eed
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN git init /opt/hermes && git -C /opt/hermes remote add origin https://github.com/NousResearch/hermes-agent.git && git -C /opt/hermes fetch --depth 1 origin ${HERMES_REVISION} && git -C /opt/hermes checkout --detach FETCH_HEAD
COPY scripts/patch_hermes_api.py scripts/configure_hermes.py /opt/brain/
COPY scripts/hermes_skill_bridge.py scripts/run_hermes_service.py /opt/brain/
RUN python -m pip install --no-cache-dir /opt/hermes aiohttp==3.14.3 && python /opt/brain/patch_hermes_api.py /opt/hermes
# Use editable source so the pinned compatibility patch is the imported code.
RUN python -m pip install --no-deps -e /opt/hermes
COPY infra/hermes/start.sh /opt/brain/start.sh
ENV HERMES_HOME=/data/hermes PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 HERMES_PUBLISH_HOST=0.0.0.0
WORKDIR /data/hermes
EXPOSE 8642 8643
ENTRYPOINT ["sh", "/opt/brain/start.sh"]
