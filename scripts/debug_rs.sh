#!/bin/bash
CONTAINER=$(docker ps --format '{{.Names}}' | grep backend | head -1)
echo "=== Container: $CONTAINER ==="

echo ""
echo "=== PO resourceSpecifications in catalog.json ==="
docker exec $CONTAINER python3 -c "
import json
cat = json.load(open('/app/config/catalog.json'))
for po in cat.get('productOfferings', []):
    rs = po.get('resourceSpecifications', [])
    print(f\"PO: {po.get('externalId','(no extId)')} | RS count: {len(rs)}\")
    for r in rs:
        print(f\"  RS: {r.get('externalId','')} | type: {r.get('type','')} | id: {r.get('id','')}\")
"

echo ""
echo "=== PS resourceSpecifications in catalog.json ==="
docker exec $CONTAINER python3 -c "
import json
cat = json.load(open('/app/config/catalog.json'))
for ps in cat.get('productSpecifications', []):
    rs = ps.get('resourceSpecifications', [])
    print(f\"PS: {ps.get('externalId','(no extId)')} | RS count: {len(rs)}\")
    for r in rs:
        print(f\"  RS: {r.get('externalId','')} | id: {r.get('id','')}\")
"

echo ""
echo "=== Catalog-level resourceSpecifications ==="
docker exec $CONTAINER python3 -c "
import json
cat = json.load(open('/app/config/catalog.json'))
for rs in cat.get('resourceSpecifications', []):
    print(f\"RS: {rs.get('externalId','')} | id: {rs.get('id','')} | rsType: {rs.get('rsType','')} | type: {rs.get('type','')}\")
"
