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
curl -fsS -X PUT "$api/artist/schedule" -H "Authorization: Bearer $artist_token" -H 'Content-Type: application/json' \
  -d '{"timezone":"Europe/Berlin","slots":[{"weekday":0,"start":"10:00","end":"18:00"},{"weekday":2,"start":"11:00","end":"17:00"}]}' > "$tmp/schedule.json"
curl -fsS "$api/artists/smoke-artist/schedule" > "$tmp/public-schedule.json"
python3 - "$tmp/public-schedule.json" <<'PY'
import json,sys
j=json.load(open(sys.argv[1]))
assert j["timezone"]=="Europe/Berlin" and len(j["slots"])==2,j
PY
monday="$(python3 - <<'PY'
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
now=datetime.now(ZoneInfo("Europe/Berlin")).date()
date=now+timedelta(days=(7-now.weekday())%7 or 7)
print(date.isoformat())
PY
)"
python3 - "$monday" "$tmp/valid-session.json" "$tmp/invalid-session.json" <<'PY'
import json,sys
date=sys.argv[1]
body={"kind":"session","client_name":"Smoke Guest","contact_email":"","contact_channels":{"telegram":"@test_client"},"description":"Synthetic guest schedule request for a blackwork tattoo.","answers":{},"consent_to_contact":True,
  "availability_preferences":[{"date_from":date,"date_to":date,"time_from":"13:00","time_to":"15:00"}]}
open(sys.argv[2],"w").write(json.dumps(body))
body["availability_preferences"][0]["time_from"]="08:00"
open(sys.argv[3],"w").write(json.dumps(body))
PY
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$api/artists/smoke-artist/requests" -H 'Content-Type: application/json' --data-binary "@$tmp/invalid-session.json")" = "400"
curl -fsS -X POST "$api/artists/smoke-artist/requests" -H 'Content-Type: application/json' --data-binary "@$tmp/valid-session.json" > "$tmp/session-request.json"
session_id="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["id"])' "$tmp/session-request.json")"
curl -fsS "$api/artist/requests/$session_id" -H "Authorization: Bearer $artist_token" > "$tmp/session-detail.json"
python3 - "$tmp/session-detail.json" <<'PY'
import json,sys
j=json.load(open(sys.argv[1]))
assert len(j["availability_preferences"])==1,j
assert j["availability_preferences"][0]["time_from"]=="13:00",j
assert j["availability_timezone"]=="Europe/Berlin",j
PY

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
# Sign-in respects the selected portal; the wrong role must not receive a session.
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"smoke-client@example.invalid","password":"very-long-test-password","expected_role":"artist"}')" = "403"
curl -fsS -X POST "$api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"smoke-client@example.invalid","password":"very-long-test-password","expected_role":"client"}' > "$tmp/client-login.json"
python3 - "$tmp/client-login.json" <<'PY'
import json,sys
assert json.load(open(sys.argv[1]))['user']['role']=='client'
PY
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"smoke-artist@example.invalid","password":"very-long-test-password","expected_role":"client"}')" = "403"

claim_token="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["claim_token"])' "$tmp/request.json")"
curl -fsS -X POST "$api/client/requests/$id/claim" -H "Authorization: Bearer $client_token" -H 'Content-Type: application/json' \
  -d "{\"claim_token\":\"$claim_token\"}" >/dev/null
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$api/client/requests/$id/claim" -H "Authorization: Bearer $client_token" -H 'Content-Type: application/json' -d "{\"claim_token\":\"$claim_token\"}")" = "404"

curl -fsS -X POST "$api/artists/smoke-artist/requests" -H "Authorization: Bearer $client_token" -H 'Content-Type: application/json' \
  -d '{"kind":"consultation","client_name":"","contact_email":"","contact_channels":{},"description":"A synthetic account client tattoo request.","answers":{},"preferred_at":null,"consent_to_contact":true}' >/dev/null
curl -fsS "$api/client/requests" -H "Authorization: Bearer $client_token" > "$tmp/client-list.json"
python3 - "$tmp/client-list.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
assert len(d)==2 and all(x['artist_name']=='Smoke Artist' for x in d)
print(d[0]['id'])
PY
client_request_id="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))[0]["id"])' "$tmp/client-list.json")"
curl -fsS "$api/client/requests/$client_request_id" -H "Authorization: Bearer $client_token" > "$tmp/client-detail.json"
python3 - "$tmp/client-detail.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
assert d['client_name']=='Smoke Client',d
PY
test "$(curl -s -o /dev/null -w '%{http_code}' "$api/client/requests/$client_request_id" -H "Authorization: Bearer $artist_token")" = "403"
curl -fsS -o /dev/null -X PATCH "$api/artist/requests/$id" -H "Authorization: Bearer $artist_token" -H 'Content-Type: application/json' -d '{"status":"in_review"}'
curl -fsS -o /dev/null -X DELETE "$api/artist/requests/$id" -H "Authorization: Bearer $artist_token"
test "$(curl -s -o /dev/null -w '%{http_code}' "$api/artist/requests/$id" -H "Authorization: Bearer $artist_token")" = "404"
echo "Smoke passed: work schedule, date validation, guest claim, permissions, file and request management"
