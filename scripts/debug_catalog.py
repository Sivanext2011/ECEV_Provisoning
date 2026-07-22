import zipfile, json, base64, zlib, sys

ZIP = r'c:/Users/eransva/Downloads/ECEV_Provisning/docs/BusinessConfig_20260615014922544.zip'
ZIP2 = r'c:/Users/eransva/Downloads/ECEV_Provisning/docs/BusinessConfig_20260708153722783.zip'

def analyze(fpath):
    print(f"\n=== {fpath.split('/')[-1]} ===")
    with zipfile.ZipFile(fpath) as z:
        names = z.namelist()
        rmca_names = [n for n in names if n.upper().startswith('RMCA_') and n.endswith('.json')]
        print("RMCA files:", rmca_names)
        if not rmca_names:
            print("No RMCA JSON found!")
            return
        data = json.loads(z.read(rmca_names[0]))
    
    export = data.get('exportData', data)
    pos = export.get('productOfferings', [])
    print(f"Total POs: {len(pos)}")
    
    ok = 0; fail = 0; fail_samples = []
    for i, item in enumerate(pos):
        if isinstance(item, str):
            try:
                raw = base64.b64decode(item + '==')
                obj = json.loads(zlib.decompress(raw))
                ok += 1
            except Exception as e:
                fail += 1
                if len(fail_samples) < 3:
                    fail_samples.append((i, type(e).__name__, str(e)[:80], item[:60]))
        elif isinstance(item, dict):
            ok += 1
        else:
            fail += 1
    
    print(f"Decoded OK: {ok}, Failed: {fail}")
    for s in fail_samples:
        print(f"  fail[{s[0]}]: {s[1]}: {s[2]}")
        print(f"    raw[:60]: {s[3]}")
    
    # Show first decoded PO name
    for item in pos[:5]:
        if isinstance(item, str):
            try:
                raw = base64.b64decode(item + '==')
                obj = json.loads(zlib.decompress(raw))
                print(f"  PO sample: id={obj.get('id','')} name={obj.get('name','')} extId={obj.get('externalId','')}")
            except:
                pass

analyze(ZIP)
analyze(ZIP2)
