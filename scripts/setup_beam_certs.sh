#!/bin/bash
set -e

###############################################################################
# ECEV - Generate, Load, and Patch All Certs (Auto-Execute)
#
# This script does everything end-to-end:
# 1. Generates CA + server cert + client cert
# 2. Loads via bamctl
# 3. Patches domain-proxy CA secret
# 4. Restarts domain-proxy
#
# Usage:
#   ./setup_beam_certs.sh [--dry-run]
#
# Options:
#   --dry-run   Only generate certs and JSON files, don't execute bamctl/kubectl
###############################################################################

DRY_RUN=false
[[ "$1" == "--dry-run" ]] && DRY_RUN=true

# === CONFIGURATION ===
BEAM_FQDN="bss-trf.2l3ccaf.ocs.cht.com.tw"
P12_PASS="Ericsson123"
DAYS=365
NAMESPACE="cbev"
OUTPUT_DIR="./beam-certs-$(date +%Y%m%d-%H%M%S)"

run_cmd() {
  echo "  \$ $*"
  if [ "$DRY_RUN" = false ]; then
    eval "$@"
  else
    echo "  [DRY-RUN] skipped"
  fi
}

echo "============================================="
echo " BEAM Certificate Setup"
echo " FQDN: $BEAM_FQDN"
echo " Namespace: $NAMESPACE"
echo " Dry-run: $DRY_RUN"
echo "============================================="

mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"
echo "Output dir: $(pwd)"
echo ""

# ─────────────────────────────────────────────────
# STEP 1: Generate CA
# ─────────────────────────────────────────────────
echo ">>> [1/7] Generating CA..."
openssl ecparam -name prime256v1 -genkey -noout -out ca.key
openssl req -x509 -sha256 -key ca.key -out ca.crt \
  -subj "/OU=Ericsson/CN=beamCA" -days $DAYS
echo "    Done. CN=beamCA"

# ─────────────────────────────────────────────────
# STEP 2: Generate Server Cert + PKCS12
# ─────────────────────────────────────────────────
echo ">>> [2/7] Generating server cert..."
openssl ecparam -name prime256v1 -genkey -noout -out cert.key
openssl req -new -sha256 -key cert.key -out cert.csr \
  -subj "/OU=Ericsson/CN=${BEAM_FQDN}"
openssl x509 -req -in cert.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out cert.crt -days $DAYS -sha256 2>/dev/null

cat cert.key > p12-input.txt
cat cert.crt >> p12-input.txt
openssl pkcs12 -export -in p12-input.txt -out container.p12 -passout pass:${P12_PASS}
base64 container.p12 | tr -d '\n' > bundle-base64.p12
echo "    Done. CN=${BEAM_FQDN}"

# ─────────────────────────────────────────────────
# STEP 3: Generate Client Cert
# ─────────────────────────────────────────────────
echo ">>> [3/7] Generating client cert..."
openssl genrsa -aes256 -passout pass:ericsson -out client.pass.key 4096 2>/dev/null
openssl rsa -passin pass:ericsson -in client.pass.key -out client.key 2>/dev/null
openssl req -new -key client.key -out client.csr \
  -subj "/C=BR/ST=MG/L=Santa Rita do Sapucai/O=Ericsson/OU=Ericsson/CN=${BEAM_FQDN}/emailAddress=beam@ericsson.com"
openssl x509 -req -days $DAYS -in client.csr -CA ca.crt -CAkey ca.key \
  -out client.crt -CAcreateserial 2>/dev/null
echo "    Done. client.crt + client.key"

# ─────────────────────────────────────────────────
# STEP 4: Generate CHA Access Client Cert
# ─────────────────────────────────────────────────
echo ">>> [4/7] Generating CHA access client cert..."
openssl req -new -key client.key -out client-cha-access.csr \
  -subj "/C=BR/ST=MG/L=Santa Rita do Sapucai/O=eric-bss-cha-access-session-mgmt-role:system-writer/OU=Ericsson/CN=${BEAM_FQDN}/emailAddress=beam@ericsson.com"
openssl x509 -req -days $DAYS -in client-cha-access.csr -CA ca.crt -CAkey ca.key \
  -out client-cha-access.crt -CAcreateserial 2>/dev/null
echo "    Done. client-cha-access.crt"

# ─────────────────────────────────────────────────
# STEP 5: Prepare JSON files
# ─────────────────────────────────────────────────
echo ">>> [5/7] Preparing bamctl JSON files..."

# Format CA for JSON
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' ca.crt > ca-oneline.pem
CA_PEM=$(cat ca-oneline.pem)
P12_B64=$(cat bundle-base64.p12)

cat > trusted-cert.json <<EOF
{
  "description": "Trusted certificates for BEAM",
  "certificates": [
    {
      "name": "beam-root-external-trusted-ca-list",
      "certificate": "${CA_PEM}"
    }
  ]
}
EOF

cat > install-key.json <<EOF
{
  "name": "beam-root-trf-key",
  "certificateName": "beam-root-trf-cert",
  "p12": "${P12_B64}",
  "p12Password": "${P12_PASS}"
}
EOF
echo "    Done. trusted-cert.json, install-key.json"

# ─────────────────────────────────────────────────
# STEP 6: Load via bamctl
# ─────────────────────────────────────────────────
echo ">>> [6/7] Loading certs via bamctl..."
echo ""
echo "  Loading trusted CA..."
run_cmd "bamctl cert-management-v3 put-trusted-certificates beam-root-external-trusted-ca-list < trusted-cert.json"
echo ""
echo "  Installing asymmetric keys..."
run_cmd "bamctl cert-management-v3 install-asymmetric-keys-pkcs12 < install-key.json"
echo ""

# ─────────────────────────────────────────────────
# STEP 7: Patch domain-proxy CA secret
# ─────────────────────────────────────────────────
echo ">>> [7/7] Patching domain-proxy CA secret..."

if [ "$DRY_RUN" = false ]; then
  # Get existing CA
  kubectl get secret eric-bss-bam-domain-proxy-ca -n ${NAMESPACE} \
    -o jsonpath='{.data.ca\.crt}' | base64 -d > existing-dp-ca.crt

  # Combine existing + new BEAM CA
  cat existing-dp-ca.crt ca.crt > combined-dp-ca.crt

  # Patch
  COMBINED_B64=$(cat combined-dp-ca.crt | base64 -w0)
  kubectl patch secret eric-bss-bam-domain-proxy-ca -n ${NAMESPACE} \
    --type merge -p "{\"data\":{\"ca.crt\":\"${COMBINED_B64}\"}}"
  echo "    Patched eric-bss-bam-domain-proxy-ca"

  # Restart domain-proxy
  echo "    Restarting domain-proxy..."
  kubectl rollout restart deployment eric-bss-bam-domain-proxy -n ${NAMESPACE}
  kubectl rollout status deployment eric-bss-bam-domain-proxy -n ${NAMESPACE} --timeout=120s
  echo "    Domain-proxy restarted."
else
  echo "  [DRY-RUN] Would patch eric-bss-bam-domain-proxy-ca and restart"
fi

# ─────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────
echo ""
echo "============================================="
echo " COMPLETE"
echo "============================================="
echo ""
echo " Generated files:"
echo "   CA:          $(pwd)/ca.crt"
echo "   CA key:      $(pwd)/ca.key"
echo "   Server cert: $(pwd)/cert.crt"
echo "   Server key:  $(pwd)/cert.key"
echo "   Client cert: $(pwd)/client.crt"
echo "   Client key:  $(pwd)/client.key"
echo "   CHA cert:    $(pwd)/client-cha-access.crt"
echo "   PKCS12:      $(pwd)/container.p12"
echo ""
echo " Copy client.crt and client.key to your local machine for API calls."
echo ""
echo " Test with:"
echo "   TOKEN=\$(curl -k -s -X POST https://eric-sec-access-mgmt.2l3ccaf.ocs.cht.com.tw/auth/realms/master/protocol/openid-connect/token \\"
echo "     -H 'Content-Type: application/x-www-form-urlencoded' \\"
echo "     -d 'grant_type=password&client_id=AuthorizationClient&username=bssadmin&password=BssAdmin@CHT2026!&scope=openid' \\"
echo "     | python3 -c 'import sys,json;print(json.load(sys.stdin)[\"access_token\"])')"
echo ""
echo "   curl -v -k --cert $(pwd)/client.crt --key $(pwd)/client.key \\"
echo "     -H \"Authorization: Bearer \$TOKEN\" \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -H \"ERICSSON.Partition-Id: 1\" \\"
echo "     \"https://${BEAM_FQDN}/bae/bssfIndividualPartyEnquiry/v1/individualParty/?externalId=TEST123\""
echo ""
echo "============================================="
