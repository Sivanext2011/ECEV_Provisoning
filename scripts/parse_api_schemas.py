"""
Parse BAE Interface PDF documents using table extraction for accurate schema.
"""
import fitz
import json
import re
import os
from pathlib import Path

DOCS_DIR = Path(r'c:\Users\eransva\Downloads\ECEV_Provisning\docs')
BAE_SUB_MGMT = Path(r'c:\Users\eransva\Downloads\32_15519-fay302905_2uen_b.pdf')
OUTPUT = DOCS_DIR / 'bae_api_schema.json'

PDF_MAP = {
    'bssfSubscriptionManagement': BAE_SUB_MGMT,
    'bssfBalanceEnquiry': DOCS_DIR / '10_15519-fay302341_3uen_c.pdf',
    'bssfBalanceManagement': DOCS_DIR / '13_15519-fay302340_2uen_c.pdf',
    'bssfPartyRoleManagement': DOCS_DIR / '2_15519-fay302646_1uen_e.pdf',
    'bssfAccountManagement': DOCS_DIR / '4_15519-fay302499_1uen_c.pdf',
    'bssfAccountEnquiry': DOCS_DIR / '4_15519-fay302505_1uen_c.pdf',
    'tmf666AccountManagement': DOCS_DIR / '4_15519-fay302633_1uen_e.pdf',
    'tmf632PartyManagement': DOCS_DIR / '6_15519-fay302584_1uen_d.pdf',
    'tmf629CustomerManagement': DOCS_DIR / '6_15519-fay302586_1uen_e.pdf',
    'tmf637ProductInventory': DOCS_DIR / '6_15519-fay302612_1uen_d.pdf',
    'bssfAgreementEnquiry': DOCS_DIR / '7_15519-fay302366_1uen_c.pdf',
    'bssfAgreementManagement': DOCS_DIR / '8_15519-fay302360_1uen_c.pdf',
}


def clean(s):
    if not s:
        return ''
    return ' '.join(s.replace('\n', ' ').split()).strip()


def parse_field_meta(desc):
    meta = {}
    if not desc:
        return '', meta
    lines = desc.split('\n')
    clean_desc = []
    for line in lines:
        line = line.strip()
        if line.startswith('Pattern:'):
            meta['pattern'] = line[8:].strip()
        elif line.startswith('Max length:'):
            try:
                meta['maxLength'] = int(line[11:].strip())
            except:
                pass
        elif line.startswith('Format:'):
            meta['format'] = line[7:].strip()
        elif line == 'Deprecated':
            meta['deprecated'] = True
        elif line.startswith('Possible values:'):
            continue
        elif re.match(r'^[A-Z_]+$', line):
            meta.setdefault('enum', []).append(line)
        elif 'numeric value must be at least' in line:
            m = re.search(r'(\d+)', line)
            if m:
                meta['minimum'] = int(m.group(1))
        elif 'must not exceed' in line:
            m = re.search(r'(\d+)', line)
            if m:
                meta['maximum'] = int(m.group(1))
        else:
            clean_desc.append(line)
    return ' '.join(clean_desc)[:300], meta


def extract_tables_from_pdf(pdf_path):
    doc = fitz.open(str(pdf_path))
    entities = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        tabs = page.find_tables()

        for table in tabs.tables:
            rows = table.extract()
            if len(rows) < 2:
                continue

            # Check if first row is header [Name, (None), Type, Description]
            header = rows[0]
            if not header or len(header) < 3:
                continue

            # Second row should have entity name + version
            entity_row = rows[1]
            if not entity_row or len(entity_row) < 3:
                continue

            # Parse entity name from first cell
            entity_cell = clean(entity_row[0] or entity_row[1] or '')
            version_match = re.search(r'\(version\s+(\d+)\)', entity_cell)
            if not version_match:
                continue

            entity_name = re.sub(r'\s*\(version\s+\d+\)\s*', '', entity_cell).strip()
            entity_version = int(version_match.group(1))

            # Parse fields from remaining rows
            fields = []
            for row in rows[2:]:
                if len(row) < 3:
                    continue
                # Field name is in col 1 (or col 0 if col structure differs)
                field_name = clean(row[1] if len(row) > 3 else row[0])
                field_type = clean(row[2] if len(row) > 3 else row[1])
                field_desc_raw = row[3] if len(row) > 3 else (row[2] if len(row) > 2 else '')

                if not field_name or field_name == entity_cell:
                    continue

                desc, meta = parse_field_meta(field_desc_raw or '')

                field = {
                    'name': field_name,
                    'type': field_type,
                    'description': desc,
                }
                field.update(meta)
                fields.append(field)

            if entity_name and fields:
                entities.append({
                    'name': entity_name,
                    'version': entity_version,
                    'fields': fields,
                    'page': page_num + 1,
                })

    doc.close()
    return entities


def main():
    print("Parsing BAE interface documents (table extraction)...")
    schema = {'version': '2.0', 'interfaces': {}}

    for name, path in PDF_MAP.items():
        if not path.exists():
            print(f"  SKIP {name}")
            continue
        print(f"  {name}...", end=' ', flush=True)
        entities = extract_tables_from_pdf(path)
        ent_map = {}
        for e in entities:
            key = f"{e['name']}_{e['version']}"
            # Deduplicate - keep the one with more fields
            if key in ent_map:
                if len(e['fields']) > len(ent_map[key]['fields']):
                    ent_map[key] = e
            else:
                ent_map[key] = e
        schema['interfaces'][name] = {'entities': ent_map}
        total_f = sum(len(e['fields']) for e in ent_map.values())
        print(f"{len(ent_map)} entities, {total_f} fields")

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(schema, f, indent=2, ensure_ascii=False)

    total_e = sum(len(v['entities']) for v in schema['interfaces'].values())
    total_f = sum(len(e['fields']) for v in schema['interfaces'].values() for e in v['entities'].values())
    print(f"\nDone: {OUTPUT}")
    print(f"Interfaces: {len(schema['interfaces'])}, Entities: {total_e}, Fields: {total_f}")


if __name__ == '__main__':
    main()
