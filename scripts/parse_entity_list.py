import zipfile, re

zf = zipfile.ZipFile('docs/schemas/bssfspecificationenquiry_v1_15_schemafile.zip')
c = zf.read('oas/BSSF_Specification_Enquiry_REST_Interface_1.15.yaml').decode('utf-8')

idx = c.find('entitySpecificationList')
print(c[idx:idx+3000])
