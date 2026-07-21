"""Product Offering catalog manager — create new POs from existing TEMPLATE offerings."""
import logging
from .ericsson_client import ericsson_client

logger = logging.getLogger(__name__)


async def get_product_offering(external_id: str = None, po_id: str = None) -> dict:
    """Fetch a single product offering from the live catalog by externalId or id."""
    params = {}
    if external_id:
        params["externalId"] = external_id
    elif po_id:
        params["id"] = po_id
    else:
        raise ValueError("Provide externalId or id")
    data = await ericsson_client.request("catalog_get_product_offering", query_params=params)
    items = data if isinstance(data, list) else data.get("productOffering", [data])
    if not items:
        raise ValueError(f"Product offering not found")
    return items[0]


def build_po_template_form(po: dict) -> dict:
    """
    Given a raw PO from the live API, return a structured form definition
    that the frontend can render to create a new PO from this template.
    Includes: identity fields, characteristic overrides, pricing row overrides,
    bundle relationships, and the template ref to embed in the create request.
    """
    # Characteristics (prodSpecCharValueUse)
    chars = []
    for c in (po.get("prodSpecCharValueUse") or []):
        chars.append({
            "id": c.get("id", ""),
            "externalId": c.get("externalId", ""),
            "name": c.get("name", ""),
            "valueType": c.get("valueType", ""),
            "valueRegulator": c.get("valueRegulator", ""),
            "measure": c.get("measure", ""),
            "currentValues": [
                {
                    "value": v.get("value", ""),
                    "isDefault": v.get("isDefault", False),
                    "unitOfMeasure": v.get("unitOfMeasure", ""),
                    "valueReference": v.get("valueReference"),
                }
                for v in (c.get("productSpecCharacteristicValue") or [])
            ],
        })

    # Pricing rows (productOfferingPrice → pricingLogicAlgorithm → productOfferingPriceRow)
    prices = []
    for pop in (po.get("productOfferingPrice") or []):
        rows = []
        pla = pop.get("pricingLogicAlgorithm") or {}
        for row in (pla.get("productOfferingPriceRow") or []):
            actions = []
            for action in (row.get("action") or []):
                char_uses = []
                for cu in (action.get("actionCharacteristicSpecificationUse") or []):
                    char_uses.append({
                        "id": cu.get("id", ""),
                        "externalId": cu.get("externalId", ""),
                        "name": cu.get("name", ""),
                        "type": cu.get("actionCharacteristicSpecificationType", ""),
                        "currentValues": [
                            {"value": v.get("value", ""), "unitOfMeasure": v.get("unitOfMeasure", "")}
                            for v in (cu.get("actionCharacteristicSpecificationValueUse") or [])
                        ],
                    })
                actions.append({
                    "id": action.get("id", ""),
                    "externalId": action.get("externalId", ""),
                    "name": action.get("name", ""),
                    "type": action.get("type", ""),
                    "characteristicUses": char_uses,
                })
            rows.append({
                "id": row.get("id", ""),
                "externalId": row.get("externalId", ""),
                "name": row.get("name", ""),
                "actions": actions,
            })
        prices.append({
            "id": pop.get("id", ""),
            "externalId": pop.get("externalId", ""),
            "name": pop.get("name", ""),
            "priceType": pop.get("priceType", ""),
            "priceSubType": pop.get("priceSubType", ""),
            "paymentContext": pop.get("paymentContext", ""),
            "rows": rows,
        })

    # Bundle relationships
    bundles = [
        {"id": r.get("id", ""), "externalId": r.get("externalId", ""), "type": r.get("type", "")}
        for r in (po.get("productOfferingRelationship") or [])
    ]

    # Bucket specs linked
    buckets = [
        {"id": b.get("id", ""), "externalId": b.get("externalId", ""), "type": b.get("type", ""), "measure": b.get("measure", "")}
        for b in (po.get("bucketSpecification") or [])
    ]

    # Communication identifier specs linked
    comm_ids = [
        {"id": c.get("id", ""), "externalId": c.get("externalId", ""), "numberingScheme": c.get("numberingScheme", "")}
        for c in (po.get("communicationIdentifierSpecification") or [])
    ]

    return {
        "templateRef": {"id": po.get("id", ""), "externalId": po.get("externalId", ""), "name": po.get("name", "")},
        "types": po.get("type") or [],
        "newOffering": {"externalId": "", "name": "", "description": ""},
        "characteristics": chars,
        "prices": prices,
        "bundles": bundles,
        "buckets": buckets,
        "communicationIdentifiers": comm_ids,
    }


def build_create_request(form: dict) -> dict:
    """
    Convert a filled-in template form back into a BSSF createRequest body.
    form fields:
      templateRef: {id, externalId}
      newOffering: {externalId, name, description}
      characteristics: [{externalId, currentValues: [{value, isDefault, unitOfMeasure, valueReference}]}]
      prices: [{externalId, rows: [{externalId, actions: [{externalId, characteristicUses: [{externalId, currentValues}]}]}]}]
      bundles: [{id, externalId, type}]
    """
    body = {
        "externalId": form["newOffering"]["externalId"],
        "name": form["newOffering"].get("name", ""),
        "description": form["newOffering"].get("description", ""),
        "productOfferingTemplateRef": {
            k: v for k, v in form["templateRef"].items() if k in ("id", "externalId") and v
        },
    }

    # Characteristic overrides
    if form.get("characteristics"):
        body["prodSpecCharValueUse"] = [
            {
                "productSpecificationCharacteristicValueUseRef": {"externalId": c["externalId"]},
                "productSpecCharacteristicValue": [
                    {k: v for k, v in val.items() if v not in (None, "", {})}
                    for val in (c.get("currentValues") or [])
                ],
            }
            for c in form["characteristics"] if c.get("externalId")
        ]

    # Price overrides
    if form.get("prices"):
        body["productOfferingPrice"] = []
        for p in form["prices"]:
            pop = {"externalId": p["externalId"]}
            if p.get("rows"):
                pop["pricingLogicAlgorithm"] = {
                    "productOfferingPriceRow": [
                        {
                            "productOfferingPriceRowRef": {"externalId": row["externalId"]},
                            "action": [
                                {
                                    "actionRef": {"externalId": a["externalId"]},
                                    "actionCharacteristicSpecificationUse": [
                                        {
                                            "actionCharacteristicSpecificationUseRef": {"externalId": cu["externalId"]},
                                            "actionCharacteristicSpecificationValueUse": [
                                                {k: v for k, v in val.items() if v not in (None, "")}
                                                for val in (cu.get("currentValues") or [])
                                            ],
                                        }
                                        for cu in (a.get("characteristicUses") or []) if cu.get("externalId")
                                    ],
                                }
                                for a in (row.get("actions") or []) if a.get("externalId")
                            ],
                        }
                        for row in p["rows"] if row.get("externalId")
                    ]
                }
            body["productOfferingPrice"].append(pop)

    # Bundle relationships
    if form.get("bundles"):
        body["productOfferingRelationship"] = [
            {k: v for k, v in b.items() if v}
            for b in form["bundles"]
        ]

    return body


async def create_from_template(form: dict) -> dict:
    """Validate, build request body, and POST to BSSF catalog_create_product_offering."""
    if not form.get("newOffering", {}).get("externalId"):
        raise ValueError("newOffering.externalId is required")
    if not form.get("templateRef", {}).get("externalId") and not form.get("templateRef", {}).get("id"):
        raise ValueError("templateRef id or externalId is required")

    body = build_create_request(form)
    logger.info(f"Creating PO from template {form['templateRef'].get('externalId')} -> {body['externalId']}")
    return await ericsson_client.request("catalog_create_product_offering", body=body)
