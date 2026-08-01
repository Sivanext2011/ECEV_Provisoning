import json

path = "docs/schemas/extracted/bssfspecificationenquiry_v1_15_schemafile/bss.bssfSpecificationEnquiry.productOffering.readResponse.1.json"
data = json.loads(open(path).read())
pop = data['properties']['productOfferingPrice']
print("productOfferingPrice type:", pop.get('type'))
items = pop.get('items', {})
print("POP item props:", list(items.get('properties', {}).keys()))
# Check specCharacteristic inside POP
sc = items.get('properties', {}).get('specCharacteristic', {})
if sc:
    print("POP specCharacteristic:", json.dumps(sc, indent=2)[:500])
# Check productOfferingPriceSpecification ref
pops = items.get('properties', {}).get('productOfferingPriceSpecification', {})
print("productOfferingPriceSpecification:", json.dumps(pops, indent=2)[:300])
# Check priceRow
pr = items.get('properties', {}).get('priceRow', {})
print("priceRow:", json.dumps(pr, indent=2)[:300])
