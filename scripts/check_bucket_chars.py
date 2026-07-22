import sys
sys.path.insert(0, 'backend')
from app.services.catalog import get_catalog

cat = get_catalog()
for po in cat.get('productOfferings', []):
    if po.get('externalId') == 'PO_DATA_UNLIMITED_CHT':
        for c in po.get('characteristics', []):
            if c['name'] in ('Initial', 'Min', 'Max', 'FUP', 'FUPThershold_notification'):
                import json
                print(json.dumps(c, indent=2))
        break
