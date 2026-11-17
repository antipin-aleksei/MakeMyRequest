#!/usr/bin/env bash
set -euo pipefail
# Run only on disposable development data.
: "${API_URL:=http://localhost:8080}"
: "${ADMIN_TOKEN:?Set ADMIN_TOKEN to match your local API}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsS "$API_URL/health" > "$tmp/health.json"
curl -fsS "$API_URL/api/v1/artist" > "$tmp/artist.json"
status="$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/api/v1/admin/requests")"
test "$status" = "401" || { echo "expected unauthorized, got $status"; exit 1; }

curl -fsS -X POST "$API_URL/api/v1/requests" -H 'Content-Type: application/json' \
  -d '{"kind":"consultation","client_name":"Smoke Test","contact_email":"smoke@example.invalid","description":"A synthetic test tattoo request for the test database.","answers":{"style":"blackwork"},"preferred_at":null,"consent_to_contact":true}' > "$tmp/request.json"

read -r id token < <(python3 -c 'import json,sys; j=json.load(open(sys.argv[1])); print(j["id"],j["upload_token"])' "$tmp/request.json")
# Minimal PNG image test fixture.
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/BqkAAAAASUVORK5CYII=' | base64 -d > "$tmp/test.png"
curl -fsS -X POST "$API_URL/api/v1/requests/$id/attachments" -H "x-upload-token: $token" -F "file=@$tmp/test.png;type=image/png" > "$tmp/attachment.json"
curl -fsS "$API_URL/api/v1/admin/requests/$id" -H "Authorization: Bearer $ADMIN_TOKEN" > "$tmp/detail.json"
python3 - "$tmp/detail.json" <<'PY'
import json,sys
j=json.load(open(sys.argv[1]))
assert len(j["attachments"]) == 1, j
assert j["client_name"] == "Smoke Test", j
PY
curl -fsS -o /dev/null -X PATCH "$API_URL/api/v1/admin/requests/$id" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"status":"in_review"}'
echo "Smoke passed: request, attachment, admin permission and status. id=$id"
