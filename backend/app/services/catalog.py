"""Parses RMCA BusinessConfig export zip files and extracts specifications."""
import json
import os
import zipfile
import io
import base64
import zlib
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_config_dir = Path(os.environ.get("CONFIG_PATH", Path(__file__).parent.parent.parent.parent / "config" / "config.json")).parent
CATALOG_PATH = _config_dir / "catalog.json"

_catalog: dict | None = None

# valueRegulators that require or allow user input
_USER_REGULATORS = {"canBePersonalized", "mustBePersonalized", "selection"}
# valueRegulators that are purely internal — never shown to user
_INTERNAL_REGULATORS = {"noPersonalization"}


def _empty_catalog() -> dict:
    return {
        "individualPartySpecifications": [],
        "customerSpecifications": [],
        "organizationSpecifications": [],
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
        "contactMediumSpecifications": [],
        "agreementSpecifications": [],
        "agreementItemSpecifications": [],
        "partyRoleSpecifications": [],
        "settlementAccountSpecifications": [],
        "sharingProviderSpecifications": [],
        "communicationIdentifierSpecifications": [],
        "customerListSpecifications": [],
        "referenceDataListSpecifications": [],
        "bucketDeterminationSpecifications": [],
        "tagSpecifications": [],
        # Reference data from BusinessConfig global lists — never overwritten by BSSF live fetch
        "unitsByMeasure": {},   # { "Data": ["kilobyte", "megabyte", ...], "TWD": ["TWD", ...], ... }
        "currencies": [],       # ["EUR", "TWD", "USD", ...]
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
    global _catalog
    _catalog = None
    return _load_catalog()


def get_catalog() -> dict:
    return _load_catalog()


def _save_catalog():
    CATALOG_PATH.write_text(json.dumps(_catalog, indent=2, ensure_ascii=False), encoding="utf-8")


_BUCKET_PV_NAMES = {"possible value discrete", "possible value range",
                    "characteristicspecificationvalue-idcsvpossiblevaluediscrete",
                    "characteristicspecificationvalue-idcsvpossiblevaluerange"}


def _is_bucket_char(cs: dict) -> bool:
    """noPersonalization chars that are actually user-configurable bucket params.
    Detected by having a PV named 'Possible value discrete/range' with a unitOfMeasure."""
    for pv in cs.get("possibleValues", []):
        if (pv.get("name", "").lower() in _BUCKET_PV_NAMES
                and pv.get("unitOfMeasure")):
            return True
    return False


def _extract_char(cs: dict) -> dict | None:
    """
    Extract a single characteristic.
    Returns None for purely internal chars (noPersonalization with no externalId).
    """
    ext_id = (cs.get("externalId") or "").strip()
    reg = cs.get("valueRegulator", "")

    # noPersonalization chars that are bucket params (Initial/Min/Max/FUP etc.)
    # are user-configurable despite the regulator — promote to canBePersonalized
    if reg in _INTERNAL_REGULATORS and _is_bucket_char(cs):
        reg = "canBePersonalized"

    # Fall back to name as externalId for user-facing chars that lack an externalId
    if not ext_id and reg in _USER_REGULATORS:
        ext_id = (cs.get("name") or "").strip()

    # Skip internal system chars that have no externalId and are noPersonalization
    if reg in _INTERNAL_REGULATORS and not ext_id:
        return None

    char = {
        "id": cs.get("id", ""),
        "externalId": ext_id,
        "name": cs.get("name", ""),
        "valueType": cs.get("valueType", ""),
        "valueRegulator": reg,
        "required": cs.get("minCardinality", 0) >= 1,
        "defaultValue": "",
        "possibleValues": [],
        # For bucket chars (promoted from noPersonalization), PV-level unitOfMeasure
        # is more accurate than the char-level one (which may say "Data" generically)
        "unitOfMeasure": "" if _is_bucket_char(cs) else (cs.get("unitOfMeasure", "") or cs.get("measure", "")),
    }

    for pv in cs.get("possibleValues", []):
        # Skip "Full range" sentinel — means free-text input, no constraint
        if pv.get("externalId") == "Full_range" or pv.get("name") == "Full range":
            continue
        pv_name_lower = pv.get("name", "").lower()
        if "valueFrom" in pv or "valueTo" in pv:
            # Range constraint — store on char, not as a selectable value
            char["valueFrom"] = str(pv.get("valueFrom", ""))
            char["valueTo"] = str(pv.get("valueTo", ""))
            if pv.get("unitOfMeasure") and not char["unitOfMeasure"]:
                char["unitOfMeasure"] = pv["unitOfMeasure"]
        elif "value" in pv:
            # Explicit enum value
            val = pv["value"]
            if val is None:
                val = ""
            entry = {
                "name": pv.get("name", ""),
                "value": str(val),
                "default": bool(pv.get("default", False)),
            }
            char["possibleValues"].append(entry)
            if pv.get("default") and not char["defaultValue"]:
                char["defaultValue"] = str(val)
        elif pv_name_lower in _BUCKET_PV_NAMES or "discrete" in pv_name_lower or "range" in pv_name_lower:
            # Bucket sentinel (Possible value discrete / Possible value range / idCsvPossible*)
            # — free numeric input; capture unitOfMeasure from the "discrete" (default) PV first
            if pv.get("unitOfMeasure"):
                if not char["unitOfMeasure"] or ("discrete" in pv_name_lower and char["unitOfMeasure"]):
                    char["unitOfMeasure"] = pv["unitOfMeasure"]
        elif "id" in pv and pv.get("name") and pv.get("name") != "Possible value range":
            # id-keyed enum (no explicit value field) — use id as the value
            entry = {
                "name": pv.get("name", ""),
                "value": pv["id"],
                "default": bool(pv.get("default", False)),
            }
            char["possibleValues"].append(entry)
            if pv.get("default") and not char["defaultValue"]:
                char["defaultValue"] = pv["id"]
        elif pv.get("name") == "Possible value range" and pv.get("unitOfMeasure"):
            # Range sentinel with only unitOfMeasure — free numeric input
            if not char["unitOfMeasure"]:
                char["unitOfMeasure"] = pv["unitOfMeasure"]

    # If the char has a range constraint AND all possibleValues are just the default
    # value (RMCA uses a single PV as a description label, not a real enum choice),
    # drop them — the field should render as a free numeric/text input with the range.
    if char.get("valueFrom") is not None and char["possibleValues"]:
        all_are_default_label = all(
            pv["value"] == char["defaultValue"] for pv in char["possibleValues"]
        )
        if all_are_default_label:
            char["possibleValues"] = []

    return char


def _extract_chars(versions: list, user_facing_only: bool = False) -> list:
    """
    Extract characteristics from the latest version of a spec.
    If user_facing_only=True, only return chars with externalId set OR mustBePersonalized/canBePersonalized.
    """
    if not versions:
        return []
    latest = versions[-1]
    chars = []
    for cs in latest.get("characteristics", []):
        char = _extract_char(cs)
        if char is None:
            continue
        if user_facing_only:
            reg = char["valueRegulator"]
            has_ext = bool(char["externalId"])
            # Include if: has externalId, OR is mustBePersonalized/canBePersonalized/selection
            if not has_ext and reg not in _USER_REGULATORS:
                continue
        chars.append(char)
    return chars


def _decode_compressed(item: str) -> dict | None:
    """Decode base64+zlib compressed JSON string (RMCA product offering format)."""
    try:
        # Add padding to handle base64 strings not padded to 4-byte boundary
        padded = item + '==' 
        return json.loads(zlib.decompress(base64.b64decode(padded)))
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


def _merge_chars(po_chars: list, ps_chars: list) -> list:
    """
    Merge PO-level and PS-level characteristics.
    PO chars override PS chars with same externalId.
    Only include chars that have an externalId (user-facing).
    """
    merged: dict[str, dict] = {}
    # PS chars first (lower priority)
    for c in ps_chars:
        if c["externalId"]:
            merged[c["externalId"]] = c
    # PO chars override
    for c in po_chars:
        if c["externalId"]:
            merged[c["externalId"]] = c
    return list(merged.values())


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

    # --- Individual Party Specifications ---
    for item in export.get("individualPartySpecifications", []):
        _catalog["individualPartySpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            # Party specs: show canBePersonalized + mustBePersonalized chars
            "characteristics": _extract_chars(item.get("versions", []), user_facing_only=True),
        })

    # --- Customer Specifications ---
    for item in export.get("customerSpecifications", []):
        _catalog["customerSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "characteristics": _extract_chars(item.get("versions", []), user_facing_only=True),
        })

    # --- Contract Specifications ---
    for item in export.get("contractSpecifications", []):
        _catalog["contractSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId") or item.get("name", ""),
            "name": item.get("name", ""),
            "paymentContext": item.get("paymentContext", ""),
            "characteristics": _extract_chars(item.get("versions", []), user_facing_only=True),
        })

    # --- Billing Account Specifications ---
    for item in export.get("billingAccountSpecifications", []):
        _catalog["billingAccountSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "paymentContext": item.get("paymentContext", ""),
            "characteristics": _extract_chars(item.get("versions", []), user_facing_only=True),
        })

    # --- Product Specifications ---
    for item in export.get("productSpecifications", []):
        _catalog["productSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            # PS chars: only those with externalId (user-facing)
            "characteristics": _extract_chars(item.get("versions", []), user_facing_only=True),
        })

    # --- Build lookup maps for relation traversal ---
    ps_map = {ps.get("id"): ps for ps in export.get("productSpecifications", [])}
    cfss_map = {c.get("id"): c for c in export.get("customerFacingServiceSpecifications", [])}
    rfss_map = {r.get("id"): r for r in export.get("resourceFacingServiceSpecifications", [])}
    rs_map = {r.get("id"): r for r in export.get("resourceSpecifications", [])}

    def _resolve_resource_specs(po_obj: dict) -> list:
        """Follow PO -> PS -> (direct RS + CFSS -> RFSS -> RS) chain. Tags type: 'LRS' or 'PBS'."""
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
                        results.append({"id": rs["id"], "externalId": rs.get("externalId", ""), "name": rs.get("name", ""), "type": "PBS"})
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
                                        results.append({"id": rs["id"], "externalId": rs.get("externalId", ""), "name": rs.get("name", ""), "type": "LRS"})
        return results

    def _resolve_po_chars(po_obj: dict) -> list:
        """
        Collect user-facing characteristics for a product offering:
        1. PO-level chars with externalId
        2. Linked PS chars with externalId
        Merged with PO taking priority.
        """
        versions = po_obj.get("versions", [])
        po_chars = _extract_chars(versions, user_facing_only=True)

        # Collect PS chars
        ps_chars: list = []
        if versions:
            po_rt = versions[-1].get("relationsTo", [])
            ps_ids = [r["targetId"] for r in po_rt if r.get("targetType") == "ProductSpecification"]
            for ps_id in ps_ids:
                ps = ps_map.get(ps_id)
                if ps:
                    ps_chars.extend(_extract_chars(ps.get("versions", []), user_facing_only=True))

        return _merge_chars(po_chars, ps_chars)

    # --- Product Offerings (base64+zlib compressed) ---
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
            "characteristics": _resolve_po_chars(obj),
        })

    # --- Resource Specifications ---
    for item in export.get("resourceSpecifications", []):
        _catalog["resourceSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
        })

    # --- Bucket Tags ---
    for item in export.get("bucketTags", []):
        _catalog["bucketTags"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "type": item.get("versions", [{}])[-1].get("type", "") if item.get("versions") else "",
        })

    # --- Characteristic Set Specifications ---
    for item in export.get("characteristicSetSpecifications", []):
        _catalog["characteristicSetSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "forEntityType": item.get("forEntityType", ""),
            "characteristics": _extract_chars(item.get("versions", []), user_facing_only=True),
        })

    # --- Customer Facing Service Specifications ---
    for item in export.get("customerFacingServiceSpecifications", []):
        _catalog["customerFacingServiceSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "type": item.get("customerFacingServiceSpecificationType", ""),
            "subType": item.get("customerFacingServiceSpecificationSubType", ""),
        })

    # --- Schedule Definitions ---
    for item in export.get("scheduleDefinitions", []):
        _catalog["scheduleDefinitions"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
        })

    # --- Billing Cycle Specifications ---
    for item in export.get("billingCycleSpecifications", []):
        _catalog["billingCycleSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "scheduleDefinitionExternalId": item.get("scheduleDefinitionExternalId", ""),
        })

    # Preserve billingCycleSpecifications from existing catalog if not in export
    if not _catalog["billingCycleSpecifications"] and CATALOG_PATH.exists():
        try:
            existing = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
            _catalog["billingCycleSpecifications"] = existing.get("billingCycleSpecifications", [])
        except Exception:
            pass

    # --- Communication Identifier Specifications ---
    for item in export.get("communicationIdentifierSpecifications", []):
        _catalog["communicationIdentifierSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "characteristics": _extract_chars(item.get("versions", []), user_facing_only=True),
        })

    # --- Contact Medium Specifications ---
    for item in export.get("contactMediumSpecifications", []):
        # Extract ALL chars for CMS — both mustBePersonalized ones are user-facing
        chars = _extract_chars(item.get("versions", []), user_facing_only=False)
        # Identify communicationId and channelType char externalIds by name heuristic
        comm_id_key = ""
        channel_type_key = ""
        for c in chars:
            name_lower = (c.get("name") or "").lower()
            ext = c.get("externalId") or ""
            if not ext:
                continue
            if "communication" in name_lower or "phone" in name_lower or "email" in name_lower or "address" in name_lower:
                if not comm_id_key:
                    comm_id_key = ext
            if "channel" in name_lower or "type" in name_lower:
                if not channel_type_key:
                    channel_type_key = ext

        _catalog["contactMediumSpecifications"].append({
            "id": item.get("id", ""),
            "externalId": item.get("externalId", ""),
            "name": item.get("name", ""),
            "characteristics": chars,
            # Pre-resolved keys for provisioning.py _build_contact_mediums()
            "commIdCharKey": comm_id_key,
            "channelTypeCharKey": channel_type_key,
        })

    # --- Parse reference data from RMCA_GLOBAL_LISTS nested zip ---
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            gl_entry = next((n for n in zf.namelist() if "GLOBAL_LISTS" in n and n.endswith(".zip")), None)
            if gl_entry:
                gl_zip = zipfile.ZipFile(io.BytesIO(zf.read(gl_entry)))
                # UnitOfMeasurement -> unitsByMeasure
                if "entities/UnitOfMeasurement.json" in gl_zip.namelist():
                    uoms = json.loads(gl_zip.read("entities/UnitOfMeasurement.json").decode("utf-8"))
                    by_measure: dict = {}
                    for u in uoms:
                        uom = u.get("uom") or u.get("id") or ""
                        measure = u.get("measure") or ""
                        if uom and measure:
                            by_measure.setdefault(measure, []).append(uom)
                    _catalog["unitsByMeasure"] = by_measure
                # Currency -> currencies
                if "entities/Currency.json" in gl_zip.namelist():
                    currencies = json.loads(gl_zip.read("entities/Currency.json").decode("utf-8"))
                    _catalog["currencies"] = sorted(
                        c.get("alpha3Code") or c.get("id") for c in currencies
                        if c.get("alpha3Code") or c.get("id")
                    )
    except Exception as e:
        logger.warning(f"Could not parse global lists from zip: {e}")
        # Preserve existing reference data if parse failed
        if CATALOG_PATH.exists():
            try:
                existing = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
                _catalog["unitsByMeasure"] = existing.get("unitsByMeasure") or _catalog["unitsByMeasure"]
                _catalog["currencies"] = existing.get("currencies") or _catalog["currencies"]
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
        "contactMediumSpecs": len(_catalog["contactMediumSpecs"] if "contactMediumSpecs" in _catalog else _catalog["contactMediumSpecifications"]),
        "communicationIdentifierSpecs": len(_catalog["communicationIdentifierSpecifications"]),
    }
