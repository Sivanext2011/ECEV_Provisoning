#!/bin/bash
set -e

###############################################################################
# ECEV - Generate and Load External Certificates for BSSF/BAE
#
# This script:
# 1. Generates a CA (beamCA)
# 2. Generates server cert + PKCS12 bundle for BEAM ingress
# 3. Generates client cert signed by the same CA
# 4. Loads trusted CA + asymmetric keys via bamctl for all microservices
#
# Usage:
#   ./generate_and_load_certs.sh
#
# Prerequisites:
#   - openssl installed
#   - bamctl available and configured
#   - kubectl access to the cluster
###############################################################################

# === CONFIGURATION ===
BEAM_FQDN="bss-trf.2l3ccaf.ocs.cht.com.tw"
CERTM_FQDN="eric-sec-certm-rbac-proxy"  # Update if different
P12_PASS="Ericsson123"
DAYS=365
OUTPUT_DIR="./beam-certs-$(date +%Y%m%d-%H%M%S)"
NAMESPACE="cbev"

# Microservices that need the trusted CA loaded
MICROSERVICES=(
  "beam-root"
)

# === DO NOT EDIT BELOW ===
mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"
echo "============================================="
echo "Working directory: $(pwd)"
echo "BEAM FQDN: $BEAM_FQDN"
echo "============================================="

###############################################################################
# STEP 1: Generate CA
###############################################################################
echo ""
echo ">>> [1/6] Generating CA..."
openssl ecparam -name prime256v1 -genkey -noout -out ca.key
openssl req -x509 -sha256 -key ca.key -out ca.crt \
  -subj "/OU=Ericsson/CN=beamCA" -days $DAYS

echo "    CA generated: ca.key, ca.crt"
openssl x509 -in ca.crt -noout -subject -dates

###############################################################################
# STEP 2: Generate Server Certificate + PKCS12 Bundle
###############################################################################
echo ""
echo ">>> [2/6] Generating server certificate..."
openssl ecparam -name prime256v1 -genkey -noout -out cert.key

openssl req -new -sha256 -key cert.key -out cert.csr \
  -subj "/OU=Ericsson/CN=${BEAM_FQDN}"

openssl x509 -req -in cert.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out cert.crt -days $DAYS -sha256

echo "    Server cert generated: cert.key, cert.crt"
openssl x509 -in cert.crt -noout -subject

# Create PKCS12 bundle
cat cert.key > p12-input.txt
cat cert.crt >> p12-input.txt
openssl pkcs12 -export -in p12-input.txt -out container.p12 -passout pass:${P12_PASS}
base64 container.p12 | tr -d '\n' > bundle-base64.p12
echo "    PKCS12 bundle generated: container.p12, bundle-base64.p12"

###############################################################################
# STEP 3: Generate Client Certificate
###############################################################################
echo ""
echo ">>> [3/6] Generating client certificate..."
openssl genrsa -aes256 -passout pass:ericsson -out client.pass.key 4096 2>/dev/null
openssl rsa -passin pass:ericsson -in client.pass.key -out client.key 2>/dev/null

openssl req -new -key client.key -out client.csr \
  -subj "/C=BR/ST=MG/L=Santa Rita do Sapucai/O=Ericsson/OU=Ericsson/CN=${BEAM_FQDN}/emailAddress=beam@ericsson.com"

openssl x509 -req -days $DAYS -in client.csr -CA ca.crt -CAkey ca.key \
  -out client.crt -CAcreateserial 2>/dev/null

echo "    Client cert generated: client.key, client.crt"
openssl x509 -in client.crt -noout -subject

###############################################################################
# STEP 4: Generate CHA Access Client Certificate (special O= field)
###############################################################################
echo ""
echo ">>> [4/6] Generating CHA access client certificate..."
openssl req -new -key client.key -out client-cha-access.csr \
  -subj "/C=BR/ST=MG/L=Santa Rita do Sapucai/O=eric-bss-cha-access-session-mgmt-role:system-writer/OU=Ericsson/CN=${BEAM_FQDN}/emailAddress=beam@ericsson.com"

openssl x509 -req -days $DAYS -in client-cha-access.csr -CA ca.crt -CAkey ca.key \
  -out client-cha-access.crt -CAcreateserial 2>/dev/null

echo "    CHA access cert generated: client-cha-access.crt"

###############################################################################
# STEP 5: Prepare bamctl JSON files
###############################################################################
echo ""
echo ">>> [5/6] Preparing bamctl JSON input files..."

# Format CA cert for JSON (single line with \n)
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' ca.crt > ca-oneline.pem

CA_PEM_CONTENT=$(cat ca-oneline.pem)
P12_CONTENT=$(cat bundle-base64.p12)

# Trusted cert JSON for beam-root
cat > trusted-cert-beam-root.json <<EOF
{
  "description": "Trusted certificates for BEAM",
  "certificates": [
    {
      "name": "beam-root-external-trusted-ca-list",
      "certificate": "${CA_PEM_CONTENT}"
    }
  ]
}
EOF

# Asymmetric key JSON for beam-root
cat > install-key-beam-root.json <<EOF
{
  "name": "beam-root-trf-key",
  "certificateName": "beam-root-trf-cert",
  "p12": "${P12_CONTENT}",
  "p12Password": "${P12_PASS}"
}
EOF

echo "    Generated: trusted-cert-beam-root.json"
echo "    Generated: install-key-beam-root.json"

###############################################################################
# STEP 6: Print bamctl commands
###############################################################################
echo ""
echo ">>> [6/6] bamctl commands to execute:"
echo ""
echo "============================================="
echo "  LOAD CERTIFICATES VIA BAMCTL"
echo "============================================="
echo ""
echo "# 1. Load trusted CA for BEAM root:"
echo "bamctl cert-management-v3 put-trusted-certificates beam-root-external-trusted-ca-list < trusted-cert-beam-root.json"
echo ""
echo "# 2. Install asymmetric keys for BEAM root:"
echo "bamctl cert-management-v3 install-asymmetric-keys-pkcs12 < install-key-beam-root.json"
echo ""
echo "============================================="
echo "  PATCH DOMAIN-PROXY CA SECRET (add beamCA)"
echo "============================================="
echo ""
echo "# 3. Add beamCA to domain-proxy trusted CAs:"
echo "kubectl get secret eric-bss-bam-domain-proxy-ca -n ${NAMESPACE} -o jsonpath='{.data.ca\\.crt}' | base64 -d > /tmp/existing-dp-ca.crt"
echo "cat /tmp/existing-dp-ca.crt $(pwd)/ca.crt > /tmp/combined-dp-ca.crt"
echo "COMBINED_B64=\$(cat /tmp/combined-dp-ca.crt | base64 -w0)"
echo "kubectl patch secret eric-bss-bam-domain-proxy-ca -n ${NAMESPACE} --type merge -p \"{\\\"data\\\":{\\\"ca.crt\\\":\\\"\${COMBINED_B64}\\\"}}\""
echo ""
echo "# 4. Restart domain-proxy:"
echo "kubectl rollout restart deployment eric-bss-bam-domain-proxy -n ${NAMESPACE}"
echo ""
echo "============================================="
echo "  COPY CLIENT CERTS TO YOUR MACHINE"
echo "============================================="
echo ""
echo "# Client cert and key for API calls:"
echo "  $(pwd)/client.crt"
echo "  $(pwd)/client.key"
echo ""
echo "# CHA access cert (for eric-bss-cha-access):"
echo "  $(pwd)/client-cha-access.crt"
echo ""
echo "# CA cert (for --cacert):"
echo "  $(pwd)/ca.crt"
echo ""
echo "============================================="
echo "  TEST CURL COMMAND"
echo "============================================="
echo ""
echo "curl -v -k --cert $(pwd)/client.crt --key $(pwd)/client.key \\"
echo "  -X GET \"https://${BEAM_FQDN}/bae/bssfIndividualPartyEnquiry/v1/individualParty/?externalId=TEST123\" \\"
echo "  -H \"Authorization: Bearer \$TOKEN\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -H \"ERICSSON.Partition-Id: 1\""
echo ""
echo "============================================="
echo "  OPTIONAL: Create K8s secret from client cert"
echo "============================================="
echo ""
echo "kubectl create secret generic beam-root-ingress-trf-client-cert \\"
echo "  --from-file=cert.pem=$(pwd)/client.crt \\"
echo "  --from-file=key.pem=$(pwd)/client.key \\"
echo "  -n ${NAMESPACE}"
echo ""
echo "============================================="
echo ""
echo "All files generated in: $(pwd)"
ls -la
echo ""
echo "Done."
