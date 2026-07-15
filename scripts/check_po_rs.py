import json, zipfile, base64, zlib

zf = zipfile.ZipFile("docs/BusinessConfig_20260708153722783.zip")
data = json.loads(zf.read("RMCA_20260708153714523.json"))
export = data.get("exportData", data)

pos = export["productOfferings"]
ps_list = export.get("productSpecifications", [])
rs_list = export.get("resourceSpecifications", [])
rfss_list = export.get("resourceFacingServiceSpecifications", [])
cfss_list = export.get("customerFacingServiceSpecifications", [])

print(f"POs: {len(pos)}, PS: {len(ps_list)}, RS: {len(rs_list)}, RFSS: {len(rfss_list)}, CFSS: {len(cfss_list)}")
print()

for p in pos:
    po = json.loads(zlib.decompress(base64.b64decode(p)))
    v = po.get("versions", [])
    rt = v[-1].get("relationsTo", []) if v else []
    
    ps_ids = [r["targetId"] for r in rt if r["targetType"] == "ProductSpecification"]
    
    rs_found = []
    for ps_id in ps_ids:
        ps = [x for x in ps_list if x.get("id") == ps_id]
        if not ps or not ps[0].get("versions"):
            continue
        ps_rt = ps[0]["versions"][-1].get("relationsTo", [])
        for r in ps_rt:
            if r["targetType"] == "ResourceSpecification":
                rs = [x for x in rs_list if x.get("id") == r["targetId"]]
                if rs:
                    rs_found.append({"id": rs[0]["id"], "name": rs[0].get("name"), "externalId": rs[0].get("externalId")})
            elif r["targetType"] == "CustomerFacingServiceSpecification":
                cfss = [x for x in cfss_list if x.get("id") == r["targetId"]]
                if cfss and cfss[0].get("versions"):
                    cfss_rt = cfss[0]["versions"][-1].get("relationsTo", [])
                    for cr in cfss_rt:
                        if cr["targetType"] == "ResourceFacingServiceSpecification":
                            rfss = [x for x in rfss_list if x.get("id") == cr["targetId"]]
                            if rfss and rfss[0].get("versions"):
                                rfss_rt = rfss[0]["versions"][-1].get("relationsTo", [])
                                for rr in rfss_rt:
                                    if rr["targetType"] == "ResourceSpecification":
                                        rs = [x for x in rs_list if x.get("id") == rr["targetId"]]
                                        if rs:
                                            rs_found.append({"id": rs[0]["id"], "name": rs[0].get("name"), "externalId": rs[0].get("externalId"), "via": "CFSS->RFSS"})
    
    po_name = po.get("name", "?")
    po_ext = po.get("externalId", "")
    print(f"PO: {po_name} (extId={po_ext})")
    if rs_found:
        for rs in rs_found:
            print(f"  -> RS: {rs['name']} (extId={rs['externalId']}) {rs.get('via','direct')}")
    else:
        print("  -> No resource specs linked")
    print()
