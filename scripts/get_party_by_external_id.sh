#!/bin/bash
# Get Party by External ID
# Usage: ./get_party_by_external_id.sh <partyExternalId>

CERT_DIR="/mnt/c/Users/eransva/Downloads/ECEV_Provisning/config/certs"
PARTY_EXT_ID="${1:-YOUR_PARTY_EXTERNAL_ID}"

# Fetch token
TOKEN=$(curl -k \
  --cert "$CERT_DIR/client.crt" \
  --key "$CERT_DIR/client.key" \
  --cacert "$CERT_DIR/ca.crt" \
  -s -X POST \
  'https://eric-sec-access-mgmt.2l3ccaf.ocs.cht.com.tw/auth/realms/master/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password&client_id=AuthorizationClient&username=bssadmin&password=BssAdmin@CHT2026!&scope=openid' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

# Get Party
curl -k \
  --cert "$CERT_DIR/client.crt" \
  --key "$CERT_DIR/client.key" \
  --cacert "$CERT_DIR/ca.crt" \
  -X GET \
  "https://bss-trf.2l3ccaf.ocs.cht.com.tw/bae/bssfIndividualPartyEnquiry/v1/individualParty/?externalId=$PARTY_EXT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json'
