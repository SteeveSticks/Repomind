"""Temporary probe. Do not print secrets."""

import os
from pathlib import Path

import requests

env_path = Path(__file__).with_name(".env")
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if not line or line.strip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value

url = "https://codeload.github.com/TheAlgorithms/Python/tar.gz/HEAD"
base = {"User-Agent": "RepoMind"}
token = os.environ.get("GITHUB_TOKEN", "")
print("token_set", bool(token), "prefix", token[:11], "len", len(token))

cases = (
    ("noauth", base),
    ("bearer", {**base, "Authorization": f"Bearer {token}"}),
    ("token_scheme", {**base, "Authorization": f"token {token}"}),
)
for label, headers in cases:
    response = requests.get(
        url, headers=headers, stream=True, timeout=30, allow_redirects=False
    )
    print(
        label,
        "status",
        response.status_code,
        "ctype",
        (response.headers.get("content-type") or "")[:50],
        "loc",
        (response.headers.get("location") or "")[:90],
    )
    response.close()

api = "https://api.github.com/repos/TheAlgorithms/Python"
api_cases = (
    ("api_noauth", {**base, "Accept": "application/vnd.github+json"}),
    (
        "api_bearer",
        {
            **base,
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
        },
    ),
)
for label, headers in api_cases:
    response = requests.get(api, headers=headers, timeout=30)
    size = private = branch = None
    message = ""
    if (response.headers.get("content-type") or "").startswith("application/json"):
        body = response.json()
        size = body.get("size")
        private = body.get("private")
        branch = body.get("default_branch")
        message = str(body.get("message") or "")[:80]
    print(
        label,
        "status",
        response.status_code,
        "size_kb",
        size,
        "private",
        private,
        "branch",
        branch,
        "msg",
        message,
    )
