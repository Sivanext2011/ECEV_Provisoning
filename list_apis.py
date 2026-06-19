import json

d = json.load(open(r'c:\Users\eransva\Downloads\ECEV_Provisning\docs\ECEV_BAE_PCS_23_10_20260416.json'))

def list_ops(items, depth=0):
    for item in items:
        prefix = "  " * depth
        if 'item' in item:
            print(f"{prefix}[DIR] {item['name']}")
            list_ops(item['item'], depth + 1)
        elif 'request' in item:
            req = item['request']
            method = req.get('method', '')
            url = req.get('url', {})
            if isinstance(url, dict):
                raw = url.get('raw', '')
            else:
                raw = str(url)
            # Shorten URL
            raw = raw.replace('{{ROOT_BAE}}', '').replace('{{ROOT_CPM}}', '').replace('{{ROOT_SEC}}', '')
            print(f"{prefix}{method:6s} | {item['name']:45s} | {raw[:80]}")

list_ops(d['item'])
