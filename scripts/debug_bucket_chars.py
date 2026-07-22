import json, zipfile, base64, zlib

ZIP = r'c:/Users/eransva/Downloads/ECEV_Provisning/docs/BusinessConfig_20260721011124011.zip'
with zipfile.ZipFile(ZIP) as z:
    data = json.loads(z.read('RMCA_20260721011114595.json'))

export = data.get('exportData', data)
ps_map = {ps['id']: ps for ps in export.get('productSpecifications', [])}

TARGET_NAMES = {'Initial', 'Min', 'Max', 'FUP', 'FUPThershold_notification'}

pos = export.get('productOfferings', [])
for item in pos:
    if isinstance(item, str):
        obj = json.loads(zlib.decompress(base64.b64decode(item + '==')))
    else:
        obj = item
    if obj.get('externalId') != 'PO_DATA_UNLIMITED_CHT':
        continue

    # Check PO-level chars
    versions = obj.get('versions', [])
    po_chars = versions[-1].get('characteristics', []) if versions else []
    
    print("=== PO-level chars for Initial/Min/Max/FUP ===")
    for c in po_chars:
        if c.get('name') in TARGET_NAMES:
            print(f"\nChar: {c.get('name')!r}")
            print(f"  externalId={c.get('externalId')!r}  reg={c.get('valueRegulator')}  valueType={c.get('valueType')}")
            for pv in c.get('possibleValues', []):
                print(f"  PV: {json.dumps(pv)}")

    # Check PS chars
    relations = versions[-1].get('relationsTo', []) if versions else []
    ps_ids = [r['targetId'] for r in relations if r.get('targetType') == 'ProductSpecification']
    for ps_id in ps_ids:
        ps = ps_map.get(ps_id)
        if not ps:
            continue
        ps_versions = ps.get('versions', [])
        ps_chars = ps_versions[-1].get('characteristics', []) if ps_versions else []
        print(f"\n=== PS: {ps.get('name')} chars for Initial/Min/Max/FUP ===")
        for c in ps_chars:
            if c.get('name') in TARGET_NAMES:
                print(f"\nChar: {c.get('name')!r}")
                print(f"  externalId={c.get('externalId')!r}  reg={c.get('valueRegulator')}  valueType={c.get('valueType')}")
                for pv in c.get('possibleValues', []):
                    print(f"  PV: {json.dumps(pv)}")
    break
