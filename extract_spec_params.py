import yaml
f = 'c:/Users/eransva/Downloads/ECEV_Provisning/docs/schemas/extracted/bssfspecificationenquiry_v1_15_schemafile/oas/BSSF_Specification_Enquiry_REST_Interface_1.15.yaml'
d = yaml.safe_load(open(f, encoding='utf-8'))
out = []
for path, methods in d.get('paths', {}).items():
    for m, op in methods.items():
        if m != 'get':
            continue
        params = [p['name'] for p in op.get('parameters', []) if p.get('in') == 'query']
        out.append(path.split('/')[-1] + ' -> ' + str(params))
open('spec_params.txt', 'w').write('\n'.join(out))
print('done')
