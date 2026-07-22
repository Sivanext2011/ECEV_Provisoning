import json, zipfile, base64, zlib, sys

ZIP = r'c:/Users/eransva/Downloads/ECEV_Provisning/docs/BusinessConfig_20260721011124011.zip'

with zipfile.ZipFile(ZIP) as z:
    names = z.namelist()
    print("Files in zip:", names)
    rmca = [n for n in names if n.upper().startswith('RMCA_') and n.endswith('.json')]
    if not rmca:
        print("No RMCA JSON found!")
        sys.exit(1)
    data = json.loads(z.read(rmca[0]))

export = data.get('exportData', data)
pos = export.get('productOfferings', [])
print(f"\nTotal POs: {len(pos)}")

USER_REGS = {'mustBePersonalized', 'canBePersonalized', 'selection'}

target = None
for item in pos:
    if isinstance(item, str):
        obj = json.loads(zlib.decompress(base64.b64decode(item + '==')))
    else:
        obj = item
    name = obj.get('name', '') or ''
    extId = obj.get('externalId', '') or ''
    if 'DATA_UNLIMITED' in name.upper() or 'DATA_UNLIMITED' in extId.upper() or 'CHT' in name.upper():
        target = obj
        print(f"\nFound PO: name={name!r} extId={extId!r}")
        break

if not target:
    print("\nPO_DATA_UNLIMITED_CHT not found. Listing all POs:")
    for item in pos:
        if isinstance(item, str):
            obj = json.loads(zlib.decompress(base64.b64decode(item + '==')))
        else:
            obj = item
        print(f"  {obj.get('name')!r} ({obj.get('externalId')!r})")
    sys.exit(0)

versions = target.get('versions', [])
chars = versions[-1].get('characteristics', []) if versions else []
print(f"\nAll chars ({len(chars)} total):")
for c in chars:
    reg = c.get('valueRegulator', '')
    ext = c.get('externalId', '')
    name = c.get('name', '')
    pvs = c.get('possibleValues', [])
    marker = '*** USER ***' if reg in USER_REGS else ''
    print(f"  {name!r:45} extId={ext!r:30} reg={reg} {marker}")
    if pvs:
        for pv in pvs[:2]:
            print(f"    pv keys={list(pv.keys())} val={pv.get('value','')} from={pv.get('valueFrom','')} to={pv.get('valueTo','')}")
