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
        base["productSpecifications"] = []
        base["resourceSpecifications"] = []  # populated post-fetch from zip catalog

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


async def _link_po_resource_specs(catalog: dict) -> None:
    """Traverse PO->PS->CFSS->RFSS->RS and attach resourceSpecifications to each PO."""
    # Build lookup maps for already-fetched specs
    ps_by_ext: dict[str, dict] = {
        s["externalId"]: s for s in catalog.get("productSpecifications", []) if s.get("externalId")
    }
    cfss_by_ext: dict[str, dict] = {
        s["externalId"]: s for s in catalog.get("customerFacingServiceSpecifications", []) if s.get("externalId")
    }
    rs_by_ext: dict[str, dict] = {
        s["externalId"]: s for s in catalog.get("resourceSpecifications", []) if s.get("externalId")
    }

    # Cache for RFSS fetches (externalId -> list of RS refs)
    rfss_rs_cache: dict[str, list] = {}

    async def _get_rfss_rs(rfss_ext_id: str) -> list:
        if rfss_ext_id in rfss_rs_cache:
            return rfss_rs_cache[rfss_ext_id]
        try:
            data = await ericsson_client.request(
                "spec_rfss",
                query_params={"resourceFacingServiceSpecificationExternalId": rfss_ext_id}
            )
            if isinstance(data, list):
                data = data[0] if data else {}
            rs_refs = data.get("resourceSpecification") or []
            result = [
                {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", ""),
                 "rsType": r.get("resourceSpecificationType") or r.get("type", "")}
                for r in rs_refs
            ]
            rfss_rs_cache[rfss_ext_id] = result
            return result
        except Exception as e:
            logger.warning(f"RFSS fetch failed for {rfss_ext_id}: {e}")
            rfss_rs_cache[rfss_ext_id] = []
            return []

    for po in catalog.get("productOfferings", []):
        # Step 1: extract PS externalIds from specCharacteristic[].specCharRelationship[]
        ps_ext_ids = set()
        for char in (po.get("characteristics") or []):
            # characteristics are already normalized — need raw specCharRelationship
            pass
        # characteristics are normalized and lose specCharRelationship — fetch PO raw data
        # Instead, use the already-fetched PS list and match via CFSS chain
        # We need the raw PO to get specCharRelationship — re-fetch it
        po_ext_id = po.get("externalId", "")
        if not po_ext_id:
            continue
        try:
            raw_po = await ericsson_client.request(
                "spec_product_offering",
                query_params={"productOfferingExternalId": po_ext_id}
            )
            if isinstance(raw_po, list):
                raw_po = raw_po[0] if raw_po else {}
        except Exception as e:
            logger.warning(f"PO re-fetch failed for {po_ext_id}: {e}")
            continue

        for char in (raw_po.get("specCharacteristic") or []):
            for rel in (char.get("specCharRelationship") or []):
                if rel.get("targetType") == "ProductSpecification":
                    ext = rel.get("externalId") or rel.get("targetExternalId", "")
                    if ext:
                        ps_ext_ids.add(ext)

        if not ps_ext_ids:
            continue

        # Step 2: PS -> CFSS
        cfss_ext_ids = set()
        for ps_ext in ps_ext_ids:
            ps = ps_by_ext.get(ps_ext)
            if not ps:
                continue
            for cfss_ref in (ps.get("characteristics") or []):
                pass  # normalized chars don't have CFSS refs
            # Need raw PS for customerFacingServiceSpecification[]
            try:
                raw_ps = await ericsson_client.request(
                    "spec_product",
                    query_params={"productSpecificationExternalId": ps_ext}
                )
                if isinstance(raw_ps, list):
                    raw_ps = raw_ps[0] if raw_ps else {}
            except Exception as e:
                logger.warning(f"PS re-fetch failed for {ps_ext}: {e}")
                continue
            for cfss_ref in (raw_ps.get("customerFacingServiceSpecification") or []):
                ext = cfss_ref.get("externalId", "")
                if ext:
                    cfss_ext_ids.add(ext)

        if not cfss_ext_ids:
            continue

        # Step 3: CFSS -> RFSS
        rfss_ext_ids = set()
        for cfss_ext in cfss_ext_ids:
            cfss = cfss_by_ext.get(cfss_ext)
            if not cfss:
                continue
            # Need raw CFSS for resourceFacingServiceSpecification[]
            try:
                raw_cfss = await ericsson_client.request(
                    "spec_customer_facing_service",
                    query_params={"customerFacingServiceSpecificationExternalId": cfss_ext}
                )
                if isinstance(raw_cfss, list):
                    raw_cfss = raw_cfss[0] if raw_cfss else {}
            except Exception as e:
                logger.warning(f"CFSS re-fetch failed for {cfss_ext}: {e}")
                continue
            for rfss_ref in (raw_cfss.get("resourceFacingServiceSpecification") or []):
                ext = rfss_ref.get("externalId", "")
                if ext:
                    rfss_ext_ids.add(ext)

        if not rfss_ext_ids:
            continue

        # Step 4: RFSS -> RS
        rs_list = []
        for rfss_ext in rfss_ext_ids:
            rs_list.extend(await _get_rfss_rs(rfss_ext))

        if rs_list:
            # Enrich with rsType from already-fetched resourceSpecifications
            for rs in rs_list:
                if not rs.get("rsType") and rs.get("externalId") in rs_by_ext:
                    rs["rsType"] = rs_by_ext[rs["externalId"]].get("rsType", "")
            po["resourceSpecifications"] = rs_list
            logger.info(f"PO {po_ext_id}: linked {len(rs_list)} RS via RFSS chain")


async def fetch_catalog_from_bssf() -> dict:
    """Fetch all specs from BSSF using two-step: list IDs then fetch each individually."""
    # Preserve reference data (parsed from BusinessConfig zip) before resetting catalog
    existing = cat_mod.get_catalog()
    preserved_units = existing.get("unitsByMeasure") or {}
    preserved_currencies = existing.get("currencies") or []

    # Build PO->RS map from existing catalog (populated by BusinessConfig zip upload)
    # BSSF Spec Enquiry API does not expose PO->PS->RS relationships
    existing_po_rs: dict[str, list] = {
        po["externalId"]: po.get("resourceSpecifications", [])
        for po in existing.get("productOfferings", [])
        if po.get("externalId") and po.get("resourceSpecifications")
    }

    cat_mod._catalog = cat_mod._empty_catalog()
    catalog = cat_mod._catalog

    # Restore preserved reference data immediately so it survives the fetch
    catalog["unitsByMeasure"] = preserved_units
    catalog["currencies"] = preserved_currencies

    counts = {}
    errors = {}

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
                catalog[catalog_key].append(_normalize(item, catalog_key))
                fetched += 1

        counts[catalog_key] = fetched
        logger.info(f"Fetched {fetched}/{len(entries)} {catalog_key}")
        if fetched < len(entries):
            errors[catalog_key] = f"{len(entries) - fetched} of {len(entries)} failed"

    # Build PO->RS via live API chain: PO->PS->CFSS->RFSS->RS
    await _link_po_resource_specs(catalog)

    # Fallback: restore from zip-populated catalog for any PO still missing RS
    for po in catalog.get("productOfferings", []):
        if not po.get("resourceSpecifications") and po.get("externalId") in existing_po_rs:
            po["resourceSpecifications"] = existing_po_rs[po["externalId"]]

    counts["resourceSpecifications"] = len(catalog["resourceSpecifications"])

    cat_mod._save_catalog()
    return {"source": "bssf_live", "counts": counts, "errors": errors}
