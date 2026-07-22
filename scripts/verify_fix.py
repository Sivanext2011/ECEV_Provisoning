import sys
sys.path.insert(0, 'backend')
from app.services.catalog import parse_business_config, get_catalog

with open('docs/BusinessConfig_20260615014922544.zip', 'rb') as f:
    result = parse_business_config(f.read())
print('Parse result:', result)

cat = get_catalog()
pos = cat.get('productOfferings', [])
print(f'\nPOs: {len(pos)}')
if pos:
    p = pos[0]
    chars = p.get('characteristics', [])
    print(f'PO [{p["name"]}] chars: {len(chars)}')
    for c in chars[:10]:
        print(f'  {c["name"]!r:40} extId={c["externalId"]!r:30} reg={c["valueRegulator"]}')

# Check party spec
ps = cat.get('individualPartySpecifications', [])
print(f'\nParty specs: {len(ps)}')
if ps:
    s = ps[0]
    chars = s.get('characteristics', [])
    print(f'Party [{s["name"]}] chars: {len(chars)}')
    for c in chars[:5]:
        print(f'  {c["name"]!r:40} extId={c["externalId"]!r:30} reg={c["valueRegulator"]}')

# Check contract spec
cs = cat.get('contractSpecifications', [])
print(f'\nContract specs: {len(cs)}')
if cs:
    s = cs[0]
    chars = s.get('characteristics', [])
    print(f'Contract [{s["name"]}] chars: {len(chars)}')
    for c in chars[:5]:
        print(f'  {c["name"]!r:40} extId={c["externalId"]!r:30} reg={c["valueRegulator"]}')
