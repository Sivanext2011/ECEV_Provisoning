import json, zipfile, base64, zlib

ZIP = r'c:/Users/eransva/Downloads/ECEV_Provisning/docs/BusinessConfig_20260615014922544.zip'
z = zipfile.ZipFile(ZIP)
data = json.loads(z.read('RMCA_20260615014917243.json'))
export = data.get('exportData', data)

# Check contract spec chars in detail
for s in export.get('contractSpecifications', []):
    versions = s.get('versions', [])
    chars = versions[-1].get('characteristics', []) if versions else []
    print(f"=== Contract Spec: {s.get('name')} ===")
    for c in chars:
        pvs = c.get('possibleValues', [])
        if pvs:
            print(f"\n  Char: {c.get('name')} | extId={c.get('externalId')} | reg={c.get('valueRegulator')} | type={c.get('valueType')}")
            for pv in pvs:
                print(f"    PV keys: {list(pv.keys())}")
                print(f"    PV: {json.dumps(pv)}")

# Also check party spec
for s in export.get('individualPartySpecifications', []):
    versions = s.get('versions', [])
    chars = versions[-1].get('characteristics', []) if versions else []
    print(f"\n=== Party Spec: {s.get('name')} ===")
    for c in chars:
        pvs = c.get('possibleValues', [])
        if pvs:
            print(f"\n  Char: {c.get('name')} | extId={c.get('externalId')} | reg={c.get('valueRegulator')} | type={c.get('valueType')}")
            for pv in pvs:
                print(f"    PV keys: {list(pv.keys())}")
                print(f"    PV: {json.dumps(pv)}")
