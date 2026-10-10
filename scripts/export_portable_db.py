"""Create a cloud-ready brain-schema archive without modifying the source database.

Uses pg_dump/pg_restore and a uniquely named temporary DB on the source server.
Requires CREATEDB locally. Credentials stay in child process environment variables.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlparse
import uuid

from configure_hermes import read_env


def export_archive(pg_bin, output, values):
    url = values.get("DB_URL", "jdbc:postgresql://127.0.0.1:5432/brain")
    if not url.startswith("jdbc:postgresql://"):
        raise ValueError("A PostgreSQL JDBC DB_URL is required")
    uri = urlparse(url.removeprefix("jdbc:"))
    if uri.username or uri.password:
        raise ValueError("Use DB_USER/DB_PASSWORD separately from DB_URL")
    source = uri.path.lstrip("/")
    schema = values.get("DB_SCHEMA", "public")
    if schema not in {"public", "brain"}:
        raise ValueError("Supported source schemas: public or brain")
    if not source:
        raise ValueError("Source database name is required")
    output = output.resolve()
    if output.exists():
        raise ValueError("Choose a new output file; existing backups are never overwritten")
    output.parent.mkdir(parents=True, exist_ok=True)
    # Ignore SQL/password contents in stdout/stderr; failed commands raise a generic tool error.
    env = {**os.environ, "PGPASSWORD": values.get("DB_PASSWORD", ""),
           "PGCONNECT_TIMEOUT": "10"}
    from urllib.parse import parse_qs
    for option, variable in {"sslmode": "PGSSLMODE", "sslrootcert": "PGSSLROOTCERT"}.items():
        if option in parse_qs(uri.query):
            env[variable] = parse_qs(uri.query)[option][0]
    connection = ["-h", uri.hostname or "127.0.0.1", "-p", str(uri.port or 5432),
                  "-U", values.get("DB_USER", "brain"), "-w"]

    def run(tool, *args):
        result = subprocess.run([str(pg_bin / tool), *connection, *map(str, args)],
                                env=env, capture_output=True, timeout=300)
        if result.returncode:
            raise RuntimeError(f"{tool} failed (exit {result.returncode}); check local DB permissions and PostgreSQL versions")
        return result.stdout

    staging = "brain_export_" + uuid.uuid4().hex[:16]
    created = False
    try:
        with tempfile.TemporaryDirectory(prefix="brain-export-") as directory:
            original = Path(directory) / "source.dump"
            run("pg_dump", "-d", source, "--schema=" + schema, "--format=custom", "--no-owner", "--no-acl", "-f", original)
            run("createdb", staging)
            created = True
            # Only this script's newly created staging database is cleaned/restored.
            run("pg_restore", "--clean", "--if-exists", "--no-owner", "--no-acl", "--exit-on-error", "-d", staging, original)
            if schema == "public":
                run("psql", "-d", staging, "-v", "ON_ERROR_STOP=1", "-c", "ALTER SCHEMA public RENAME TO brain")
            raw_counts = run("psql", "-d", staging, "-At", "-c",
                             "SELECT json_build_object('incidents',(SELECT count(*) FROM brain.incidents),'skills',(SELECT count(*) FROM brain.skills),'tasks',(SELECT count(*) FROM brain.agent_tasks),'events',(SELECT count(*) FROM brain.events),'audit',(SELECT count(*) FROM brain.audit))")
            run("pg_dump", "-d", staging, "--schema=brain", "--format=custom", "--no-owner", "--no-acl", "-f", output)
            return {"archive": str(output), "targetSchema": "brain", "counts": json.loads(raw_counts)}
    finally:
        if created:
            # Never derives a drop target from user input or the source DB name.
            run("dropdb", staging)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    settings = {**read_env(root / ".env"), **read_env(root / ".env.local"), **os.environ}
    print(json.dumps(export_archive(args.pg_bin.resolve(), args.output, settings), ensure_ascii=False))
