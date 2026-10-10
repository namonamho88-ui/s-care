#!/bin/sh
set -eu
: "${HERMES_API_KEY:?Set HERMES_API_KEY to a strong random key in .env}"
python /opt/brain/configure_hermes.py --home /data/hermes --env-file /tmp/brain.env --host 0.0.0.0
exec python /opt/brain/run_hermes_service.py
