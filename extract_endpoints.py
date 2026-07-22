import yaml, os

base = 'c:/Users/eransva/Downloads/ECEV_Provisning/docs/schemas/extracted'
out = []
for f in sorted(os.listdir(base)):
    oas = base + '/' + f + '/oas'
    if not os.path.isdir(oas):
        continue
    for fn in os.listdir(oas):
        if not fn.endswith('.yaml'):
            continue
        d = yaml.safe_load(open(oas + '/' + fn, encoding='utf-8'))
        title = d.get('info', {}).get('title', f)
        out.append('=== ' + title + ' ===')
        for path, methods in d.get('paths', {}).items():
            for m in ('get', 'post', 'put', 'patch', 'delete'):
                if m in methods:
                    op = methods[m]
                    oid = op.get('operationId', '')
                    out.append('  ' + m.upper().ljust(6) + path + '   [' + oid[:80] + ']')

open('endpoints.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('Done, wrote', len(out), 'lines')
