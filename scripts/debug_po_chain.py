import zipfile, json, base64, zlib

zf = zipfile.ZipFile('docs/BusinessConfig_20260721011124011.zip')
data = json.loads(zf.read('RMCA_20260721011114595.json'))
export = data.get('exportData', data)

rs_map = {r.get('id'): r for r in export.get('resourceSpecifications', [])}
ps_map = {p.get('id'): p for p in export.get('productSpecifications', [])}
cfss_map = {c.get('id'): c for c in export.get('customerFacingServiceSpecifications', [])}
rfss_map = {r.get('id'): r for r in export.get('resourceFacingServiceSpecifications', [])}

print(f'RS: {len(rs_map)}, PS: {len(ps_map)}, CFSS: {len(cfss_map)}, RFSS: {len(rfss_map)}')

# Check EPICHAT chain
for raw in export.get('productOfferings', []):
    if isinstance(raw, str):
        for pad in ['', '=', '==', '===']:
            try:
                obj = json.loads(zlib.decompress(base64.b64decode(raw + pad)))
                break
            except:
                obj = None
    else:
        obj = raw
    if not obj or obj.get('externalId') != 'PO_EPICHAT':
        continue
    
    print(f'\n=== PO_EPICHAT ===')
    versions = obj.get('versions', [])
    if not versions:
        print('No versions!')
        continue
    v = versions[-1]
    rt = v.get('relationsTo', [])
    for r in rt:
        if r.get('targetType') == 'ProductSpecification':
            ps_id = r['targetId']
            ps = ps_map.get(ps_id)
            if not ps:
                print(f'PS {ps_id} not found in map!')
                continue
            print(f'PS: {ps.get("externalId")} ({ps_id})')
            ps_v = ps.get('versions', [{}])[-1]
            ps_rt = ps_v.get('relationsTo', [])
            for pr in ps_rt:
                ttype = pr.get('targetType')
                tid = pr.get('targetId')
                print(f'  PS -> {ttype} {tid}')
                if ttype == 'ResourceSpecification':
                    rs = rs_map.get(tid)
                    print(f'    RS: {rs.get("externalId") if rs else "NOT FOUND"}')
                elif ttype == 'CustomerFacingServiceSpecification':
                    cfss = cfss_map.get(tid)
                    if not cfss:
                        print(f'    CFSS {tid} NOT FOUND in map')
                        continue
                    print(f'    CFSS: {cfss.get("externalId")}')
                    cfss_v = cfss.get('versions', [{}])[-1]
                    cfss_rt = cfss_v.get('relationsTo', [])
                    for cr in cfss_rt:
                        if cr.get('targetType') == 'ResourceFacingServiceSpecification':
                            rfss = rfss_map.get(cr['targetId'])
                            if not rfss:
                                print(f'      RFSS {cr["targetId"]} NOT FOUND')
                                continue
                            print(f'      RFSS: {rfss.get("externalId")}')
                            rfss_v = rfss.get('versions', [{}])[-1]
                            for rr in rfss_v.get('relationsTo', []):
                                if rr.get('targetType') == 'ResourceSpecification':
                                    rs = rs_map.get(rr['targetId'])
                                    print(f'        RS: {rs.get("externalId") if rs else "NOT FOUND"} ({rr["targetId"]})')
