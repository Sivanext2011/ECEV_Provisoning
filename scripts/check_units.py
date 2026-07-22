import json, zipfile, base64, zlib

ZIP = r'c:/Users/eransva/Downloads/ECEV_Provisning/docs/BusinessConfig_20260721011124011.zip'
with zipfile.ZipFile(ZIP) as z:
    data = json.loads(z.read('RMCA_20260721011114595.json'))

export = data.get('exportData', data)
ps_map = {ps['id']: ps for ps in export.get('productSpecifications', [])}
TARGET = {'Initial', 'Min', 'Max', 'FUP', 'FUPThershold_notification'}

pos = export.get('productOfferings', [])
for item in pos:
    if isinstance(item, str):
        obj = json.loads(zlib.decompress(base64.b64decode(item + '==')))
    else:
        obj = item
    if obj.get('externalId') != 'PO_DATA_UNLIMITED_CHT':
        continue

    versions = obj.get('versions', [])
    chars = versions[-1].get('characteristics', []) if versions else []
    for c in chars:
        if c.get('name') not in TARGET:
            continue
        print(f"Char: {c['name']}")
        print(f"  char.unitOfMeasure = {c.get('unitOfMeasure')!r}")
        print(f"  char.valueType = {c.get('valueType')!r}")
        for pv in c.get('possibleValues', []):
            print(f"  PV name={pv.get('name')!r} unitOfMeasure={pv.get('unitOfMeasure')!r} default={pv.get('default')} value={pv.get('value')!r} id={pv.get('id','')[:16]}")
    break
