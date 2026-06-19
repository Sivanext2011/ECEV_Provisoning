import zipfile
import json
import base64
import zlib
import io
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

SPECS_CACHE_PATH = Path(os.environ.get("CONFIG_PATH", Path(__file__).parent.parent.parent.parent.parent / "config" / "config.json")).parent / "parsed_specs.json"

# In-memory cache
_parsed_specs: dict | None = None


def parse_business_config(file_bytes: bytes) -> dict:
    """Parse BusinessConfig zip and extract relevant specs."""
    global _parsed_specs

    with zipfile.ZipFile(io.BytesIO(file_bytes)) as outer_zip:
        # Find the RMCA JSON file
        rmca_file = None
        for name in outer_zip.namelist():
            if name.startswith("RMCA_") and name.endswith(".json"):
                rmca_file = name
                break

        if not rmca_file:
            raise ValueError("No RMCA JSON found in BusinessConfig zip")

        data = json.loads(outer_zip.read(rmca_file))

    ed = data["exportData"]
    result = {
        "metadata": data.get("metadata", {}),
        "partySpecifications": _extract_party_specs(ed),
        "customerSpecifications": _extract_customer_specs(ed),
        "contractSpecifications": _extract_contract_specs(ed),
        "billingAccountSpecifications": _extract_ba_specs(ed),
        "productOfferings": _extract_product_offerings(ed),
        "contactMediumSpecifications": _extract_contact_medium_specs(ed),
    }

    # Cache to disk and memory
    with open(SPECS_CACHE_PATH, "w") as f:
        json.dump(result, f, indent=2)
    _parsed_specs = result

    return result


def get_parsed_specs() -> dict | None:
    """Return cached specs (memory or disk)."""
    global _parsed_specs
    if _parsed_specs:
        return _parsed_specs
    if SPECS_CACHE_PATH.exists():
        with open(SPECS_CACHE_PATH) as f:
            _parsed_specs = json.load(f)
        return _parsed_specs
    return None


def _get_active_version(versions: list) -> dict | None:
    """Get the latest ACTIVE version."""
    for v in reversed(versions):
        if v.get("state") == "ACTIVE":
            return v
    return versions[-1] if versions else None


def _extract_characteristics(chars: list) -> list:
    """Extract characteristics with only user-relevant info."""
    result = []
    for c in chars:
        # Only include fields users can personalize
        regulator = c.get("valueRegulator", "")
        if regulator == "noPersonalization":
            # System-managed, has defaults - skip from user input
            default_val = None
            for pv in c.get("possibleValues", []):
                if pv.get("default"):
                    default_val = pv.get("value")
                    break
            if default_val is not None:
                continue  # skip, will use default

        char_info = {
            "id": c.get("id"),
            "externalId": c.get("externalId", ""),
            "name": c.get("name"),
            "description": c.get("description", ""),
            "valueType": c.get("valueType"),
            "minCardinality": c.get("minCardinality", 0),
            "maxCardinality": c.get("maxCardinality", 1),
            "required": c.get("minCardinality", 0) > 0,
            "valueRegulator": regulator,
            "possibleValues": [],
            "defaultValue": None,
            "unitOfMeasure": None,
        }

        for pv in c.get("possibleValues", []):
            if pv.get("default"):
                char_info["defaultValue"] = pv.get("value")
                char_info["unitOfMeasure"] = pv.get("unitOfMeasure")
            char_info["possibleValues"].append({
                "name": pv.get("name"),
                "value": pv.get("value"),
                "valueFrom": pv.get("valueFrom"),
                "valueTo": pv.get("valueTo"),
                "unitOfMeasure": pv.get("unitOfMeasure"),
                "default": pv.get("default", False),
            })

        result.append(char_info)
    return result


def _extract_party_specs(ed: dict) -> list:
    specs = []
    for ps in ed.get("individualPartySpecifications", []):
        version = _get_active_version(ps.get("versions", []))
        if not version:
            continue
        specs.append({
            "id": ps["id"],
            "name": ps["name"],
            "description": ps.get("description", ""),
            "externalId": ps.get("externalId", ""),
            "characteristics": _extract_characteristics(version.get("characteristics", [])),
        })
    return specs


def _extract_customer_specs(ed: dict) -> list:
    specs = []
    for cs in ed.get("customerSpecifications", []):
        version = _get_active_version(cs.get("versions", []))
        if not version:
            continue
        specs.append({
            "id": cs["id"],
            "name": cs["name"],
            "description": cs.get("description", ""),
            "externalId": cs.get("externalId", ""),
            "customerType": cs.get("customerType", ""),
            "applicablePartyType": cs.get("applicablePartyType", ""),
            "characteristics": _extract_characteristics(version.get("characteristics", [])),
        })
    return specs


def _extract_contract_specs(ed: dict) -> list:
    specs = []
    for cs in ed.get("contractSpecifications", []):
        version = _get_active_version(cs.get("versions", []))
        if not version:
            continue

        # Extract logical resource specs linked to this contract spec
        resource_specs = []
        for rs in version.get("logicalResourceSpecifications", []) or cs.get("logicalResourceSpecifications", []):
            resource_specs.append({
                "id": rs.get("id", ""),
                "name": rs.get("name", ""),
                "externalId": rs.get("externalId", ""),
                "resourceType": rs.get("resourceType", ""),
            })

        specs.append({
            "id": cs["id"],
            "name": cs["name"],
            "description": cs.get("description", ""),
            "externalId": cs.get("externalId", ""),
            "paymentContext": cs.get("paymentContext", ""),
            "characteristics": _extract_characteristics(version.get("characteristics", [])),
            "logicalResourceSpecifications": resource_specs,
        })
    return specs


def _extract_ba_specs(ed: dict) -> list:
    specs = []
    for bs in ed.get("billingAccountSpecifications", []):
        version = _get_active_version(bs.get("versions", []))
        if not version:
            continue
        specs.append({
            "id": bs["id"],
            "name": bs["name"],
            "description": bs.get("description", ""),
            "externalId": bs.get("externalId", ""),
            "characteristics": _extract_characteristics(version.get("characteristics", [])),
        })
    return specs


def _extract_product_offerings(ed: dict) -> list:
    offerings = []
    for encoded_po in ed.get("productOfferings", []):
        try:
            po = json.loads(zlib.decompress(base64.b64decode(encoded_po)))
        except Exception:
            continue

        version = _get_active_version(po.get("versions", []))
        if not version:
            continue

        # Extract resource specs from product spec
        resource_specs = []
        product_spec = version.get("productSpecification", {})
        for rs in product_spec.get("logicalResourceSpecifications", []):
            resource_specs.append({
                "id": rs.get("id", ""),
                "name": rs.get("name", ""),
                "externalId": rs.get("externalId", ""),
                "resourceType": rs.get("resourceType", ""),
            })
        # Also check top-level resourceSpecifications
        for rs in version.get("logicalResourceSpecifications", []):
            resource_specs.append({
                "id": rs.get("id", ""),
                "name": rs.get("name", ""),
                "externalId": rs.get("externalId", ""),
                "resourceType": rs.get("resourceType", ""),
            })

        # Extract product characteristics
        product_chars = _extract_characteristics(
            product_spec.get("characteristics", []) or version.get("characteristics", [])
        )

        # Extract bucket specs
        bucket_specs = []
        for bs in product_spec.get("bucketSpecifications", []) or version.get("bucketSpecifications", []):
            bucket_specs.append({
                "id": bs.get("id", ""),
                "name": bs.get("name", ""),
                "externalId": bs.get("externalId", ""),
            })

        offerings.append({
            "id": po["id"],
            "name": po["name"],
            "description": po.get("description", ""),
            "externalId": po.get("externalId", ""),
            "offeringTypes": po.get("offeringTypes", []),
            "resourceSpecifications": resource_specs,
            "characteristics": product_chars,
            "bucketSpecifications": bucket_specs,
        })
    return offerings


def _extract_contact_medium_specs(ed: dict) -> list:
    specs = []
    for cms in ed.get("contactMediumSpecifications", []):
        version = _get_active_version(cms.get("versions", []))
        if not version:
            continue
        specs.append({
            "id": cms["id"],
            "name": cms["name"],
            "externalId": cms.get("externalId", ""),
            "contactMediumType": cms.get("contactMediumType", {}).get("contactMediumTypeId", ""),
            "characteristics": _extract_characteristics(version.get("characteristics", [])),
        })
    return specs
