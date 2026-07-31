import zipfile, json, base64, zlib

with zipfile.ZipFile('docs/BusinessConfig_20260721011124011.zip') as zf:
    data = json.loads(zf.read('RMCA_20260721011114595.json'))
    export = data.get('exportData', data)
    pos = export.get('productOfferings', [])

    # Also check atomicProductOfferingPriceSpecifications in export
    apops = export.get('atomicProductOfferingPriceSpecifications', [])
    pops_spec = export.get('productOfferingPriceSpecifications', [])
    print(f'atomicPOPSpecs in export: {len(apops)}')
    print(f'POPSpecs in export: {len(pops_spec)}')
    if apops:
        print(f'atomicPOPSpec[0] keys: {list(apops[0].keys())}')
        print(f'atomicPOPSpec[0]: {json.dumps(apops[0])[:600]}')

    # Find a PO with atomicPOP characteristics that have links
    for item in pos:
        if isinstance(item, str):
            try:
                obj = json.loads(zlib.decompress(base64.b64decode(item + '==')))
            except:
                obj = {}
        else:
            obj = item
        if obj.get('externalId') != 'PO_DATA_UNLIMITED_CHT':
            continue
        versions = obj.get('versions', [])
        if not versions:
            continue
        v = versions[-1]
        pops = v.get('productOfferingPrices', [])
        for pop in pops:
            atomic = pop.get('atomicProductOfferingPrices', [])
            for ap in atomic:
                chars = ap.get('characteristics', [])
                if chars:
                    print(f'\nPO: {obj.get("externalId")} | POP: {pop.get("name")} | atomicPOP: {ap.get("name")}')
                    print(f'Full char[0]: {json.dumps(chars[0], indent=2)}')
                    if len(chars) > 1:
                        print(f'Full char[1]: {json.dumps(chars[1], indent=2)}')
                    break
