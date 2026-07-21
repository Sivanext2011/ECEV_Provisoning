"""Fetch catalog data from live BSSF Specification Enquiry API."""
import logging
import app.services.catalog as cat_mod
from .ericsson_client import ericsson_client

logger = logging.getLogger(__name__)

# (api_key, response_list_key, catalog_key)
_SPEC_FETCH_MAP = [
    ("spec_individual",               "individualSpecification",              "individualPartySpecifications"),
    ("spec_customer",                 "customerSpecification",                "customerSpecifications"),
    ("spec_organization",             "organizationSpecification",            "organizationSpecifications"),
    ("spec_contract",                 "contractSpecification",                "contractSpecifications"),
    ("spec_billing_account",          "billingAccountSpecification",          "billingAccountSpecifications"),
    ("spec_product",                  "productSpecification",                 "productSpecifications"),
    ("spec_product_offering",         "productOffering",                      "productOfferings"),
    ("spec_contact_medium",           "contactMediumSpecification",           "contactMediumSpecifications"),
    ("spec_billing_cycle",            "billingCycleSpecification",            "billingCycleSpecifications"),
    ("spec_schedule_definition",      "scheduleDefinition",                   "scheduleDefinitions"),
    ("spec_bucket",                   "bucketSpecification",                  "bucketTags"),
    ("spec_characteristic_set",       "characteristicSetSpecification",       "characteristicSetSpecifications"),
    ("spec_customer_facing_service",  "customerFacingServiceSpecification",   "customerFacingServiceSpecifications"),
    ("spec_agreement",                "agreementSpecification",               "agreementSpecifications"),
    ("spec_agreement_item",           "agreementItemSpecification",           "agreementItemSpecifications"),
    ("spec_party_role",               "partyRoleSpecification",               "partyRoleSpecifications"),
    ("spec_settlement_account",       "settlementAccountSpecification",       "settlementAccountSpecifications"),
    ("spec_sharing_provider",         "sharingProviderSpecification",         "sharingProviderSpecifications"),
    ("spec_communication_identifier", "communicationIdentifierSpecification", "communicationIdentifierSpecifications"),
    ("spec_customer_list",            "customerListSpecification",            "customerListSpecifications"),
    ("spec_reference_data_list",      "referenceDataListSpecification",       "referenceDataListSpecifications"),
    ("spec_bucket_determination",     "bucketDeterminationSpecification",     "bucketDeterminationSpecifications"),
    ("spec_tag",                      "tagSpecification",                     "tagSpecifications"),
]


def _extract_chars(char_list: list) -> list:
    result = []
    for c in (char_list or []):
        ext_id = (c.get("externalId") or "").strip()
        reg = c.get("valueRegulator", "")
        if reg in ("NO_PERSONALIZATION", "noPersonalization") and not ext_id:
            continue
        char = {
            "id": c.get("id", ""),
            "externalId": ext_id,
            "name": c.get("name", ""),
            "valueType": c.get("valueType", ""),
            "valueRegulator": reg,
            "required": (c.get("minCardinality") or 0) >= 1,
            "defaultValue": "",
            "possibleValues": [],
            "unitOfMeasure": c.get("unitOfMeasure") or c.get("measure") or "",
        }
        for pv in (c.get("possibleValues") or c.get("specCharacteristicValue") or c.get("characteristicValueSpecification") or []):
            val = pv.get("value") or pv.get("valueFrom") or ""
            entry = {
                "name": pv.get("name", ""),
                "value": str(val) if val is not None else "",
                "default": bool(pv.get("isDefault") or pv.get("default", False)),
            }
            char["possibleValues"].append(entry)
            if entry["default"] and not char["defaultValue"]:
                char["defaultValue"] = entry["value"]
        result.append(char)
    return result


def _get_chars(item: dict) -> list:
    """Extract characteristics from any of the known field names."""
    raw = (
        item.get("specCharacteristic") or
        item.get("prodSpecCharValueUse") or
        item.get("characteristic") or
        item.get("characteristicSpecification") or
        []
    )
    return _extract_chars(raw)


def _normalize(item: dict, catalog_key: str) -> dict:
    base = {
        "id": item.get("id", ""),
        "externalId": item.get("externalId", ""),
        "name": item.get("name", ""),
    }
    chars = _get_chars(item)

    if catalog_key in ("individualPartySpecifications", "customerSpecifications",
                       "organizationSpecifications", "productSpecifications",
                       "agreementSpecifications", "agreementItemSpecifications",
                       "partyRoleSpecifications", "settlementAccountSpecifications",
                       "sharingProviderSpecifications", "communicationIdentifierSpecifications",
                       "customerListSpecifications", "referenceDataListSpecifications",
                       "characteristicSetSpecifications"):
        base["characteristics"] = chars

    if catalog_key in ("contractSpecifications", "billingAccountSpecifications"):
        base["paymentContext"] = item.get("paymentContext", "")
        base["characteristics"] = chars

    elif catalog_key == "billingCycleSpecifications":
        base["scheduleDefinitionExternalId"] = item.get("scheduleDefinitionExternalId", "")

    elif catalog_key == "bucketTags":
        base["type"] = item.get("type", "")
        base["measure"] = item.get("measure", "")
        base["persistencyBehavior"] = item.get("persistencyBehavior", "")

    elif catalog_key == "customerFacingServiceSpecifications":
        base["type"] = item.get("customerFacingServiceSpecificationType", "")
        base["subType"] = item.get("customerFacingServiceSpecificationSubType", "")

    elif catalog_key == "characteristicSetSpecifications":
        base["forEntityType"] = item.get("forEntityType", "")

    elif catalog_key == "contactMediumSpecifications":
        base["characteristics"] = chars
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
        base["characteristics"] = chars
        # Inline linked productSpecification refs
        base["productSpecifications"] = [
            {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", "")}
            for r in (item.get("productSpecification") or [])
        ]
        # Inline linked child productOffering refs (bundles)
        base["bundledOfferings"] = [
            {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", ""), "type": r.get("type", "")}
            for r in (item.get("productOffering") or [])
        ]

    elif catalog_key == "productSpecifications":
        base["characteristics"] = chars
        base["resourceSpecifications"] = [
            {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", "")}
            for r in (item.get("resourceSpecification") or [])
        ]
        base["customerFacingServiceSpecifications"] = [
            {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", "")}
            for r in (item.get("customerFacingServiceSpecification") or [])
        ]
        base["sharingProviderSpecifications"] = [
            {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", "")}
            for r in (item.get("sharingProviderSpecification") or [])
        ]

    elif catalog_key == "bucketDeterminationSpecifications":
        base["type"] = item.get("bucketDeterminationSpecificationType", "")
        base["characteristics"] = chars
        base["resourceSpecifications"] = [
            {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", "")}
            for r in (item.get("resourceSpecification") or [])
        ]

    elif catalog_key == "tagSpecifications":
        base["characteristics"] = chars
        base["billingAccountSpecifications"] = [
            {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", "")}
            for r in (item.get("billingAccountSpecification") or [])
        ]
        base["contractSpecifications"] = [
            {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", "")}
            for r in (item.get("contractSpecification") or [])
        ]
        base["productOfferings"] = [
            {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", "")}
            for r in (item.get("productOffering") or [])
        ]
        base["customerFacingServiceSpecifications"] = [
            {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "name": r.get("name", "")}
            for r in (item.get("customerFacingServiceSpecification") or [])
        ]

    return base


def _extract_items(data, resp_key: str) -> list:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        items = data.get(resp_key) or []
        if not items:
            # fallback: first list value in response
            for v in data.values():
                if isinstance(v, list):
                    return v
        return items
    return []


async def fetch_catalog_from_bssf() -> dict:
    """Call all BSSF spec enquiry endpoints and populate the catalog."""
    cat_mod._catalog = cat_mod._empty_catalog()
    catalog = cat_mod._catalog
    counts = {}
    errors = {}

    for api_key, resp_key, catalog_key in _SPEC_FETCH_MAP:
        try:
            data = await ericsson_client.request(api_key)
            items = _extract_items(data, resp_key)
            for item in items:
                catalog[catalog_key].append(_normalize(item, catalog_key))
            counts[catalog_key] = len(catalog[catalog_key])
            logger.info(f"Fetched {counts[catalog_key]} {catalog_key}")
        except Exception as e:
            logger.warning(f"Failed to fetch {api_key}: {e}")
            errors[api_key] = str(e)

    # resourceSpecifications are not a standalone endpoint — extract from productSpecifications
    seen_rs = set()
    for ps in catalog.get("productSpecifications", []):
        for rs in (ps.get("resourceSpecifications") or []):
            key = rs.get("id") or rs.get("externalId")
            if key and key not in seen_rs:
                seen_rs.add(key)
                catalog["resourceSpecifications"].append(rs)
    counts["resourceSpecifications"] = len(catalog["resourceSpecifications"])

    cat_mod._save_catalog()
    return {"source": "bssf_live", "counts": counts, "errors": errors}
