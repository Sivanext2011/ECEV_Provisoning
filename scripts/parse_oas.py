import zipfile, re

zf = zipfile.ZipFile('docs/schemas/bssfspecificationenquiry_v1_15_schemafile.zip')
c = zf.read('oas/BSSF_Specification_Enquiry_REST_Interface_1.15.yaml').decode('utf-8')

print('File length:', len(c))

# Find all endpoint blocks by looking for query parameter patterns
# Each endpoint looks like:  /endpointName:
for m in re.finditer(r'\n  /([a-zA-Z][a-zA-Z0-9{}/_-]+):\n', c):
    ep = m.group(1)
    chunk = c[m.start(): m.start() + 3000]
    params = re.findall(r"- name: ['\"]([^'\"]+)['\"]\s*\n\s+in: ['\"]query['\"]", chunk)
    if params:
        print(f"  {ep} -> {params}")
    else:
        print(f"  {ep} -> (no query params or ID-only lookup)")
