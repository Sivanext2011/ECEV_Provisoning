import zipfile, json, base64, zlib, sys

zf = zipfile.ZipFile('docs/BusinessConfig_20260721011124011.zip')
data = json.loads(zf.read('RMCA_20260721011114595.json'))
export = data.get('exportData', data)
pos = export.get('productOfferings', [])
print(f'PO count: {len(pos)}')

rs_specs = {r.get('id'): r for r in export.get('resourceSpecifications', [])}
ps_specs = {p.get('id'): p for p in export.get('productSpecifications', [])}
print(f'RS count: {len(rs_specs)}, PS count: {len(ps_specs)}')

for raw in pos[:5]:
    if isinstance(raw, str):
        for pad in ['', '=', '==', '===']:
            try:
                obj = json.loads(zlib.decompress(base64.b64decode(raw + pad)))
                break
            except Exception:
                obj = None
    else:
        obj = raw
    if not obj:
        print('Could not decode PO')
        continue
    print(f'\nPO: {obj.get("externalId")} keys={list(obj.keys())}')
    versions = obj.get('versions', [])
    if versions:
        v = versions[-1]
        rt = v.get('relationsTo', [])
        print(f'  relationsTo: {len(rt)} types={list(set(r.get("targetType") for r in rt))}')
        for r in rt:
            if r.get('targetType') == 'ProductSpecification':
                ps = ps_specs.get(r['targetId'])
                if ps:
                    ps_v = ps.get('versions', [{}])[-1]
                    ps_rt = ps_v.get('relationsTo', [])
                    rs_types = [x.get('targetType') for x in ps_rt]
                    print(f'  PS {ps.get("externalId")} relationsTo types: {rs_types}')
    else:
        print('  No versions')
