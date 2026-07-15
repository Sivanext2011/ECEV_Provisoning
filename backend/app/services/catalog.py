"""Parses RMCA BusinessConfig export zip files and extracts specifications."""
import json
import zipfile
import io
import base64
import zlib
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

CATALOG_PATH = Path(__file__).parent.parent.parent.parent / "config" / "catalog.json"

_catalog: dict | None = None


def _empty_catalog() -> dict:
    return {
        "individualPartySpecifications": [],
        "customerSpecifications": [],
        "contractSpecifications": [],
        "billingAccountSpecifications": [],
        "productSpecifications": [],
        "productOfferings": [],
        "resourceSpecifications": [],
        "bucketTags": [],
        "characteristicSetSpecifications": [],
        "customerFacingServiceSpecifications": [],
        "scheduleDefinitions": [],
        "billingCycleSpecifications": [],
    }


def _load_catalog() -> dict:
    global _catalog
    if _catalog is not None:
        return _catalog
    if CATALOG_PATH.exists():
        try:
            _catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
            return _catalog
        except Exception:
            pass
    _catalog = _empty_catalog()
    return _catalog


def reload_catalog():
    """Force reload catalog from disk."""
    global _catalog
    _catalog = None
    return _load_catalog()


def get_catalog() -> dict:
    return _load_catalog()


def _save_catalog():
    CATALOG_PATH.write_text(json.dumps(_catalog, indent=2, ensure_ascii=False), encoding="utf-8")


def _extract_chars(versions: list) -> list:
    """Extract characteristics from the latest version of a spec."""
    if not versions:
        return []
    latest = versions[-1]
    chars = []
    for cs in latest.get("characteristics", []):
        char = {
            "id": cs.get("id", ""),
            "externalId": cs.get("externalId", ""),
            "name": cs.get("name", ""),
            "valueType": cs.get("valueType", ""),
            "valueRegulator": cs.get("valueRegulator", ""),
            "required": cs.get("minCardinality", 0) >= 1,
            "possibleValues": [],
        }
        for pv in cs.get("possibleValues", []):
            char["possibleValues"].append({
                "name": pv.get("name", ""),
                "value": pv.get("value", ""),
                "default": pv.get("default", False),
            })
        chars.append(char)
    return chars


def _decode_compressed(item: str) -> dict | None:
    """Decode base64+zlib compressed JSON string."""
    try:
        return json.loads(zlib.decompress(base64.b64decode(item)))
    except Exception:
        return None


def _find_rmca_json(zf: zipfile.ZipFile) -> dict | None:
    """Find and parse the RMCA JSON file inside the BusinessConfig zip."""
    for name in zf.namelist():
        if name.upper().startswith("RMCA_") and name.endswith(".json"):
            try:
                return json.loads(zf.read(name))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
    return None


def parse_business_config(zip_bytes: bytes) -> dict:
    """Parse an RMCA BusinessConfig zip and extract all specifications."""
    global _catalog
    _catalog = _empty_catalog()

    rmca_data = None
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            rmca_data = _find_rmca_json(zf)
    except zipfile.BadZipFile:
        try:
            rmca_data = json.loads(zip_bytes)
        except Exception:
            raise ValueError("Invalid file: not a zip or JSON")

    if not rmca_data:
        raise ValueError("No RMCA JSON found in zip")

    export = rmca_data.get("exportData", rmca_data)

    # Individual Party Specifications
    for item in export.get("individualPartySpecifications", []):
        _catalog["individualPartySpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "characteristics": _extract_chars(item.get("versions", [])),
        })

    # Customer Specifications
    for item in export.get("customerSpecifications", []):
        _catalog["customerSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "characteristics": _extract_chars(item.get("versions", [])),
        })

    # Contract Specifications
    for item in export.get("contractSpecifications", []):
        _catalog["contractSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId") or item.get("name", ""),
            "name": item.get("name", ""),
            "paymentContext": item.get("paymentContext", ""),
            "characteristics": _extract_chars(item.get("versions", [])),
        })

    # Billing Account Specifications
    for item in export.get("billingAccountSpecifications", []):
        _catalog["billingAccountSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "paymentContext": item.get("paymentContext", ""),
            "characteristics": _extract_chars(item.get("versions", [])),
        })

    # Product Specifications
    for item in export.get("productSpecifications", []):
        _catalog["productSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "characteristics": _extract_chars(item.get("versions", [])),
        })

    # Build lookup maps for relation traversal
    ps_map = {ps.get("id"): ps for ps in export.get("productSpecifications", [])}
    cfss_map = {c.get("id"): c for c in export.get("customerFacingServiceSpecifications", [])}
    rfss_map = {r.get("id"): r for r in export.get("resourceFacingServiceSpecifications", [])}
    rs_map = {r.get("id"): r for r in export.get("resourceSpecifications", [])}

    def _resolve_resource_specs(po_obj: dict) -> list:
        """Follow PO -> PS -> (direct RS + CFSS -> RFSS -> RS) chain."""
        results = []
        seen = set()
        versions = po_obj.get("versions", [])
        if not versions:
            return results
        po_rt = versions[-1].get("relationsTo", [])
        ps_ids = [r["targetId"] for r in po_rt if r.get("targetType") == "ProductSpecification"]
        for ps_id in ps_ids:
            ps = ps_map.get(ps_id)
            if not ps or not ps.get("versions"):
                continue
            ps_rt = ps["versions"][-1].get("relationsTo", [])
            for rel in ps_rt:
                if rel.get("targetType") == "ResourceSpecification":
                    rs = rs_map.get(rel["targetId"])
                    if rs and rs["id"] not in seen:
                        seen.add(rs["id"])
                        results.append({"id": rs["id"], "externalId": rs.get("externalId", ""), "name": rs.get("name", "")})
                elif rel.get("targetType") == "CustomerFacingServiceSpecification":
                    cfss = cfss_map.get(rel["targetId"])
                    if not cfss or not cfss.get("versions"):
                        continue
                    for cr in cfss["versions"][-1].get("relationsTo", []):
                        if cr.get("targetType") == "ResourceFacingServiceSpecification":
                            rfss = rfss_map.get(cr["targetId"])
                            if not rfss or not rfss.get("versions"):
                                continue
                            for rr in rfss["versions"][-1].get("relationsTo", []):
                                if rr.get("targetType") == "ResourceSpecification":
                                    rs = rs_map.get(rr["targetId"])
                                    if rs and rs["id"] not in seen:
                                        seen.add(rs["id"])
                                        results.append({"id": rs["id"], "externalId": rs.get("externalId", ""), "name": rs.get("name", "")})
        return results

    # Product Offerings (base64+zlib compressed)
    for item in export.get("productOfferings", []):
        if isinstance(item, str):
            obj = _decode_compressed(item)
            if not obj:
                continue
        else:
            obj = item
        _catalog["productOfferings"].append({
            "id": obj.get("id", ""),
            "externalId": obj.get("externalId", ""),
            "name": obj.get("name", ""),
            "offeringTypes": obj.get("offeringTypes", []),
            "resourceSpecifications": _resolve_resource_specs(obj),
            "characteristics": _extract_chars(obj.get("versions", [])),
        })

    # Resource Specifications
    for item in export.get("resourceSpecifications", []):
        _catalog["resourceSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
        })

    # Bucket Tags
    for item in export.get("bucketTags", []):
        _catalog["bucketTags"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "type": item.get("versions", [{}])[-1].get("type", "") if item.get("versions") else "",
        })

    # Characteristic Set Specifications
    for item in export.get("characteristicSetSpecifications", []):
        _catalog["characteristicSetSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "forEntityType": item.get("forEntityType", ""),
            "characteristics": _extract_chars(item.get("versions", [])),
        })

    # Customer Facing Service Specifications
    for item in export.get("customerFacingServiceSpecifications", []):
        _catalog["customerFacingServiceSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "type": item.get("customerFacingServiceSpecificationType", ""),
            "subType": item.get("customerFacingServiceSpecificationSubType", ""),
        })

    # Schedule Definitions (billing cycles)
    for item in export.get("scheduleDefinitions", []):
        _catalog["scheduleDefinitions"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
        })

    # Billing Cycle Specifications
    for item in export.get("billingCycleSpecifications", []):
        _catalog["billingCycleSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "scheduleDefinitionExternalId": item.get("scheduleDefinitionExternalId", ""),
        })

    # If no billingCycleSpecifications in export, preserve from existing catalog on disk
    if not _catalog["billingCycleSpecifications"] and CATALOG_PATH.exists():
        try:
            existing = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
            _catalog["billingCycleSpecifications"] = existing.get("billingCycleSpecifications", [])
        except Exception:
            pass

    _save_catalog()

    return {
        "partySpecs": len(_catalog["individualPartySpecifications"]),
        "customerSpecs": len(_catalog["customerSpecifications"]),
        "contractSpecs": len(_catalog["contractSpecifications"]),
        "billingAccountSpecs": len(_catalog["billingAccountSpecifications"]),
        "productSpecs": len(_catalog["productSpecifications"]),
        "productOfferings": len(_catalog["productOfferings"]),
        "resourceSpecs": len(_catalog["resourceSpecifications"]),
        "bucketTags": len(_catalog["bucketTags"]),
        "charSetSpecs": len(_catalog["characteristicSetSpecifications"]),
        "cfssSpecs": len(_catalog["customerFacingServiceSpecifications"]),
        "scheduleDefinitions": len(_catalog["scheduleDefinitions"]),
    }
