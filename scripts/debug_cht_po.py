import json, zipfile, base64, zlib

ZIP = r'c:/Users/eransva/Downloads/ECEV_Provisning/docs/BusinessConfig_20260721011124011.zip'
with zipfile.ZipFile(ZIP) as z:
    data = json.loads(z.read('RMCA_20260721011114595.json'))

export = data.get('exportData', data)
pos = export.get('productOfferings', [])

USER_REGS = {'mustBePersonalized', 'canBePersonalized', 'selection'}

for item in pos:
    if isinstance(item, str):
        obj = json.loads(zlib.decompress(base64.b64decode(item + '==')))
    else:
        obj = item
    if obj.get('externalId') == 'PO_DATA_UNLIMITED_CHT':
        versions = obj.get('versions', [])
        chars = versions[-1].get('characteristics', []) if versions else []
        print(f"PO: {obj.get('name')} ({obj.get('externalId')})")
        print(f"Total chars: {len(chars)}")
        print(f"User-facing chars: {sum(1 for c in chars if c.get('valueRegulator') in USER_REGS)}")
        print()
        for c in chars:
            reg = c.get('valueRegulator', '')
            if reg not in USER_REGS:
                continue
            ext = c.get('externalId', '')
            name = c.get('name', '')
            pvs = c.get('possibleValues', [])
            print(f"  CHAR: {name!r}")
            print(f"    externalId={ext!r}  reg={reg}  valueType={c.get('valueType')}")
            print(f"    possibleValues ({len(pvs)}):")
            for pv in pvs:
                print(f"      {json.dumps(pv)}")
        break
