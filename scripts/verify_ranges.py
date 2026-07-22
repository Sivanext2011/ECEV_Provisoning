import sys, json
sys.path.insert(0, 'backend')
from app.services.catalog import parse_business_config, get_catalog

with open('docs/BusinessConfig_20260615014922544.zip', 'rb') as f:
    parse_business_config(f.read())

cat = get_catalog()
cs = cat.get('contractSpecifications', [])
if cs:
    for c in cs[0].get('characteristics', []):
        if c.get('valueFrom') or c.get('possibleValues'):
            print(f"Char: {c['name']}")
            print(f"  defaultValue: {c['defaultValue']}")
            print(f"  valueFrom: {c.get('valueFrom','')}, valueTo: {c.get('valueTo','')}, unit: {c.get('unitOfMeasure','')}")
            print(f"  possibleValues: {c.get('possibleValues',[])}")
            print()
