FROM python:3.14-slim
ARG HERMES_REVISION=a7b2ba02e3b9bb95d0cac87a6312cc82a3bc3eed
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl gosu \
 && rm -rf /var/lib/apt/lists/* && useradd -m -u 10001 hermes
RUN git init /opt/hermes && git -C /opt/hermes remote add origin https://github.com/NousResearch/hermes-agent.git && git -C /opt/hermes fetch --depth 1 origin ${HERMES_REVISION} && git -C /opt/hermes checkout --detach FETCH_HEAD
COPY scripts/patch_hermes_api.py scripts/configure_hermes.py /opt/brain/
COPY scripts/hermes_skill_bridge.py scripts/run_hermes_service.py /opt/brain/
# Upstream deliberately rejects ordinary wheel builds; use its supported editable install.
RUN python /opt/brain/patch_hermes_api.py /opt/hermes \
 && python -m pip install --no-cache-dir -e /opt/hermes aiohttp==3.14.3
COPY infra/hermes/start.sh /opt/brain/start.sh
ENV HOME=/home/hermes HERMES_HOME=/data/hermes PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 PYTHONDONTWRITEBYTECODE=1 HERMES_PUBLISH_HOST=0.0.0.0
WORKDIR /data/hermes
EXPOSE 8642 8643
ENTRYPOINT ["sh", "/opt/brain/start.sh"]
