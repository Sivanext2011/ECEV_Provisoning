import sys, os
sys.path.insert(0, 'backend')
os.environ['CONFIG_PATH'] = 'config/config.json'

from app.services.catalog import parse_business_config, get_catalog, reload_catalog

result = parse_business_config(open('docs/BusinessConfig_20260721011124011.zip', 'rb').read())
print('Parse result:', result)

cat = get_catalog()
pos = cat.get('productOfferings', [])
print(f'\nPOs: {len(pos)}')
for po in pos:
    rs = po.get('resourceSpecifications', [])
    chars = po.get('characteristics', [])
    print(f'  {po.get("externalId")}: rs={len(rs)}, chars={len(chars)}')
    for r in rs:
        print(f'    RS: {r.get("externalId")} type={r.get("type")}')
