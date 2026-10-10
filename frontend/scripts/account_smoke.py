"""Exercise actual BFF cookies/RBAC using one fictional account; leave it disabled.

No existing incident is changed. Secrets are never printed. Use only an owned demo.
ADMIN_TOKEN comes from environment or --env-file, never a command-line argument.
"""
import argparse
import http.cookiejar
import json
import os
import secrets
import sys
import urllib.error
import urllib.request
from pathlib import Path


def run(base, admin_token):
    def client():
        jar = http.cookiejar.CookieJar()
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)), jar

    def call(client, path, method="GET", body=None):
        request = urllib.request.Request(base.rstrip("/") + "/api" + path,
            data=json.dumps(body).encode() if body is not None else None,
            method=method, headers={"Content-Type": "application/json", "Origin": base.rstrip("/")})
        try:
            response = client.open(request, timeout=45)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    admin, _ = client()
    status, data = call(admin, "/session", "POST", {"mode": "admin", "token": admin_token})
    assert status == 200 and "token" not in data, "Bootstrap login failed"
    status, existing = call(admin, "/auth/users")
    assert status == 200 and all("password_hash" not in row and "invite_hash" not in row for row in existing)
    _, catalog = call(admin, "/catalog")
    operator = next((row["id"] for row in reversed(catalog["operators"]) if all(row["id"] != user["operator_id"] for user in existing)), None)
    assert operator, "No unassigned fictional operator available"
    login, password = "check." + secrets.token_hex(5), secrets.token_urlsafe(24)
    status, invite = call(admin, "/auth/users", "POST", {"login": login, "displayName": "가상 계정 검증 (종료 후 비활성)", "role": "USER", "operatorId": operator})
    assert status == 200, "Invitation failed"
    user_id = invite["id"]
    result = {"url": base, "userId": user_id, "fictional": True, "existingIncidentsModified": False}
    try:
        member, cookies = client()
        status, activated = call(member, "/session", "POST", {"mode": "activate", "login": login, "inviteCode": invite["inviteCode"], "password": password})
        assert status == 200 and activated["user"]["role"] == "USER" and "token" not in activated, "Activation failed"
        cookie = next(c for c in cookies if c.name == "brain_token")
        assert cookie.has_nonstandard_attr("HttpOnly") and cookie.get_nonstandard_attr("SameSite").lower() == "strict"
        if base.startswith("https://"):
            assert cookie.secure
        other, _ = client()
        assert call(other, "/session", "POST", {"mode": "activate", "login": login, "inviteCode": invite["inviteCode"], "password": password})[0] == 401
        assert call(member, "/config")[1]["user"]["operatorId"] == operator
        for path in ("/auth/users", "/audit", "/evaluations"):
            assert call(member, path)[0] == 403, "Read permission not enforced"
        for path in ("/simulate", "/evaluations", "/hermes/sync", "/auth/users", "/incidents/INC-NO-MUTATION/approval"):
            assert call(member, path, "POST", {})[0] == 403, "Write permission not enforced"
        assert call(member, "/auth/login", "POST", {"login": login, "password": password})[0] == 404, "Raw token endpoint exposed by BFF"
        _, incidents = call(member, "/incidents")
        other_incident = next(row for row in incidents if row["owner_id"] != operator)
        assert call(member, "/incidents/" + other_incident["id"], "PATCH", {"notes": "가상 권한 차단 검증"})[0] == 403
        assert call(member, "/session", "DELETE")[0] == 200
        assert call(member, "/config")[0] == 401
        assert call(member, "/session", "POST", {"mode": "login", "login": login, "password": password})[0] == 200
        assert call(admin, "/auth/users/" + user_id, "PATCH", {"enabled": False})[0] == 200
        assert call(member, "/config")[0] == 401
        result.update(result="PASS", invitationSingleUse=True, httpOnlyCookie=True, roleAndOwnershipEnforced=True, logoutAndDisableRevoke=True)
    finally:
        status, _ = call(admin, "/auth/users/" + user_id, "PATCH", {"enabled": False})
        assert status == 200, "Verification account cleanup failed"
        result["verificationAccountDisabled"] = True
        call(admin, "/session", "DELETE")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    values = dict(os.environ)
    if args.env_file:
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
        from configure_hermes import read_env
        values.update(read_env(args.env_file))
    result = run(args.url, values["ADMIN_TOKEN"])
    if args.output:
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result))
