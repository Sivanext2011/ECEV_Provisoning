"""Fetch catalog data from live BSSF Specification Enquiry API.

Two-step approach (required by BSSF API design):
  1. GET entitySpecificationList?specificationType=X  -> list of {id, externalId, name}
  2. GET <specEndpoint>?<specType>ExternalId=X        -> full spec with characteristics
"""
import logging
import app.services.catalog as cat_mod
from .ericsson_client import ericsson_client

logger = logging.getLogger(__name__)

# Maps: specificationType -> (api_key, externalId_param, catalog_key)
_SPEC_TYPE_MAP = [
    ("CONTRACT_SPECIFICATION",              "spec_contract",          "contractSpecificationExternalId",              "contractSpecifications"),
    ("BILLING_ACCOUNT_SPECIFICATION",       "spec_billing_account",   "billingAccountSpecificationExternalId",        "billingAccountSpecifications"),
    ("RESOURCE_SPECIFICATION",              "spec_resource",          "resourceSpecificationExternalId",              "resourceSpecifications"),
    ("PRODUCT_SPECIFICATION",               "spec_product",           "productSpecificationExternalId",               "productSpecifications"),
    ("PRODUCT_OFFERING",                    "spec_product_offering",  "productOfferingExternalId",                    "productOfferings"),
    ("CUSTOMER_SPECIFICATION",              "spec_customer",          "customerSpecificationExternalId",              "customerSpecifications"),
    ("ORGANIZATION_SPECIFICATION",          "spec_organization",      "organizationSpecificationExternalId",          "organizationSpecifications"),
    ("AGREEMENT_SPECIFICATION",             "spec_agreement",         "agreementSpecificationExternalId",             "agreementSpecifications"),
    ("AGREEMENT_ITEM_SPECIFICATION",        "spec_agreement_item",    "agreementItemSpecificationExternalId",         "agreementItemSpecifications"),
    ("BILLING_CYCLE_SPECIFICATION",         "spec_billing_cycle",     "billingCycleSpecificationExternalId",          "billingCycleSpecifications"),
    ("BUCKET_SPECIFICATION",                "spec_bucket",            "bucketSpecificationExternalId",                "bucketTags"),
    ("CHARACTERISTIC_SET_SPECIFICATION",    "spec_characteristic_set","characteristicSetSpecificationExternalId",     "characteristicSetSpecifications"),
    ("CUSTOMER_FACING_SERVICE_SPECIFICATION","spec_customer_facing_service","customerFacingServiceSpecificationExternalId","customerFacingServiceSpecifications"),
    ("PARTY_ROLE_SPECIFICATION",            "spec_party_role",        "partyRoleSpecificationExternalId",             "partyRoleSpecifications"),
    ("SETTLEMENT_ACCOUNT_SPECIFICATION",    "spec_settlement_account","settlementAccountSpecificationExternalId",     "settlementAccountSpecifications"),
    ("SHARING_PROVIDER_SPECIFICATION",      "spec_sharing_provider",  "sharingProviderSpecificationExternalId",       "sharingProviderSpecifications"),
    ("COMMUNICATION_IDENTIFIER_SPECIFICATION","spec_communication_identifier","communicationIdentifierSpecificationExternalId","communicationIdentifierSpecifications"),
    ("CUSTOMER_LIST_SPECIFICATION",         "spec_customer_list",     "customerListSpecificationExternalId",          "customerListSpecifications"),
    ("REFERENCE_DATA_LIST_SPECIFICATION",   "spec_reference_data_list","referenceDataListSpecificationExternalId",   "referenceDataListSpecifications"),
    ("BUCKET_DETERMINATION_SPECIFICATION",  "spec_bucket_determination","bucketDeterminationSpecificationExternalId", "bucketDeterminationSpecifications"),
    ("TAG_SPECIFICATION",                   "spec_tag",               "tagSpecificationExternalId",                   "tagSpecifications"),
    ("SCHEDULE_DEFINITION",                 "spec_schedule_definition","scheduleDefinitionExternalId",                "scheduleDefinitions"),
    ("INDIVIDUAL_SPECIFICATION",            "spec_individual",        "individualSpecificationExternalId",            "individualPartySpecifications"),
    ("CONTACT_MEDIUM_SPECIFICATION",        "spec_contact_medium",    "contactMediumSpecificationExternalId",         "contactMediumSpecifications"),
]

# valueRegulator values from live BSSF API (uppercase_underscore)
_USER_REGULATORS = {"CAN_BE_PERSONALIZED", "MUST_BE_PERSONALIZED", "SELECTION",
                    "canBePersonalized", "mustBePersonalized", "selection"}
_INTERNAL_REGULATORS = {"NO_PERSONALIZATION", "noPersonalization", "FIXED", "fixed"}

# Normalize live API valueRegulator to camelCase used by frontend
_REG_NORMALIZE = {
    "CAN_BE_PERSONALIZED":  "canBePersonalized",
    "MUST_BE_PERSONALIZED": "mustBePersonalized",
    "NO_PERSONALIZATION":   "noPersonalization",
    "FIXED":                "fixed",
    "SELECTION":            "selection",
}


def _normalize_reg(reg: str) -> str:
    return _REG_NORMALIZE.get(reg, reg)


def _extract_chars(char_list: list) -> list:
    """Parse specCharacteristic list from live BSSF response."""
    result = []
    for c in (char_list or []):
        reg_raw = c.get("valueRegulator", "")
        reg = _normalize_reg(reg_raw)
        ext_id = (c.get("externalId") or "").strip()

        # Skip purely internal chars with no externalId
        if reg in ("noPersonalization", "fixed") and not ext_id:
            continue

        char = {
            "id": c.get("id", ""),
            "externalId": ext_id or (c.get("name") or "").strip(),
            "name": c.get("name", ""),
            "valueType": c.get("valueType", ""),
            "valueRegulator": reg,
            "required": (c.get("minCardinality") or 0) >= 1,
            "defaultValue": "",
            "possibleValues": [],
            "unitOfMeasure": c.get("unitOfMeasure") or c.get("measure") or "",
        }

        # Parse specCharacteristicValue entries
        for pv in (c.get("specCharacteristicValue") or c.get("possibleValues") or []):
            is_default = bool(pv.get("isDefault") or pv.get("default", False))

            if "valueFrom" in pv or "valueTo" in pv:
                # Range constraint — store on char, not as enum option
                char["valueFrom"] = str(pv.get("valueFrom", ""))
                char["valueTo"] = str(pv.get("valueTo", ""))
                if pv.get("unitOfMeasure") and not char["unitOfMeasure"]:
                    char["unitOfMeasure"] = pv["unitOfMeasure"]
            elif pv.get("value") is not None:
                # Enum / default value entry
                val = str(pv["value"])
                entry = {
                    "name": pv.get("name", ""),
                    "value": val,
                    "default": is_default,
                }
                if pv.get("unitOfMeasure") and not char["unitOfMeasure"]:
                    char["unitOfMeasure"] = pv["unitOfMeasure"]
                # Only add as enum option if it's not just a default-value label
                # (single PV whose value == default with a range also present — label, not enum)
                char["possibleValues"].append(entry)
                if is_default and not char["defaultValue"]:
                    char["defaultValue"] = val

        # Drop possibleValues that are just default-value description labels
        # (same logic as catalog.py: range present + all PVs equal defaultValue)
        if char.get("valueFrom") is not None and char["possibleValues"]:
            if all(pv["value"] == char["defaultValue"] for pv in char["possibleValues"]):
                char["possibleValues"] = []

        result.append(char)
    return result


def _normalize(item: dict, catalog_key: str) -> dict:
    """Normalize a raw BSSF spec response into catalog format."""
    chars = _extract_chars(item.get("specCharacteristic") or item.get("characteristic") or [])

    base = {
        "id": item.get("id", ""),
        "externalId": item.get("externalId", ""),
        "name": item.get("name", ""),
        "characteristics": chars,
    }

    if catalog_key in ("contractSpecifications", "billingAccountSpecifications"):
        base["paymentContext"] = item.get("paymentContext", "")

    elif catalog_key == "billingCycleSpecifications":
        base["scheduleDefinitionExternalId"] = item.get("scheduleDefinitionExternalId", "")

    elif catalog_key == "bucketTags":
        base["type"] = item.get("type", "")
        base["measure"] = item.get("measure", "")

    elif catalog_key == "customerFacingServiceSpecifications":
        base["type"] = item.get("customerFacingServiceSpecificationType", "")
        base["subType"] = item.get("customerFacingServiceSpecificationSubType", "")

    elif catalog_key == "characteristicSetSpecifications":
        base["forEntityType"] = item.get("forEntityType", "")

    elif catalog_key == "contactMediumSpecifications":
        comm_id_key = channel_type_key = ""
        for c in chars:
            name_lower = (c.get("name") or "").lower()
            ext = c.get("externalId") or ""
            if not ext:
                continue
            if any(k in name_lower for k in ("communication", "phone", "email", "address", "number")):
                if not comm_id_key:
                    comm_id_key = ext
            if any(k in name_lower for k in ("channel", "type")):
                if not channel_type_key:
                    channel_type_key = ext
        base["commIdCharKey"] = comm_id_key
        base["channelTypeCharKey"] = channel_type_key

    elif catalog_key == "productOfferings":
        base["offeringTypes"] = item.get("type") or item.get("offeringTypes") or []
        base["productSpecifications"] = [
            {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", "")}
            for r in (item.get("productSpecification") or [])
        ]
        # Collect RS from all possible fields in PO response
        raw_rs = (
            item.get("resourceSpecification") or
            item.get("resourceSpecifications") or
            item.get("resourceSpec") or []
        )
        base["resourceSpecifications"] = [
            {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", ""), "type": r.get("type", "") or r.get("resourceSpecificationType", "")}
            for r in raw_rs
        ]
        # Log full PO response keys for first PO to diagnose missing RS link
        if not raw_rs:
            logger.debug(f"PO {base['externalId']} raw keys: {list(item.keys())}")

    elif catalog_key == "productSpecifications":
        base["resourceSpecifications"] = [
            {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", "")}
            for r in (item.get("resourceSpecification") or [])
        ]

    elif catalog_key == "resourceSpecifications":
        base["rsType"] = item.get("resourceSpecificationType", "") or item.get("type", "")

    return base


async def _list_spec_ids(spec_type: str) -> list[dict]:
    """Step 1: Get all {id, externalId, name} for a given specificationType."""
    try:
        data = await ericsson_client.request("spec_entity_list", query_params={"specificationType": spec_type})
        entries = data.get("entitySpecificationListEntry") or []
        return [e for e in entries if e.get("externalId") or e.get("id")]
    except Exception as e:
        logger.warning(f"entitySpecificationList failed for {spec_type}: {e}")
        return []


async def _fetch_spec(api_key: str, ext_id_param: str, ext_id: str, spec_id: str) -> dict | None:
    """Step 2: Fetch full spec by externalId (fallback to id)."""
    try:
        if ext_id:
            data = await ericsson_client.request(api_key, query_params={ext_id_param: ext_id})
        else:
            # Use id-based param (replace ExternalId suffix with Id)
            id_param = ext_id_param.replace("ExternalId", "Id")
            data = await ericsson_client.request(api_key, query_params={id_param: spec_id})
        # Response may be a dict (single item) or list
        if isinstance(data, list):
            return data[0] if data else None
        return data
    except Exception as e:
        logger.warning(f"Failed to fetch {api_key} externalId={ext_id}: {e}")
        return None


async def fetch_catalog_from_bssf() -> dict:
    """Fetch all specs from BSSF using two-step: list IDs then fetch each individually."""
    # Preserve reference data (parsed from BusinessConfig zip) before resetting catalog
    existing = cat_mod.get_catalog()
    preserved_units = existing.get("unitsByMeasure") or {}
    preserved_currencies = existing.get("currencies") or []

    cat_mod._catalog = cat_mod._empty_catalog()
    catalog = cat_mod._catalog

    # Restore preserved reference data immediately so it survives the fetch
    catalog["unitsByMeasure"] = preserved_units
    catalog["currencies"] = preserved_currencies

    counts = {}
    errors = {}
    _po_raw_keys_logged = False

    for spec_type, api_key, ext_id_param, catalog_key in _SPEC_TYPE_MAP:
        entries = await _list_spec_ids(spec_type)
        if not entries:
            counts[catalog_key] = 0
            continue

        fetched = 0
        for entry in entries:
            ext_id = entry.get("externalId", "")
            spec_id = entry.get("id", "")
            item = await _fetch_spec(api_key, ext_id_param, ext_id, spec_id)
            if item:
                if catalog_key == "productOfferings" and not _po_raw_keys_logged:
                    logger.warning(f"PO raw response keys for '{ext_id}': {list(item.keys())}")
                    _po_raw_keys_logged = True
                catalog[catalog_key].append(_normalize(item, catalog_key))
                fetched += 1

        counts[catalog_key] = fetched
        logger.info(f"Fetched {fetched}/{len(entries)} {catalog_key}")
        if fetched < len(entries):
            errors[catalog_key] = f"{len(entries) - fetched} of {len(entries)} failed"

    # Build lookups for PO -> PS -> RS traversal
    ps_by_id = {ps["id"]: ps for ps in catalog.get("productSpecifications", []) if ps.get("id")}
    ps_by_ext = {ps["externalId"]: ps for ps in catalog.get("productSpecifications", []) if ps.get("externalId")}
    rs_by_id = {rs["id"]: rs for rs in catalog.get("resourceSpecifications", []) if rs.get("id")}
    rs_by_ext = {rs["externalId"]: rs for rs in catalog.get("resourceSpecifications", []) if rs.get("externalId")}

    # Resolve resourceSpecifications for each PO via linked productSpecifications
    for po in catalog.get("productOfferings", []):
        if po.get("resourceSpecifications"):  # already populated from direct PO response
            continue
        seen_rs_po = set()
        rs_list = []
        for ps_ref in (po.get("productSpecifications") or []):
            ps = ps_by_id.get(ps_ref.get("id", "")) or ps_by_ext.get(ps_ref.get("externalId", ""))
            if not ps:
                continue
            for rs_ref in (ps.get("resourceSpecifications") or []):
                # Enrich with full RS data from catalog if available
                rs_full = rs_by_id.get(rs_ref.get("id", "")) or rs_by_ext.get(rs_ref.get("externalId", ""))
                rs = rs_full or rs_ref
                key = rs.get("id") or rs.get("externalId")
                if key and key not in seen_rs_po:
                    seen_rs_po.add(key)
                    # Keep the type from PS traversal — don't overwrite with empty rsType from catalog RS
                    rs_type = rs_ref.get("type", "") or (rs_full.get("rsType") or rs_full.get("type", "") if rs_full else "")
                    rs_list.append({
                        "id": rs.get("id", ""),
                        "externalId": rs.get("externalId", ""),
                        "name": rs.get("name", ""),
                        "type": rs_type,
                    })
        po["resourceSpecifications"] = rs_list

    counts["resourceSpecifications"] = len(catalog["resourceSpecifications"])

    cat_mod._save_catalog()
    return {"source": "bssf_live", "counts": counts, "errors": errors}
