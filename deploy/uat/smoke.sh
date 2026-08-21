#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: smoke.sh BASE_URL" >&2
  exit 64
fi

base_url="${1%/}"
[[ "$base_url" =~ ^https?://[^/]+$ ]] || { echo "BASE_URL must be one explicit HTTP(S) origin" >&2; exit 64; }
curl_options=(--fail-with-body --silent --show-error --max-time 10)
if [[ "${SMOKE_INSECURE_TLS:-0}" == "1" ]]; then curl_options+=(--insecure); fi
if [[ -n "${SMOKE_HOST_HEADER:-}" ]]; then
  [[ "$SMOKE_HOST_HEADER" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "SMOKE_HOST_HEADER is invalid" >&2; exit 64; }
  curl_options+=(--header "Host: ${SMOKE_HOST_HEADER}")
fi

expect_json_status() {
  local path="$1" expected="$2"
  local body
  body="$(curl "${curl_options[@]}" "${base_url}${path}")"
  [[ "$body" == "{\"status\":\"${expected}\"}" ]] || { echo "unexpected bounded status from $path" >&2; exit 1; }
}

expect_http_status() {
  local path="$1" expected="$2"
  local actual
  actual="$(curl "${curl_options[@]}" --output /dev/null --write-out '%{http_code}' "${base_url}${path}" 2>/dev/null || true)"
  [[ "$actual" == "$expected" ]] || { echo "$path returned $actual, expected $expected" >&2; exit 1; }
}

expect_json_status /api/health/live live
expect_json_status /api/health/ready ready
expect_http_status /api/auth/oidc/start 404
expect_http_status /api/auth/oidc/fixture 404
expect_http_status /api/auth/oidc/callback 404
expect_http_status /api/auth/recent/oidc/start 404
expect_http_status /api/auth/recent/oidc/callback 404

protected_status="$(curl "${curl_options[@]}" --output /dev/null --write-out '%{http_code}' "${base_url}/crm" 2>/dev/null || true)"
if [[ "$protected_status" != "302" && "$protected_status" != "303" && "$protected_status" != "307" ]]; then
  protected_body="$(curl "${curl_options[@]}" "${base_url}/crm")"
  [[ "$protected_status" == "200" && "$protected_body" == *'url=/login?next=/crm'* ]] || { echo "protected CRM route did not redirect unauthenticated access" >&2; exit 1; }
fi

echo "bounded private-rehearsal smoke passed for $base_url"
