#!/usr/bin/env bash
set -euo pipefail
API_URL="$(printenv API_URL || printf 'http://127.0.0.1:8080')"
api="$API_URL/api/v1"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsS "$API_URL/health" >/dev/null
curl -fsS -X POST "$api/auth/register" -H 'Content-Type: application/json' \
  -d '{"display_name":"Smoke Artist","email":"smoke-artist@example.invalid","password":"very-long-test-password","role":"artist","preferred_language":"en"}' > "$tmp/artist.json"
artist_token="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["token"])' "$tmp/artist.json")"
curl -fsS -X PUT "$api/artist/me" -H "Authorization: Bearer $artist_token" -H 'Content-Type: application/json' \
  -d '{"slug":"smoke-artist","display_name":"Smoke Artist","bio":"Synthetic artist","city":"Berlin","contact_channels":{},"accepting_requests":true}' >/dev/null
curl -fsS "$api/artists/smoke-artist" >/dev/null
curl -fsS -X POST "$api/artists/smoke-artist/requests" -H 'Content-Type: application/json' \
  -d '{"kind":"consultation","client_name":"Smoke Guest","contact_email":"","contact_channels":{"telegram":"@test_client"},"description":"Synthetic floral tattoo request for the right forearm.","answers":{"style":"blackwork","width_cm":5,"height_cm":7},"preferred_at":null,"consent_to_contact":true}' > "$tmp/request.json"
read -r id upload < <(python3 -c 'import json,sys;j=json.load(open(sys.argv[1]));print(j["id"],j["upload_token"])' "$tmp/request.json")
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/BqkAAAAASUVORK5CYII=' | base64 -d > "$tmp/ref.png"
curl -fsS -X POST "$api/requests/$id/attachments" -H "x-upload-token: $upload" -F "file=@$tmp/ref.png;type=image/png" > "$tmp/file.json"
file_id="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["id"])' "$tmp/file.json")"
test "$(curl -s -o /dev/null -w '%{http_code}' "$api/artist/requests")" = "401"
test "$(curl -s -o /dev/null -w '%{http_code}' "$api/attachments/$file_id")" = "401"
curl -fsS "$api/artist/requests/$id" -H "Authorization: Bearer $artist_token" > "$tmp/detail.json"
python3 - "$tmp/detail.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
assert d['contact_channels']['telegram']=='@test_client'
assert len(d['attachments'])==1
PY
curl -fsS "$api/attachments/$file_id" -H "Authorization: Bearer $artist_token" > "$tmp/download.png"
cmp "$tmp/ref.png" "$tmp/download.png"
curl -fsS -X POST "$api/auth/register" -H 'Content-Type: application/json' \
  -d '{"display_name":"Other Artist","email":"other-artist@example.invalid","password":"very-long-test-password","role":"artist","preferred_language":"ru"}' > "$tmp/other.json"
other_token="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["token"])' "$tmp/other.json")"
test "$(curl -s -o /dev/null -w '%{http_code}' "$api/artist/requests/$id" -H "Authorization: Bearer $other_token")" = "404"
test "$(curl -s -o /dev/null -w '%{http_code}' "$api/attachments/$file_id" -H "Authorization: Bearer $other_token")" = "404"
curl -fsS -X POST "$api/auth/register" -H 'Content-Type: application/json' \
  -d '{"display_name":"Smoke Client","email":"smoke-client@example.invalid","password":"very-long-test-password","role":"client","preferred_language":"sr"}' > "$tmp/client.json"
client_token="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["token"])' "$tmp/client.json")"
curl -fsS -X POST "$api/artists/smoke-artist/requests" -H "Authorization: Bearer $client_token" -H 'Content-Type: application/json' \
  -d '{"kind":"consultation","client_name":"","contact_email":"","contact_channels":{},"description":"A synthetic account client tattoo request.","answers":{},"preferred_at":null,"consent_to_contact":true}' >/dev/null
curl -fsS "$api/client/requests" -H "Authorization: Bearer $client_token" > "$tmp/client-list.json"
python3 - "$tmp/client-list.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
assert len(d)==1 and d[0]['artist_name']=='Smoke Artist'
PY
curl -fsS -o /dev/null -X PATCH "$api/artist/requests/$id" -H "Authorization: Bearer $artist_token" -H 'Content-Type: application/json' -d '{"status":"in_review"}'
curl -fsS -o /dev/null -X DELETE "$api/artist/requests/$id" -H "Authorization: Bearer $artist_token"
test "$(curl -s -o /dev/null -w '%{http_code}' "$api/artist/requests/$id" -H "Authorization: Bearer $artist_token")" = "404"
echo "MVP v2 smoke passed: registration, profile, enquiry, image, tenant isolation, client inbox, status, deletion"
