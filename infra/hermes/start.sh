#!/bin/sh
set -eu
if [ "$(id -u)" = "0" ]; then
    # New managed volumes start root-owned. Initialize only this application's home,
    # then run both the official gateway and Skill bridge without root privileges.
    mkdir -p /data/hermes/skills
    chown -R hermes:hermes /data/hermes
    exec gosu hermes sh /opt/brain/start.sh
fi
: "${HERMES_API_KEY:?Set HERMES_API_KEY to a strong random key in .env}"
python /opt/brain/configure_hermes.py --home /data/hermes --env-file /tmp/brain.env --host 0.0.0.0
exec python /opt/brain/run_hermes_service.py
