import json, zipfile, base64, zlib

ZIP = r'c:/Users/eransva/Downloads/ECEV_Provisning/docs/BusinessConfig_20260721011124011.zip'
with zipfile.ZipFile(ZIP) as z:
    data = json.loads(z.read('RMCA_20260721011114595.json'))

export = data.get('exportData', data)
ps_map = {ps['id']: ps for ps in export.get('productSpecifications', [])}
rs_map = {r['id']: r for r in export.get('resourceSpecifications', [])}
cfss_map = {c['id']: c for c in export.get('customerFacingServiceSpecifications', [])}
rfss_map = {r['id']: r for r in export.get('resourceFacingServiceSpecifications', [])}

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
    relations = versions[-1].get('relationsTo', []) if versions else []
    ps_ids = [r['targetId'] for r in relations if r.get('targetType') == 'ProductSpecification']

    for ps_id in ps_ids:
        ps = ps_map.get(ps_id)
        if not ps:
            continue
        ps_versions = ps.get('versions', [])
        ps_chars = ps_versions[-1].get('characteristics', []) if ps_versions else []
        ps_relations = ps_versions[-1].get('relationsTo', []) if ps_versions else []

        print(f"PS: {ps.get('name')} ({ps.get('externalId')})")

        # For each bucket char, find which RS it links to via valueLinks
        for c in ps_chars:
            if c.get('name') not in TARGET:
                continue
            for pv in c.get('possibleValues', []):
                for vl in pv.get('valueLinks', []):
                    if vl.get('targetType') == 'ResourceSpecification':
                        rs = rs_map.get(vl['targetId'])
                        if rs:
                            print(f"  Char '{c['name']}' -> RS: {rs.get('name')!r} extId={rs.get('externalId')!r} unit={pv.get('unitOfMeasure')!r}")
                            break
                else:
                    continue
                break
    break
