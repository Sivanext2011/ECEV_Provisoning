import json
from datetime import datetime, timedelta, timezone
from .ericsson_client import ericsson_client, load_config
from .database import get_db


def _get_offering(offering_id: str) -> dict:
    cfg = load_config()
    for o in cfg["product_offerings"]:
        if o["productOfferingId"] == offering_id:
            return o
    raise ValueError(f"Unknown product offering: {offering_id}")


def _defaults():
    return load_config().get("defaults", {})


def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _end_date():
    return _defaults().get("default_end_date", "2099-12-31T00:00:00Z")


async def create_party(given_name: str, family_name: str, msisdn: str, email: str = None) -> dict:
    defaults = _defaults()
    body = {
        "resource": {
            "givenName": given_name,
            "familyName": family_name,
            "externalId": msisdn,
            "partitionId": defaults.get("partition_id", "1"),
            "language": ["en"],
            "status": [{"status": "PartyActive"}],
            "contactMedium": [
                {
                    "contactMediumSpecExternalId": "ContactMedium_Telephone",
                    "externalId": f"cm_{msisdn}",
                    "characteristic": [
                        {"charSpecExternalId": "Comm_ID_SMS", "value": [{"value": msisdn}]},
                        {"charSpecExternalId": "Channel_Type_SMS", "value": [{"value": "SMS"}]},
                    ],
                }
            ],
        }
    }
    return await ericsson_client.request("create_party", body=body)


async def read_party(party_id: str) -> dict:
    return await ericsson_client.request("read_party", path_params={"partyId": party_id})


async def update_party(party_id: str, body: dict) -> dict:
    return await ericsson_client.request("update_party", body=body, path_params={"partyId": party_id})


async def delete_party(party_id: str) -> dict:
    return await ericsson_client.request("delete_party", path_params={"partyId": party_id})


async def create_customer(party_external_id: str, msisdn: str, customer_spec_external_id: str = "") -> dict:
    defaults = _defaults()
    spec_id = customer_spec_external_id or defaults.get("customerSpecExternalId", "")
    body = {
        "externalId": msisdn,
        "relatedParty": [
            {"externalId": party_external_id}
        ],
    }
    if spec_id:
        body["customerSpecification"] = {"externalId": spec_id}
    return await ericsson_client.request("create_customer", body=body)


async def create_customer_extid(party_id: str, msisdn: str, billing_account_spec_id: str = "", bucket_spec_id: str = "") -> dict:
    defaults = _defaults()
    now = _now_iso()
    end = _end_date()
    ba_spec = billing_account_spec_id or defaults.get("billing_account_spec_id", "")
    b_spec = bucket_spec_id or defaults.get("bucket_spec_id", "")

    body = {
        "resource": {
            "party": {"partyId": party_id},
            "externalId": msisdn,
            "statuses": [{"validFor": {"start": now}, "status": "CustomerActive"}],
            "validFor": {"start": now, "end": end},
            "homeTimeZones": [
                {"timeZone": defaults.get("timezone", "Europe/Stockholm"), "validFor": {"start": now, "end": end}}
            ],
            "billingAccounts": [{
                "billingAccountSpec": {"billingAccountSpecId": ba_spec},
                "tmpId": "tmp_accountId",
                "externalId": msisdn,
                "buckets": [{"bucketSpec": {"bucketSpecId": b_spec}}] if b_spec else [],
                "statuses": [{"validFor": {"start": now, "end": end}, "status": "BillingAccountActive"}],
                "names": [{"name": f"BA-{msisdn}", "validFor": {"start": now, "end": end}}],
                "validFor": {"start": now, "end": end},
            }],
            "billAccAssignmentRules": [{
                "tmpAccountId": "tmp_accountId",
                "validFor": {"start": now, "end": end},
                "priceTypes": ["any"],
            }],
        }
    }
    return await ericsson_client.request("create_customer_extid", body=body)


async def read_customer(customer_id: str) -> dict:
    return await ericsson_client.request("read_customer", path_params={"customerId": customer_id})


async def update_customer(customer_id: str, body: dict) -> dict:
    return await ericsson_client.request("update_customer", body=body, path_params={"customerId": customer_id})


async def delete_customer(customer_id: str) -> dict:
    return await ericsson_client.request("delete_customer", path_params={"customerId": customer_id})


async def create_contract(customer_id: str, billing_account_id: str) -> dict:
    defaults = _defaults()
    now = _now_iso()
    end = _end_date()
    body = {
        "resource": {
            "interactionStatus": "closed",
            "description": "Base Contract",
            "homeTimeZones": [
                {"timeZone": defaults.get("timezone", "Europe/Stockholm"), "validFor": {"start": now, "end": end}}
            ],
            "statuses": [{"validFor": {"start": now, "end": end}, "status": "ContractActive"}],
            "validFor": {"start": now, "end": end},
            "partyInteractionRoles": [
                {"interactionRole": "LegalContractHolder", "partyRoleId": customer_id}
            ],
            "billAccAssignmentRules": [{
                "id": billing_account_id,
                "validFor": {"start": now, "end": end},
            }],
            "paymentContext": {"paymentContextId": defaults.get("payment_context", "Postpaid")},
        }
    }
    return await ericsson_client.request("create_contract", body=body, path_params={"customerId": customer_id})


async def read_contract(customer_id: str, contract_id: str) -> dict:
    return await ericsson_client.request("read_contract", path_params={"customerId": customer_id, "contractId": contract_id})


async def update_contract(customer_id: str, contract_id: str, body: dict) -> dict:
    return await ericsson_client.request("update_contract", body=body, path_params={"customerId": customer_id, "contractId": contract_id})


async def delete_contract(customer_id: str, contract_id: str) -> dict:
    return await ericsson_client.request("delete_contract", path_params={"customerId": customer_id, "contractId": contract_id})


async def update_pplc_state(customer_id: str, contract_id: str, new_state: str = "PPLCAvailable") -> dict:
    body = {"resource": {"newState": new_state}}
    return await ericsson_client.request("update_pplc_state", body=body, path_params={"customerId": customer_id, "contractId": contract_id})


async def read_product(customer_id: str, contract_id: str, product_id: str) -> dict:
    return await ericsson_client.request("read_product", path_params={"customerId": customer_id, "contractId": contract_id, "productId": product_id})


async def balance_enquiry(customer_id: str) -> dict:
    return await ericsson_client.request("balance_enquiry", path_params={"customerId": customer_id})


async def product_balance_enquiry(customer_id: str, contract_id: str, product_id: str) -> dict:
    return await ericsson_client.request("product_balance_enquiry", path_params={"customerId": customer_id, "contractId": contract_id, "productId": product_id})


async def balance_adjustment(customer_id: str, billing_account_id: str, bucket_id: str, amount: float, unit: str, operation: str = "ADD") -> dict:
    body = {
        "transactionId": f"adj_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "adjustmentOperation": operation,
        "adjustmentValue": {"number": int(amount), "decimalPlaces": 0},
        "unitOfMeasure": unit,
    }
    return await ericsson_client.request("balance_adjustment", body=body, path_params={
        "customerId": customer_id, "billingAccountId": billing_account_id, "bABucketId": bucket_id
    })


async def product_balance_adjustment(customer_id: str, contract_id: str, product_id: str, product_bucket_id: str, amount: float, unit: str, operation: str = "ADD") -> dict:
    body = {
        "transactionId": f"adj_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "adjustmentOperation": operation,
        "adjustmentValue": {"number": int(amount), "decimalPlaces": 0},
        "unitOfMeasure": unit,
    }
    return await ericsson_client.request("product_balance_adjustment", body=body, path_params={
        "customerId": customer_id, "contractId": contract_id, "productId": product_id, "productBucketId": product_bucket_id
    })


async def voucherless_refill(msisdn: str, amount: float, unit: str = "euro") -> dict:
    body = {
        "transactionId": f"refill_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "adjustmentOperation": "ADD",
        "adjustmentValue": {"number": int(amount), "decimalPlaces": 0},
        "unitOfMeasure": unit,
    }
    return await ericsson_client.request("voucherless_refill", body=body, path_params={"msisdn": msisdn})


async def provision_subscriber(given_name: str, family_name: str, msisdn: str, email: str, offering_id: str) -> dict:
    offering = _get_offering(offering_id)

    party_resp = await create_party(given_name, family_name, msisdn, email)
    party_id = party_resp.get("id", party_resp.get("resource", {}).get("partyId", ""))
    party_external_id = party_resp.get("externalId", msisdn)

    customer_resp = await create_customer(party_external_id, msisdn)
    customer_id = customer_resp.get("id", customer_resp.get("resource", {}).get("customerId", ""))

    # Get billing account ID from customer response
    billing_id = ""
    resource = customer_resp.get("resource", customer_resp)
    if "billingAccounts" in resource and resource["billingAccounts"]:
        billing_id = resource["billingAccounts"][0].get("billingAccountId", "")

    contract_resp = await create_contract(customer_id, billing_id)
    contract_id = contract_resp.get("resource", contract_resp).get("contractId", contract_resp.get("id", ""))

    # Activate PPLC
    await update_pplc_state(customer_id, contract_id, "PPLCAvailable")

    # Store in local DB
    db = await get_db()
    async with db:
        await db.execute(
            "INSERT OR REPLACE INTO subscribers (msisdn, party_id, customer_id, billing_account_id, agreement_id) VALUES (?,?,?,?,?)",
            (msisdn, party_id, customer_id, billing_id, contract_id),
        )
        await db.execute(
            "INSERT INTO audit_log (msisdn, action, request_body, status) VALUES (?,?,?,?)",
            (msisdn, "provision", json.dumps({"offering": offering_id}), "success"),
        )
        await db.commit()

    return {
        "partyId": party_id,
        "customerId": customer_id,
        "billingAccountId": billing_id,
        "contractId": contract_id,
    }
