import json, zipfile, base64, zlib

ZIP = r'c:/Users/eransva/Downloads/ECEV_Provisning/docs/BusinessConfig_20260615014922544.zip'
z = zipfile.ZipFile(ZIP)
data = json.loads(z.read('RMCA_20260615014917243.json'))
export = data.get('exportData', data)

print("=== Party Specs ===")
ps_list = export.get('individualPartySpecifications', [])
print(f"Total: {len(ps_list)}")
for s in ps_list[:3]:
    versions = s.get('versions', [])
    chars = versions[-1].get('characteristics', []) if versions else []
    print(f"  [{s.get('name')}] {len(chars)} chars")
    for c in chars[:5]:
        print(f"    name={c.get('name')} extId={repr(c.get('externalId',''))} reg={c.get('valueRegulator')}")

print("\n=== Contract Specs ===")
cs_list = export.get('contractSpecifications', [])
print(f"Total: {len(cs_list)}")
for s in cs_list[:3]:
    versions = s.get('versions', [])
    chars = versions[-1].get('characteristics', []) if versions else []
    print(f"  [{s.get('name')}] {len(chars)} chars")
    for c in chars[:5]:
        print(f"    name={c.get('name')} extId={repr(c.get('externalId',''))} reg={c.get('valueRegulator')}")

print("\n=== Product Offerings (first 3) ===")
pos = export.get('productOfferings', [])
for item in pos[:3]:
    if isinstance(item, str):
        obj = json.loads(zlib.decompress(base64.b64decode(item + '==')))
    else:
        obj = item
    versions = obj.get('versions', [])
    chars = versions[-1].get('characteristics', []) if versions else []
    print(f"  [{obj.get('name')}] {len(chars)} chars")
    for c in chars[:5]:
        print(f"    name={c.get('name')} extId={repr(c.get('externalId',''))} reg={c.get('valueRegulator')}")
