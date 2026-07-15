import json
import logging
from datetime import datetime, timezone
from .ericsson_client import ericsson_client, load_config
from .database import get_db

logger = logging.getLogger(__name__)


def _cfg():
    return load_config()


def _defaults():
    return _cfg().get("defaults", {})


def _now_bssf():
    """BSSF datetime format: yyyy-MM-ddTHH:mm:ss.SSSZ"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _end_bssf():
    return "2099-12-31T00:00:00.000Z"


async def create_party(given_name: str, family_name: str, msisdn: str, email: str = None) -> dict:
    """Create Individual Party per bssfIndividualPartyManagement v2.13 schema."""
    defaults = _defaults()
    now = _now_bssf()

    body = {
        "externalId": msisdn,
        "givenName": given_name,
        "familyName": family_name,
        "language": ["en"],
        "status": [{"status": "Active", "validFor": {"startDateTime": now}}],
    }

    spec = defaults.get("partySpecExternalId")
    if spec:
        body["individualSpecification"] = {"externalId": spec}

    partition = defaults.get("partitionId")
    if partition:
        body["partitionId"] = partition

    # Contact medium - MSISDN
    cm_spec = defaults.get("SMS_contactMediumSpecExternalId")
    contact_medium = {
        "externalId": f"cm_{msisdn}",
        "characteristic": [
            {"charSpecExternalId": "phoneNumber", "value": [{"value": msisdn}]}
        ],
    }
    if cm_spec:
        contact_medium["contactMediumSpecExternalId"] = cm_spec
    body["contactMedium"] = [contact_medium]

    # Contact medium - Email
    if email:
        email_cm_spec = defaults.get("EMAIL_contactMediumSpecExternalId")
        email_cm = {
            "externalId": f"cm_email_{msisdn}",
            "characteristic": [
                {"charSpecExternalId": "emailAddress", "value": [{"value": email}]}
            ],
        }
        if email_cm_spec:
            email_cm["contactMediumSpecExternalId"] = email_cm_spec
        body["contactMedium"].append(email_cm)

    return await ericsson_client.request("create_party", body=body)


async def create_customer(party_external_id: str, msisdn: str, bill_cycle_spec_external_id: str = None) -> dict:
    """Create Customer per bssfCustomerManagement v2.17 schema."""
    defaults = _defaults()
    now = _now_bssf()

    body = {
        "externalId": msisdn,
        "engagedParty": {"externalId": party_external_id, "@referredType": "Individual"},
        "status": [{"status": "Active", "validFor": {"startDateTime": now}}],
    }

    cust_spec = defaults.get("customerSpecExternalId")
    if cust_spec:
        body["customerSpecification"] = {"externalId": cust_spec}

    # Home time zone
    tz = defaults.get("homeTimeZone")
    if tz:
        body["homeTimeZone"] = [{"timeZone": tz, "validFor": {"startDateTime": now}}]

    # Billing account inline
    ba_spec = defaults.get("billingAccountSpecExternalId")
    if ba_spec:
        ba = {
            "billingAccountSpecExternalId": ba_spec,
            "externalId": f"BA_{msisdn}",
            "name": [{"name": f"BA-{msisdn}", "validFor": {"startDateTime": now}}],
            "status": [{"status": "Active", "validFor": {"startDateTime": now}}],
        }
        # Bill cycle specification (param overrides config default)
        bill_cycle = bill_cycle_spec_external_id or defaults.get("billCycleSpecExternalId")
        if bill_cycle:
            ba["customerBillCycleSpecification"] = [{
                "billCycleSpecExternalId": bill_cycle,
            }]
        body["account"] = [ba]

    return await ericsson_client.request("create_customer", body=body)


async def create_contract(
    customer_external_id: str,
    msisdn: str,
    product_offering_external_id: str = None,
    billing_account_external_id: str = None,
    imsi: str = None,
) -> dict:
    """Create Contract with products per bssfSubscriptionManagement v2.31 schema."""
    defaults = _defaults()
    now = _now_bssf()

    offering_id = product_offering_external_id or defaults.get("basePlanProductOfferingExternalId", "")
    ba_ext_id = billing_account_external_id or f"BA_{msisdn}"
    payment_context = defaults.get("paymentContext", "Prepaid")

    body = {
        "externalId": f"CTR_{msisdn}",
        "paymentContext": payment_context,
        "status": [{"status": "Active", "validFor": {"startDateTime": now}}],
        "billingAccountReference": {"externalId": ba_ext_id},
        "relatedParty": [{"externalId": customer_external_id, "@referredType": "Customer"}],
    }

    # Contract specification
    ctr_spec = defaults.get("contractSpecExternalId")
    if ctr_spec:
        body["contractSpecification"] = {"externalId": ctr_spec}

    # Home time zone
    tz = defaults.get("homeTimeZone")
    if tz:
        body["homeTimeZone"] = [{"timeZone": tz, "validFor": {"startDateTime": now}}]

    # Product with correlationId for resource linking
    correlation_id = f"prod_corr_{msisdn}"
    if offering_id:
        product = {
            "productOfferingExternalId": offering_id,
            "externalId": f"PROD_{msisdn}_{offering_id}",
            "correlationId": correlation_id,
            "status": [{"status": "Active", "validFor": {"startDateTime": now}}],
            "baRefForBillCycleAlignedRecurrence": {"externalId": ba_ext_id},
        }
        body["product"] = [product]

    # Resources (MSISDN + optional IMSI)
    resources = []
    msisdn_res = {
        "resourceNumber": msisdn,
        "externalId": f"RES_{msisdn}",
        "status": [{"status": "Active", "validFor": {"startDateTime": now}}],
        "productCorrelationId": [correlation_id],
    }
    msisdn_spec_ext = defaults.get("msisdnResourceSpecExternalId", "").strip()
    msisdn_spec_id = defaults.get("msisdnResourceSpecId", "").strip()
    if msisdn_spec_ext:
        msisdn_res["resourceSpecificationExternalId"] = msisdn_spec_ext
    elif msisdn_spec_id:
        msisdn_res["resourceSpecificationId"] = msisdn_spec_id
    resources.append(msisdn_res)

    if imsi:
        imsi_res = {
            "resourceNumber": imsi,
            "externalId": f"RES_{imsi}",
            "status": [{"status": "Active", "validFor": {"startDateTime": now}}],
            "productCorrelationId": [correlation_id],
        }
        imsi_spec_ext = defaults.get("imsiResourceSpecExternalId", "").strip()
        imsi_spec_id = defaults.get("imsiResourceSpecId", "").strip()
        if imsi_spec_ext:
            imsi_res["resourceSpecificationExternalId"] = imsi_spec_ext
        elif imsi_spec_id:
            imsi_res["resourceSpecificationId"] = imsi_spec_id
        resources.append(imsi_res)

    body["resource"] = resources

    return await ericsson_client.request("create_contract", body=body, path_params={"customerExternalId": customer_external_id})


async def create_agreement(customer_external_id: str, msisdn: str) -> dict:
    """Create Agreement per bssfAgreementManagement v1.7 schema."""
    defaults = _defaults()
    now = _now_bssf()
    end = _end_bssf()

    body = {
        "externalId": f"AGR_{msisdn}",
        "validFor": {"startDateTime": now, "endDateTime": end},
        "status": [{"status": "Active", "validFor": {"startDateTime": now}}],
    }

    agr_spec = defaults.get("agreementSpecExternalId")
    if agr_spec:
        body["agreementSpecExternalId"] = agr_spec

    if "create_agreement" in _cfg().get("apis", {}):
        return await ericsson_client.request("create_agreement", body=body)
    return {"externalId": body["externalId"], "skipped": True}


async def balance_topup(customer_external_id: str, contract_external_id: str, msisdn: str, amount: int, unit: str = "euro", decimal_places: int = 0) -> dict:
    """Balance TopUp per bssfBalanceManagement v2.12 schema."""
    now = _now_bssf()

    body = {
        "triggerTime": now,
        "relatedParty": {"externalId": customer_external_id, "@referredType": "Customer"},
        "contractExternalId": contract_external_id,
        "communicationIdType": "E.164",
        "communicationId": msisdn,
        "amount": {"number": amount, "decimalPlaces": decimal_places},
        "unitOfMeasure": unit,
    }

    return await ericsson_client.request("balance_adjustment", body=body)


async def create_party_role(party_external_id: str, customer_external_id: str) -> dict:
    """Create Party Role per bssfPartyRoleManagement v1.4 schema."""
    now = _now_bssf()

    body = {
        "externalId": f"PR_{customer_external_id}",
        "name": "ContractOwner",
        "engagedParty": {"externalId": party_external_id, "@referredType": "Individual"},
        "status": [{"status": "Active", "validFor": {"startDateTime": now}}],
    }

    spec = _defaults().get("partyRoleSpecExternalId")
    if spec:
        body["partyRoleSpecification"] = {"externalId": spec}

    if "create_party_role" in _cfg().get("apis", {}):
        return await ericsson_client.request("create_party_role", body=body)
    return {"externalId": body["externalId"], "skipped": True}


# --- Enquiry operations ---

async def get_customer_by_msisdn(msisdn: str) -> dict:
    return await ericsson_client.request("get_customer_by_msisdn", path_params={"msisdn": msisdn})


async def get_contract_by_msisdn(msisdn: str) -> dict:
    return await ericsson_client.request("get_contract_by_msisdn", path_params={"msisdn": msisdn})


async def get_balance_by_msisdn(msisdn: str) -> dict:
    return await ericsson_client.request("balance_enquiry_msisdn", path_params={"msisdn": msisdn})


async def get_balance_by_customer(customer_external_id: str) -> dict:
    return await ericsson_client.request("balance_enquiry", path_params={"customerExternalId": customer_external_id})


# --- Lifecycle operations ---

async def terminate_party(party_external_id: str) -> dict:
    now = _now_bssf()
    body = {"status": [{"status": "Inactive", "validFor": {"startDateTime": now}}]}
    return await ericsson_client.request("terminate_party_cascade", body=body, path_params={"partyExternalId": party_external_id})


async def terminate_customer(customer_external_id: str) -> dict:
    now = _now_bssf()
    body = {"status": [{"status": "Inactive", "validFor": {"startDateTime": now}}]}
    return await ericsson_client.request("terminate_customer_cascade", body=body, path_params={"customerExternalId": customer_external_id})


async def terminate_contract(customer_external_id: str, contract_external_id: str) -> dict:
    now = _now_bssf()
    body = {"status": [{"status": "Inactive", "validFor": {"startDateTime": now}}]}
    return await ericsson_client.request("terminate_contract_cascade", body=body, path_params={
        "customerExternalId": customer_external_id, "contractExternalId": contract_external_id
    })


# --- Rollback helpers ---

async def _rollback_party(party_external_id: str):
    try:
        await ericsson_client.request("delete_party_by_external_id", path_params={"partyExternalId": party_external_id})
    except Exception as e:
        logger.warning(f"Rollback party {party_external_id} failed: {e}")


async def _rollback_customer(customer_external_id: str):
    try:
        await ericsson_client.request("delete_customer_by_external_id", path_params={"customerExternalId": customer_external_id})
    except Exception as e:
        logger.warning(f"Rollback customer {customer_external_id} failed: {e}")


# --- Raw provisioning (spec-driven wizard) ---

async def provision_raw(party_body: dict, customer_body: dict, contract_body: dict) -> dict:
    """Forward pre-built JSON bodies to Ericsson APIs in sequence."""
    # Step 1: Create Party
    party_resp = await ericsson_client.request("create_party", body=party_body)
    party_ext_id = party_resp.get("externalId", party_body.get("externalId", ""))

    # Step 2: Create Customer (includes BA)
    customer_resp = await ericsson_client.request("create_customer", body=customer_body)
    customer_ext_id = customer_resp.get("externalId", customer_body.get("externalId", ""))

    # Step 3: Create Contract
    contract_resp = await ericsson_client.request(
        "create_contract", body=contract_body,
        path_params={"customerExternalId": customer_ext_id}
    )

    return {
        "party": party_resp,
        "customer": customer_resp,
        "contract": contract_resp,
    }


# --- Full provisioning orchestration ---

async def provision_subscriber(
    given_name: str,
    family_name: str,
    msisdn: str,
    email: str = None,
    offering_id: str = None,
    imsi: str = None,
    bill_cycle_spec_external_id: str = None,
) -> dict:
    """Full provisioning: Party → Customer (with BA) → Contract (with Product + Resource).
    Includes rollback on failure.
    """
    defaults = _defaults()
    offering = offering_id or defaults.get("basePlanProductOfferingExternalId", "")

    party_resp = None
    customer_resp = None

    try:
        # Step 1: Create Individual Party
        party_resp = await create_party(given_name, family_name, msisdn, email)
        party_ext_id = party_resp.get("externalId", msisdn)

        # Step 2: Create Customer (includes billing account inline)
        customer_resp = await create_customer(party_ext_id, msisdn, bill_cycle_spec_external_id)
        customer_ext_id = customer_resp.get("externalId", msisdn)

        # Extract billing account external ID from response
        ba_ext_id = f"BA_{msisdn}"
        accounts = customer_resp.get("account", [])
        if accounts:
            ba_ext_id = accounts[0].get("externalId", ba_ext_id)

        # Step 3: Create Contract with product and resources
        contract_resp = await create_contract(customer_ext_id, msisdn, offering, ba_ext_id, imsi)
        contract_ext_id = contract_resp.get("externalId", f"CTR_{msisdn}")

    except Exception as e:
        # Rollback created entities on failure
        error_msg = str(e)
        if customer_resp:
            await _rollback_customer(customer_resp.get("externalId", msisdn))
        if party_resp:
            await _rollback_party(party_resp.get("externalId", msisdn))

        # Audit the failure
        await _audit_log(msisdn, "provision_failed", {"offering": offering, "error": error_msg[:500]})
        raise

    # Extract IDs from responses
    party_id = party_resp.get("id", "")
    customer_id = customer_resp.get("id", "")
    contract_id = contract_resp.get("id", "")
    ba_id = accounts[0].get("id", "") if accounts else ""

    # Store in local DB
    await _audit_log(msisdn, "provision", {
        "offering": offering, "party_ext": party_ext_id,
        "customer_ext": customer_ext_id, "contract_ext": contract_ext_id,
    })

    db = await get_db()
    try:
        await db.execute(
            "INSERT OR REPLACE INTO subscribers (msisdn, party_id, customer_id, billing_account_id, contract_id) VALUES (?,?,?,?,?)",
            (msisdn, party_id, customer_id, ba_id, contract_id),
        )
        await db.commit()
    finally:
        await db.close()

    return {
        "partyId": party_id,
        "partyExternalId": party_ext_id,
        "customerId": customer_id,
        "customerExternalId": customer_ext_id,
        "billingAccountId": ba_id,
        "billingAccountExternalId": ba_ext_id,
        "contractId": contract_id,
        "contractExternalId": contract_ext_id,
    }


async def _audit_log(msisdn: str, action: str, details: dict):
    try:
        db = await get_db()
        try:
            await db.execute(
                "INSERT INTO audit_log (msisdn, action, request_body, status) VALUES (?,?,?,?)",
                (msisdn, action, json.dumps(details), "success" if "error" not in details else "failed"),
            )
            await db.commit()
        finally:
            await db.close()
    except Exception as e:
        logger.warning(f"Audit log write failed: {e}")
