import json, zipfile, base64, zlib

ZIP = r'c:/Users/eransva/Downloads/ECEV_Provisning/docs/BusinessConfig_20260721011124011.zip'
with zipfile.ZipFile(ZIP) as z:
    data = json.loads(z.read('RMCA_20260721011114595.json'))

export = data.get('exportData', data)

# Build PS map
ps_map = {ps['id']: ps for ps in export.get('productSpecifications', [])}
cfss_map = {c['id']: c for c in export.get('customerFacingServiceSpecifications', [])}
rfss_map = {r['id']: r for r in export.get('resourceFacingServiceSpecifications', [])}
rs_map = {r['id']: r for r in export.get('resourceSpecifications', [])}

USER_REGS = {'mustBePersonalized', 'canBePersonalized', 'selection'}

def show_chars(chars, label, indent=2):
    sp = ' ' * indent
    user = [c for c in chars if c.get('valueRegulator') in USER_REGS]
    print(f"{sp}[{label}] total={len(chars)} user-facing={len(user)}")
    for c in chars:
        reg = c.get('valueRegulator', '')
        mark = ' ***' if reg in USER_REGS else ''
        pvs = c.get('possibleValues', [])
        pv_summary = ''
        if pvs:
            pv_summary = f" pvs={[pv.get('name','') for pv in pvs[:3]]}"
        print(f"{sp}  {c.get('name')!r:45} extId={c.get('externalId','')!r:25} reg={reg}{mark}{pv_summary}")

pos = export.get('productOfferings', [])
for item in pos:
    if isinstance(item, str):
        obj = json.loads(zlib.decompress(base64.b64decode(item + '==')))
    else:
        obj = item
    if obj.get('externalId') != 'PO_DATA_UNLIMITED_CHT':
        continue

    print(f"=== PO: {obj.get('name')} ({obj.get('externalId')}) ===")
    versions = obj.get('versions', [])
    po_chars = versions[-1].get('characteristics', []) if versions else []
    show_chars(po_chars, 'PO-level chars')

    # Follow relationsTo
    relations = versions[-1].get('relationsTo', []) if versions else []
    print(f"\n  relationsTo ({len(relations)}):")
    for r in relations:
        print(f"    targetType={r.get('targetType')} targetId={r.get('targetId','')[:20]}")

    # PS chars
    ps_ids = [r['targetId'] for r in relations if r.get('targetType') == 'ProductSpecification']
    for ps_id in ps_ids:
        ps = ps_map.get(ps_id)
        if not ps:
            print(f"  PS {ps_id[:20]} NOT FOUND in export")
            continue
        ps_versions = ps.get('versions', [])
        ps_chars = ps_versions[-1].get('characteristics', []) if ps_versions else []
        show_chars(ps_chars, f"PS: {ps.get('name')} ({ps.get('externalId')})")

        # PS -> CFSS -> RFSS -> RS
        ps_relations = ps_versions[-1].get('relationsTo', []) if ps_versions else []
        for pr in ps_relations:
            ttype = pr.get('targetType')
            tid = pr.get('targetId')
            if ttype == 'CustomerFacingServiceSpecification':
                cfss = cfss_map.get(tid)
                if cfss:
                    cfss_versions = cfss.get('versions', [])
                    cfss_chars = cfss_versions[-1].get('characteristics', []) if cfss_versions else []
                    show_chars(cfss_chars, f"CFSS: {cfss.get('name')}")
                    for cr in (cfss_versions[-1].get('relationsTo', []) if cfss_versions else []):
                        if cr.get('targetType') == 'ResourceFacingServiceSpecification':
                            rfss = rfss_map.get(cr['targetId'])
                            if rfss:
                                rfss_versions = rfss.get('versions', [])
                                rfss_chars = rfss_versions[-1].get('characteristics', []) if rfss_versions else []
                                show_chars(rfss_chars, f"RFSS: {rfss.get('name')}")
            elif ttype == 'ResourceSpecification':
                rs = rs_map.get(tid)
                if rs:
                    rs_versions = rs.get('versions', [])
                    rs_chars = rs_versions[-1].get('characteristics', []) if rs_versions else []
                    show_chars(rs_chars, f"RS: {rs.get('name')} ({rs.get('externalId')})")
    break
