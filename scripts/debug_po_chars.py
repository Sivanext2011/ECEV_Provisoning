import json, zipfile, base64, zlib

ZIP = r'c:/Users/eransva/Downloads/ECEV_Provisning/docs/BusinessConfig_20260615014922544.zip'
z = zipfile.ZipFile(ZIP)
data = json.loads(z.read('RMCA_20260615014917243.json'))
export = data.get('exportData', data)

USER_REGS = {'mustBePersonalized', 'canBePersonalized', 'selection'}

pos = export.get('productOfferings', [])
found = 0
for item in pos:
    if isinstance(item, str):
        obj = json.loads(zlib.decompress(base64.b64decode(item + '==')))
    else:
        obj = item
    versions = obj.get('versions', [])
    chars = versions[-1].get('characteristics', []) if versions else []
    user_chars = [c for c in chars if c.get('valueRegulator') in USER_REGS]
    if user_chars:
        print(f"\nPO [{obj.get('name')}] ({obj.get('externalId')}) - {len(user_chars)} user chars:")
        for c in user_chars[:8]:
            print(f"  name={c.get('name')!r:40} extId={c.get('externalId','')!r:20} id={c.get('id','')[:16]} reg={c.get('valueRegulator')}")
        found += 1
        if found >= 5:
            break

if not found:
    print("No POs with user-facing chars found!")
    # Show all regs present
    regs = set()
    for item in pos[:10]:
        if isinstance(item, str):
            obj = json.loads(zlib.decompress(base64.b64decode(item + '==')))
        else:
            obj = item
        for v in obj.get('versions', []):
            for c in v.get('characteristics', []):
                regs.add(c.get('valueRegulator'))
    print("All valueRegulator values in POs:", regs)
