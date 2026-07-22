import sys
sys.path.insert(0, 'backend')
from app.services.catalog import parse_business_config, get_catalog

with open('docs/BusinessConfig_20260721011124011.zip', 'rb') as f:
    result = parse_business_config(f.read())
print('Parse result:', result)

cat = get_catalog()
for po in cat.get('productOfferings', []):
    if po.get('externalId') == 'PO_DATA_UNLIMITED_CHT':
        chars = po.get('characteristics', [])
        print(f"\nPO_DATA_UNLIMITED_CHT: {len(chars)} chars")
        for c in chars:
            print(f"  {c['name']!r:45} extId={c['externalId']!r:35} reg={c['valueRegulator']}")
            if c.get('possibleValues'):
                for pv in c['possibleValues']:
                    print(f"    pv: name={pv['name']!r} value={pv['value']!r} default={pv['default']}")
            if c.get('valueFrom'):
                print(f"    range: {c['valueFrom']} - {c['valueTo']} {c.get('unitOfMeasure','')}")
        break
