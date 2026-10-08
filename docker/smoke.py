"""Local Docker smoke test. Uploads one small PDF to a demo user's existing case."""
import argparse
import base64
import io
import json
import urllib.error
import urllib.request
import http.cookiejar
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8080")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    if base not in {"http://localhost:8080", "http://127.0.0.1:8080"}:
        raise ValueError("This demo test is restricted to local Docker")
    cookies = http.cookiejar.CookieJar()
    client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))

    def request(path, method="GET", data=None, token=None, headers=None, json_body=True):
        headers = dict(headers or {})
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if data is not None and json_body:
            headers["Content-Type"] = "application/json"
            data = json.dumps(data).encode()
        req = urllib.request.Request(base + "/api" + path, data=data, headers=headers, method=method)
        try:
            response = client.open(req, timeout=45)
        except urllib.error.HTTPError as error:
            response = error
        return response.status, response.read(), response.headers

    status, _, _ = request("/health")
    assert status == 200, "API health"
    status, body, headers = request("/auth/login", "POST", {
        "organizationSlug": "minh-khai-university", "email": "student@caseflow.local",
        "password": "Demo123!", "remember": False
    })
    assert status == 200, "Demo login"
    token = json.loads(body)["token"]
    claims = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=="))
    assert claims["exp"] - claims["iat"] == 900
    assert "HttpOnly" in headers["Set-Cookie"] and "SameSite=Strict" in headers["Set-Cookie"]
    print("PASS login: 15-minute access token; HttpOnly refresh cookie")

    original = next(c.value for c in cookies if c.name == "caseflow_refresh")
    status, body, _ = request("/auth/refresh", "POST")
    assert status == 200, "Refresh rotation"
    token = json.loads(body)["token"]
    assert next(c.value for c in cookies if c.name == "caseflow_refresh") != original
    print("PASS refresh token rotation")

    status, body, _ = request("/cases", token=token)
    cases = json.loads(body)["cases"]
    assert status == 200 and cases, "Demo cases available"
    case_id = cases[0]["_id"]
    content = b"%PDF-1.4\nDocker storage smoke test\n%%EOF"
    status, body, _ = request(f"/cases/{case_id}/attachments", "POST", content, token,
        {"Content-Type": "application/octet-stream", "X-Filename": "docker-storage-check.pdf"}, False)
    assert status == 201, f"Clean upload: {status} {body.decode()}"
    attachment = json.loads(body)["attachment"]
    assert attachment["scanStatus"] == "clean" and attachment["storageProvider"] == "s3"
    assert "objectKey" not in attachment and "storagePath" not in attachment
    status, downloaded, _ = request(f"/attachments/{attachment['_id']}/download", token=token)
    assert status == 200 and downloaded == content, "S3 round trip"
    print("PASS ClamAV clean upload -> private S3 -> authorized download")

    # EICAR is an inert antivirus test signature, not executable malware.
    eicar = b"X5O!P%@AP[4" + b"\\PZX54(P^)7CC)7}" + b"$EICAR-" + b"STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zipped:
        zipped.writestr("eicar.txt", eicar)
    status, _, _ = request(f"/cases/{case_id}/attachments", "POST", archive.getvalue(), token,
        {"Content-Type": "application/octet-stream", "X-Filename": "scanner-test.docx"}, False)
    assert status == 422, f"Antivirus test should be rejected, received {status}"
    print("PASS ClamAV rejects antivirus test signature inside ZIP")

    status, body, _ = request("/ai/analyze-intake", "POST", {"text": "Em không đăng nhập được tài khoản SIS và cần đặt lại mật khẩu"}, token)
    assert status == 200
    result = json.loads(body)
    assert result["classification"]["label"] == "it_access", result
    print("PASS model-backed intake classification")

    status, _, _ = request("/auth/refresh", "POST", headers={"Origin": "https://attacker.invalid"})
    assert status == 403
    print("PASS cross-site refresh blocked")

    # A separate opener sends the consumed cookie without replacing our current cookie.
    replay_req = urllib.request.Request(base + "/api/auth/refresh", method="POST", headers={"Cookie": f"caseflow_refresh={original}"})
    try:
        urllib.request.urlopen(replay_req, timeout=30)
        raise AssertionError("Replay was accepted")
    except urllib.error.HTTPError as error:
        assert error.code == 401
    status, _, _ = request("/auth/refresh", "POST")
    assert status == 401, "Replacement family should be revoked"
    print("PASS replay revokes refresh family")

    request("/auth/login", "POST", {"organizationSlug": "minh-khai-university", "email": "student@caseflow.local", "password": "Demo123!"})
    status, _, _ = request("/auth/logout", "POST", token="expired-access-token")
    assert status == 200, "Cookie logout with expired access"
    status, _, _ = request("/auth/refresh", "POST")
    assert status == 401, "Logout revoked refresh session"
    print("PASS logout works without valid access token and prevents renewal")


if __name__ == "__main__":
    main()
