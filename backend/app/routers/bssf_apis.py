from fastapi import APIRouter, HTTPException
import httpx
from ..services.ericsson_client import ericsson_client
from ..services.bae_client import rmca_catalog_client

router = APIRouter(prefix="/api/v1", tags=["bssf"])


async def _call(api_key: str, body: dict = None, path_params: dict = None, query_params: dict = None):
    try:
        return await ericsson_client.request(api_key, body=body, path_params=path_params, query_params=query_params)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text[:500])
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"API key not found: {e}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# === Account Enquiry ===
@router.get("/account/settlement")
async def get_settlement_account(q: str = ""):
    return await _call("get_settlement_account", query_params={"queryString": q} if q else {})

# === Account Management ===
@router.post("/account/settlement")
async def create_settlement_account(body: dict):
    return await _call("create_settlement_account", body=body)

@router.patch("/account/settlement/{relatedPartyId}/{relatedPartyReferredType}/{id}")
async def update_settlement_account_by_id(relatedPartyId: str, relatedPartyReferredType: str, id: str, body: dict):
    return await _call("update_settlement_account_by_id", body=body, path_params={"relatedPartyId": relatedPartyId, "relatedPartyReferredType": relatedPartyReferredType, "id": id})

@router.patch("/account/settlement/externalId/{relatedPartyExternalId}/{relatedPartyReferredType}/{externalId}")
async def update_settlement_account_by_external_id(relatedPartyExternalId: str, relatedPartyReferredType: str, externalId: str, body: dict):
    return await _call("update_settlement_account_by_external_id", body=body, path_params={"relatedPartyExternalId": relatedPartyExternalId, "relatedPartyReferredType": relatedPartyReferredType, "externalId": externalId})

# === Agreement Enquiry ===
@router.get("/agreement")
async def get_agreement(partyId: str = None, partyExternalId: str = None, agreementId: str = None, agreementExternalId: str = None):
    q = {}
    if partyId: q["partyId"] = partyId
    if partyExternalId: q["partyExternalId"] = partyExternalId
    if agreementId: q["agreementId"] = agreementId
    if agreementExternalId: q["agreementExternalId"] = agreementExternalId
    return await _call("get_agreement", query_params=q)

# === Agreement Management ===
@router.post("/agreement/party/{partyId}")
async def create_agreement_by_party_id(partyId: str, body: dict):
    return await _call("create_agreement_by_party_id", body=body, path_params={"partyId": partyId})

@router.post("/agreement/partyExternalId/{partyExternalId}")
async def create_agreement_by_party_external_id(partyExternalId: str, body: dict):
    return await _call("create_agreement_by_party_external_id", body=body, path_params={"partyExternalId": partyExternalId})

@router.patch("/agreement/party/{partyId}/{agreementId}")
async def update_agreement_by_id(partyId: str, agreementId: str, body: dict):
    return await _call("update_agreement_by_id", body=body, path_params={"partyId": partyId, "agreementId": agreementId})

@router.delete("/agreement/party/{partyId}/{agreementId}")
async def delete_agreement_by_id(partyId: str, agreementId: str):
    return await _call("delete_agreement_by_id", path_params={"partyId": partyId, "agreementId": agreementId})

@router.patch("/agreement/partyExternalId/{partyExternalId}/{agreementExternalId}")
async def update_agreement_by_external_id(partyExternalId: str, agreementExternalId: str, body: dict):
    return await _call("update_agreement_by_external_id", body=body, path_params={"partyExternalId": partyExternalId, "agreementExternalId": agreementExternalId})

@router.delete("/agreement/partyExternalId/{partyExternalId}/{agreementExternalId}")
async def delete_agreement_by_external_id(partyExternalId: str, agreementExternalId: str):
    return await _call("delete_agreement_by_external_id", path_params={"partyExternalId": partyExternalId, "agreementExternalId": agreementExternalId})


# === Balance Adjustment (legacy alias) ===
@router.post("/balance/adjust")
async def balance_adjust(body: dict):
    return await _call("billing_account_bucket_adjustment", body=body)

# === Resource ===
@router.post("/resource/swap")
async def swap_resource(body: dict):
    return await _call("swap_logical_resource", body=body)

# === Product ===
@router.post("/product/replace")
async def replace_product(body: dict):
    return await _call("replace_product", body=body)

# === Sharing ===
@router.get("/sharing/eligible-consumers")
async def get_eligible_consumers(customerExternalId: str = None):
    q = {"customerExternalId": customerExternalId} if customerExternalId else {}
    return await _call("get_eligible_consumers", query_params=q)

# === Recurrence ===
@router.get("/recurrence")
async def recurrence_enquiry(communicationId: str = None, communicationIdType: str = "E.164"):
    q = {"communicationId": communicationId, "communicationIdType": communicationIdType} if communicationId else {}
    return await _call("recurrence_enquiry", query_params=q)

# === Balance Enquiry (extra) ===
@router.get("/balance/topupDetails")
async def get_balance_topup_details(communicationId: str = None, communicationIdType: str = "E.164", customerExternalId: str = None):
    q = {}
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    if customerExternalId: q["customerExternalId"] = customerExternalId
    return await _call("get_balance_topup_details", query_params=q)

# === Balance Management ===
@router.post("/balance/topup")
async def balance_topup(body: dict):
    return await _call("balance_topup", body=body)

@router.post("/balance/resetFraudCounter")
async def reset_balance_topup_fraud_counter(body: dict):
    return await _call("reset_balance_topup_fraud_counter", body=body)

@router.post("/balance/billingAccountAdjustment")
async def billing_account_bucket_adjustment(body: dict):
    return await _call("billing_account_bucket_adjustment", body=body)

@router.post("/balance/productAdjustment")
async def product_bucket_adjustment(body: dict):
    return await _call("product_bucket_adjustment", body=body)

@router.post("/balance/settlementAccountAdjustment")
async def settlement_account_bucket_adjustment(body: dict):
    return await _call("settlement_account_bucket_adjustment", body=body)

# === Communication Identity Management ===
@router.get("/communicationIdentity")
async def get_communication_identity(communicationId: str = None, communicationIdType: str = "E.164"):
    q = {}
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    return await _call("get_communication_identity", query_params=q)

# === Customer Bill Enquiry ===
@router.get("/bill/appliedBillingRate")
async def get_applied_customer_billing_rate(customerExternalId: str = None, communicationId: str = None, communicationIdType: str = "E.164"):
    q = {}
    if customerExternalId: q["customerExternalId"] = customerExternalId
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    return await _call("get_applied_customer_billing_rate", query_params=q)

@router.get("/bill/customerBill")
async def get_customer_bill(customerExternalId: str = None, communicationId: str = None, communicationIdType: str = "E.164"):
    q = {}
    if customerExternalId: q["customerExternalId"] = customerExternalId
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    return await _call("get_customer_bill", query_params=q)

@router.get("/bill/contractView")
async def get_customer_bill_contract_view(customerExternalId: str = None, communicationId: str = None, communicationIdType: str = "E.164"):
    q = {}
    if customerExternalId: q["customerExternalId"] = customerExternalId
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    return await _call("get_customer_bill_contract_view", query_params=q)

@router.get("/bill/onDemand")
async def get_customer_bill_on_demand(customerExternalId: str = None, communicationId: str = None, communicationIdType: str = "E.164"):
    q = {}
    if customerExternalId: q["customerExternalId"] = customerExternalId
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    return await _call("get_customer_bill_on_demand", query_params=q)

@router.get("/bill/summary")
async def get_customer_bill_summary(customerExternalId: str = None, communicationId: str = None, communicationIdType: str = "E.164"):
    q = {}
    if customerExternalId: q["customerExternalId"] = customerExternalId
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    return await _call("get_customer_bill_summary", query_params=q)

@router.get("/bill/unbilledCharge")
async def get_unbilled_charge(customerExternalId: str = None, communicationId: str = None, communicationIdType: str = "E.164"):
    q = {}
    if customerExternalId: q["customerExternalId"] = customerExternalId
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    return await _call("get_unbilled_charge", query_params=q)


# === Financial Customer Account Enquiry ===
@router.get("/financial/customerAccount")
async def get_financial_customer_account(customerExternalId: str = None, communicationId: str = None, communicationIdType: str = "E.164"):
    q = {}
    if customerExternalId: q["customerExternalId"] = customerExternalId
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    return await _call("get_financial_customer_account", query_params=q)

# === Financial Transaction Enquiry ===
@router.get("/financial/header")
async def get_financial_header(customerExternalId: str = None, communicationId: str = None, communicationIdType: str = "E.164"):
    q = {}
    if customerExternalId: q["customerExternalId"] = customerExternalId
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    return await _call("get_financial_header", query_params=q)

@router.get("/financial/transaction")
async def get_financial_transaction(customerExternalId: str = None, communicationId: str = None, communicationIdType: str = "E.164"):
    q = {}
    if customerExternalId: q["customerExternalId"] = customerExternalId
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    return await _call("get_financial_transaction", query_params=q)

@router.get("/financial/paymentInstruction")
async def get_payment_instruction(customerExternalId: str = None, communicationId: str = None, communicationIdType: str = "E.164"):
    q = {}
    if customerExternalId: q["customerExternalId"] = customerExternalId
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    return await _call("get_payment_instruction", query_params=q)

# === Financial Transaction Management ===
@router.post("/financial/task")
async def create_financial_task(body: dict):
    return await _call("create_financial_task", body=body)

# === Organization Party Enquiry ===
@router.get("/organizationParty")
async def get_organization_party(id: str = None, externalId: str = None):
    q = {}
    if id: q["id"] = id
    if externalId: q["externalId"] = externalId
    return await _call("get_organization_party", query_params=q)

# === Organization Party Management ===
@router.post("/organizationParty")
async def create_organization_party(body: dict):
    return await _call("create_organization_party", body=body)

@router.patch("/organizationParty/{organizationPartyId}")
async def update_organization_party_by_id(organizationPartyId: str, body: dict):
    return await _call("update_organization_party_by_id", body=body, path_params={"organizationPartyId": organizationPartyId})

@router.patch("/organizationParty/externalId/{organizationPartyExternalId}")
async def update_organization_party_by_external_id(organizationPartyExternalId: str, body: dict):
    return await _call("update_organization_party_by_external_id", body=body, path_params={"organizationPartyExternalId": organizationPartyExternalId})

@router.patch("/organizationParty/changeStatusCascading")
async def change_status_cascading(body: dict):
    return await _call("change_status_cascading", body=body)


# === Partner Settlement Management ===
@router.get("/partnerSettlement/contract")
async def get_partner_contract(partyRoleExternalId: str = None, contractExternalId: str = None):
    q = {}
    if partyRoleExternalId: q["partyRoleExternalId"] = partyRoleExternalId
    if contractExternalId: q["contractExternalId"] = contractExternalId
    return await _call("get_partner_contract", query_params=q)

@router.post("/partnerSettlement/partyRole/{partyRoleId}/contract")
async def create_partner_contract_by_id(partyRoleId: str, body: dict):
    return await _call("create_partner_contract_by_id", body=body, path_params={"partyRoleId": partyRoleId})

@router.post("/partnerSettlement/partyRoleExternalId/{partyRoleExternalId}/contract")
async def create_partner_contract_by_external_id(partyRoleExternalId: str, body: dict):
    return await _call("create_partner_contract_by_external_id", body=body, path_params={"partyRoleExternalId": partyRoleExternalId})

@router.patch("/partnerSettlement/partyRole/{partyRoleId}/contract/{contractId}")
async def update_partner_contract_by_id(partyRoleId: str, contractId: str, body: dict):
    return await _call("update_partner_contract_by_id", body=body, path_params={"partyRoleId": partyRoleId, "contractId": contractId})

@router.patch("/partnerSettlement/partyRoleExternalId/{partyRoleExternalId}/contract/{contractExternalId}")
async def update_partner_contract_by_external_id(partyRoleExternalId: str, contractExternalId: str, body: dict):
    return await _call("update_partner_contract_by_external_id", body=body, path_params={"partyRoleExternalId": partyRoleExternalId, "contractExternalId": contractExternalId})

@router.get("/partnerSettlement/involvementGroup")
async def get_party_role_involvement_group(partyRoleInvolvementGroupRef: str = None):
    q = {"partyRoleInvolvementGroupRef": partyRoleInvolvementGroupRef} if partyRoleInvolvementGroupRef else {}
    return await _call("get_party_role_involvement_group", query_params=q)

@router.post("/partnerSettlement/involvementGroup")
async def create_party_role_involvement_group(body: dict):
    return await _call("create_party_role_involvement_group", body=body)

@router.patch("/partnerSettlement/involvementGroup/{partyRoleInvolvementGroupRef}")
async def update_party_role_involvement_group(partyRoleInvolvementGroupRef: str, body: dict):
    return await _call("update_party_role_involvement_group", body=body, path_params={"partyRoleInvolvementGroupRef": partyRoleInvolvementGroupRef})

# === Partner Settling Management ===
@router.get("/partnerSettling/appliedRate")
async def get_applied_partner_settlement_rate(partyRoleExternalId: str = None):
    q = {"partyRoleExternalId": partyRoleExternalId} if partyRoleExternalId else {}
    return await _call("get_applied_partner_settlement_rate", query_params=q)

@router.get("/partnerSettling/note")
async def get_partner_settlement_note(partyRoleExternalId: str = None):
    q = {"partyRoleExternalId": partyRoleExternalId} if partyRoleExternalId else {}
    return await _call("get_partner_settlement_note", query_params=q)

@router.get("/partnerSettling/noteOnDemand")
async def get_partner_settlement_note_on_demand(partyRoleExternalId: str = None):
    q = {"partyRoleExternalId": partyRoleExternalId} if partyRoleExternalId else {}
    return await _call("get_partner_settlement_note_on_demand", query_params=q)

@router.post("/partnerSettling/noteOnDemand")
async def create_partner_settlement_note_on_demand(body: dict):
    return await _call("create_partner_settlement_note_on_demand", body=body)

@router.get("/partnerSettling/unsettledCharge")
async def get_unsettled_charge(partyRoleExternalId: str = None):
    q = {"partyRoleExternalId": partyRoleExternalId} if partyRoleExternalId else {}
    return await _call("get_unsettled_charge", query_params=q)

@router.get("/partnerSettling/contractView")
async def get_settlement_note_contract_view(partyRoleExternalId: str = None):
    q = {"partyRoleExternalId": partyRoleExternalId} if partyRoleExternalId else {}
    return await _call("get_settlement_note_contract_view", query_params=q)

@router.get("/partnerSettling/summary")
async def get_settlement_note_summary(partyRoleExternalId: str = None):
    q = {"partyRoleExternalId": partyRoleExternalId} if partyRoleExternalId else {}
    return await _call("get_settlement_note_summary", query_params=q)

# === Party Communication Management ===
@router.post("/communication/send")
async def send_communication_message(body: dict):
    return await _call("send_communication_message", body=body)

# === Party Role Enquiry ===
@router.get("/partyRole")
async def get_party_role(id: str = None, externalId: str = None):
    q = {}
    if id: q["id"] = id
    if externalId: q["externalId"] = externalId
    return await _call("get_party_role", query_params=q)

# === Party Role Management ===
@router.post("/partyRole")
async def create_party_role(body: dict):
    return await _call("create_party_role", body=body)

@router.patch("/partyRole/{partyRoleId}")
async def update_party_role_by_id(partyRoleId: str, body: dict):
    return await _call("update_party_role_by_id", body=body, path_params={"partyRoleId": partyRoleId})

@router.patch("/partyRole/externalId/{partyRoleExternalId}")
async def update_party_role_by_external_id(partyRoleExternalId: str, body: dict):
    return await _call("update_party_role_by_external_id", body=body, path_params={"partyRoleExternalId": partyRoleExternalId})


# === Reference Data (Measure / UnitOfMeasurement / Currency — served from catalog) ===

@router.get("/refdata/units")
async def get_refdata_units():
    """Return unitsByMeasure from catalog (parsed from BusinessConfig zip upload)."""
    from ..services.catalog import get_catalog
    return get_catalog().get("unitsByMeasure") or {}


@router.get("/refdata/currencies")
async def get_refdata_currencies():
    """Return currencies list from catalog (parsed from BusinessConfig zip upload)."""
    from ..services.catalog import get_catalog
    return get_catalog().get("currencies") or []


@router.get("/refdata/languages")
async def get_refdata_languages():
    """Return languages list from catalog (parsed from BusinessConfig zip upload)."""
    from ..services.catalog import get_catalog
    return get_catalog().get("languages") or []


# === Product Catalog Integration (RMCA Catalog endpoint, separate TLS) ===
async def _catalog_call(api_key: str, body: dict = None, params: dict = None):
    try:
        return await rmca_catalog_client.call(api_key, params=params, body=body)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text[:500])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

@router.get("/catalog/productOffering")
async def catalog_get_product_offering(id: str = None, externalId: str = None, type: str = None):
    q = {}
    if id: q["id"] = id
    if externalId: q["externalId"] = externalId
    if type: q["type"] = type
    return await _catalog_call("catalog_get_product_offering", params=q)

@router.get("/catalog/productOffering/list")
async def catalog_list_product_offerings(type: str = "TEMPLATE"):
    return await _catalog_call("catalog_get_product_offering", params={"type": type})

@router.post("/catalog/productOffering")
async def catalog_create_product_offering(body: dict):
    return await _catalog_call("catalog_create_product_offering", body=body)

@router.patch("/catalog/productOffering/{id}/version/{version}")
async def catalog_update_product_offering_by_id(id: str, version: str, body: dict):
    return await _catalog_call("catalog_update_product_offering_by_id", body=body, params={"id": id, "version": version})

@router.patch("/catalog/productOffering/externalId/{externalId}/version/{version}")
async def catalog_update_product_offering_by_external_id(externalId: str, version: str, body: dict):
    return await _catalog_call("catalog_update_product_offering_by_external_id", body=body, params={"externalId": externalId, "version": version})

# === Purchase Charge Management ===
@router.post("/purchase/cancelReservation")
async def purchase_cancel_reservation(body: dict):
    return await _call("purchase_cancel_reservation", body=body)

@router.post("/purchase/rateAndDeduct")
async def purchase_rate_and_deduct(body: dict):
    return await _call("purchase_rate_and_deduct", body=body)

@router.post("/purchase/rateAndReserve")
async def purchase_rate_and_reserve(body: dict):
    return await _call("purchase_rate_and_reserve", body=body)

@router.post("/purchase/cancelBasketReservation")
async def purchase_cancel_basket_reservation(body: dict):
    return await _call("purchase_cancel_basket_reservation", body=body)

@router.post("/purchase/basketRateAndAdvice")
async def purchase_basket_rate_and_advice(body: dict):
    return await _call("purchase_basket_rate_and_advice", body=body)

@router.post("/purchase/basketRateAndDeduct")
async def purchase_basket_rate_and_deduct(body: dict):
    return await _call("purchase_basket_rate_and_deduct", body=body)

@router.post("/purchase/basketRateAndExecute")
async def purchase_basket_rate_and_execute(body: dict):
    return await _call("purchase_basket_rate_and_execute", body=body)

@router.post("/purchase/basketRateAndReserve")
async def purchase_basket_rate_and_reserve(body: dict):
    return await _call("purchase_basket_rate_and_reserve", body=body)

# === Session Management ===
@router.post("/session/createPolicySession")
async def create_policy_session(body: dict):
    return await _call("create_policy_session", body=body)

@router.post("/session/moveChargingSession")
async def move_charging_session(body: dict):
    return await _call("move_charging_session", body=body)


# === Specification Enquiry (missing) ===
@router.get("/spec/agreementItem")
async def spec_agreement_item(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_agreement_item", query_params=q)

@router.get("/spec/agreement")
async def spec_agreement(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_agreement", query_params=q)

@router.get("/spec/billingCycle")
async def spec_billing_cycle(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_billing_cycle", query_params=q)

@router.get("/spec/bucketDetermination")
async def spec_bucket_determination(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_bucket_determination", query_params=q)

@router.get("/spec/characteristicSet")
async def spec_characteristic_set(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_characteristic_set", query_params=q)

@router.get("/spec/commonDimension")
async def spec_common_dimension(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_common_dimension", query_params=q)

@router.get("/spec/commonDimensionSpec")
async def spec_common_dimension_spec(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_common_dimension_spec", query_params=q)

@router.get("/spec/communicationIdentifier")
async def spec_communication_identifier(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_communication_identifier", query_params=q)

@router.get("/spec/contactMedium")
async def spec_contact_medium(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_contact_medium", query_params=q)

@router.get("/spec/customerFacingService")
async def spec_customer_facing_service(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_customer_facing_service", query_params=q)

@router.get("/spec/customerList")
async def spec_customer_list(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_customer_list", query_params=q)

@router.get("/spec/customer")
async def spec_customer(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_customer", query_params=q)

@router.get("/spec/entityList")
async def spec_entity_list(specificationType: str = None):
    q = {"specificationType": specificationType} if specificationType else {}
    return await _call("spec_entity_list", query_params=q)

@router.get("/spec/genericBusinessSetting")
async def spec_generic_business_setting(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_generic_business_setting", query_params=q)

@router.get("/spec/individual")
async def spec_individual(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_individual", query_params=q)

@router.get("/spec/organization")
async def spec_organization(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_organization", query_params=q)

@router.get("/spec/partyRole")
async def spec_party_role(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_party_role", query_params=q)

@router.get("/spec/priceTaxCategory")
async def spec_price_tax_category(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_price_tax_category", query_params=q)

@router.get("/spec/product")
async def spec_product(externalId: str = None):
    q = {"productSpecificationExternalId": externalId} if externalId else {}
    return await _call("spec_product", query_params=q)

@router.get("/spec/productOffering")
async def spec_product_offering(externalId: str = None):
    q = {"productOfferingExternalId": externalId} if externalId else {}
    return await _call("spec_product_offering", query_params=q)


@router.get("/spec/productOffering/popPersonalization")
async def spec_po_pop_personalization(externalId: str = None):
    """Return personalizable POP characteristics for a product offering."""
    q = {"productOfferingExternalId": externalId} if externalId else {}
    po = await _call("spec_product_offering", query_params=q)
    po_obj = po[0] if isinstance(po, list) else po

    PERSONALIZABLE = {"CAN_BE_PERSONALIZED", "CANBE_PERSONALIZED", "MUST_BE_PERSONALIZED", "MUSTBE_PERSONALIZED"}

    def extract_char(c: dict) -> dict:
        vals = c.get("specCharacteristicValue") or []
        default_val = next((v.get("value") for v in vals if v.get("isDefault")), "")
        default_unit = next((v.get("unitOfMeasure") for v in vals if v.get("isDefault")), "")
        units = list({v["unitOfMeasure"] for v in vals if v.get("unitOfMeasure")})
        return {
            "id": c.get("id", ""),
            "externalId": c.get("externalId") or "",
            "name": c.get("name", ""),
            "valueType": c.get("valueType", ""),
            "measure": c.get("measure", ""),
            "defaultValue": default_val,
            "defaultUnit": default_unit,
            "units": units,
        }

    result = []
    seen_pop_ids = set()
    for pop in (po_obj.get("productOfferingPrice") or []):
        pop_id = pop.get("id", "")
        if pop_id in seen_pop_ids:
            continue
        seen_pop_ids.add(pop_id)

        price_rows = (
            pop.get("productOfferingPriceRow")
            or (pop.get("pricingLogicAlgorithm") or {}).get("productOfferingPriceRow")
            or []
        )
        rows_with_chars = []
        all_chars_by_id: dict = {}
        first_row_id = ""
        for row in price_rows:
            actions = (
                row.get("action")
                or (row.get("actionGroup") or {}).get("action")
                or []
            )
            chars_by_id: dict = {}
            for action in actions:
                action_id = action.get("id") or action.get("actionRef", {}).get("id") or ""
                action_ext_id = action.get("externalId") or action.get("actionRef", {}).get("externalId") or ""
                for c in (action.get("specCharacteristic") or []):
                    if (c.get("valueRegulator") or "").upper() in PERSONALIZABLE:
                        cid = c.get("id", c.get("name", ""))
                        if cid not in chars_by_id:
                            chars_by_id[cid] = {**extract_char(c), "actionId": action_id, "actionExternalId": action_ext_id}
            if chars_by_id:
                if not first_row_id:
                    first_row_id = row.get("id", "")
                rows_with_chars.append({
                    "rowId": row.get("id", ""),
                    "rowExternalId": row.get("externalId", ""),
                    "chars": list(chars_by_id.values()),
                })
                for cid, cv in chars_by_id.items():
                    if cid not in all_chars_by_id:
                        all_chars_by_id[cid] = cv

        if rows_with_chars:
            result.append({
                "popId": pop_id,
                "popExternalId": pop.get("externalId", ""),
                "popName": pop.get("name", ""),
                # new structure for rebuilt frontend
                "rows": rows_with_chars,
                # legacy flat structure for old frontend bundle — use id as externalId fallback
                "priceRowId": first_row_id,
                "chars": [{**c, "externalId": c["externalId"] or c["id"]} for c in all_chars_by_id.values()],
            })
    return result


@router.get("/spec/productOffering/popPersonalization/debug")
async def spec_po_pop_personalization_debug(externalId: str = None):
    """Debug: dump raw actionGroup/action objects to find correct id fields."""
    q = {"productOfferingExternalId": externalId} if externalId else {}
    po = await _call("spec_product_offering", query_params=q)
    po_obj = po[0] if isinstance(po, list) else po
    pops = po_obj.get("productOfferingPrice") or []
    result = []
    for p in pops:
        rows = p.get("productOfferingPriceRow") or (p.get("pricingLogicAlgorithm") or {}).get("productOfferingPriceRow") or []
        row_debug = []
        for row in rows:
            action_group = row.get("actionGroup") or {}
            actions_raw = row.get("action") or action_group.get("action") or []
            row_debug.append({
                "rowId": row.get("id"),
                "rowKeys": list(row.keys()),
                "actionGroupKeys": list(action_group.keys()),
                "actions": [dict(a) for a in actions_raw],  # full raw action objects
            })
        result.append({
            "popId": p.get("id"),
            "popExternalId": p.get("externalId"),
            "popName": p.get("name"),
            "rows": row_debug,
        })
    return result

@router.get("/spec/productOfferingPrice")
async def spec_product_offering_price(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_product_offering_price", query_params=q)

@router.get("/spec/productPriorityList")
async def spec_product_priority_list(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_product_priority_list", query_params=q)

@router.get("/spec/scheduleDefinition")
async def spec_schedule_definition(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_schedule_definition", query_params=q)

@router.get("/spec/settlementAccount")
async def spec_settlement_account(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_settlement_account", query_params=q)

@router.get("/spec/sharingProvider")
async def spec_sharing_provider(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_sharing_provider", query_params=q)

@router.get("/spec/tag")
async def spec_tag(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_tag", query_params=q)

@router.get("/spec/taxCodeDetail")
async def spec_tax_code_detail(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_tax_code_detail", query_params=q)

@router.get("/spec/taxConfiguration")
async def spec_tax_configuration(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_tax_configuration", query_params=q)

@router.get("/spec/taxExemption")
async def spec_tax_exemption(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_tax_exemption", query_params=q)

@router.get("/spec/taxPackage")
async def spec_tax_package(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_tax_package", query_params=q)

@router.get("/spec/taxRuleTemplate")
async def spec_tax_rule_template(externalId: str = None):
    q = {"externalId": externalId} if externalId else {}
    return await _call("spec_tax_rule_template", query_params=q)


# === Subscription Enquiry (extra) ===
@router.get("/subscription/consumerProduct")
async def get_consumer_product(communicationId: str = None, communicationIdType: str = "E.164", customerExternalId: str = None):
    q = {}
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    if customerExternalId: q["customerExternalId"] = customerExternalId
    return await _call("get_consumer_product", query_params=q)

@router.get("/subscription/inheritedContractList")
async def get_inherited_contract_list(communicationId: str = None, communicationIdType: str = "E.164", customerExternalId: str = None):
    q = {}
    if communicationId: q["communicationId"] = communicationId; q["communicationIdType"] = communicationIdType
    if customerExternalId: q["customerExternalId"] = customerExternalId
    return await _call("get_inherited_contract_list", query_params=q)

# === Subscription Management (extra) ===
@router.post("/subscription/changeStatus")
async def change_subscription_status(body: dict):
    return await _call("change_subscription_status", body=body)

@router.post("/subscription/consumerProduct/modify")
async def modify_consumer_product(body: dict):
    return await _call("modify_consumer_product", body=body)

@router.patch("/subscription/providerProduct/modify")
async def modify_provider_product(body: dict):
    return await _call("modify_provider_product", body=body)

# === Test Management ===
@router.post("/test/entityAdjustment/{customerId}")
async def create_entity_adjustment(customerId: str, body: dict):
    return await _call("create_entity_adjustment", body=body, path_params={"customerId": customerId})

@router.post("/test/entityAdjustment/externalId/{customerExternalId}")
async def create_entity_adjustment_by_external_id(customerExternalId: str, body: dict):
    return await _call("create_entity_adjustment_by_external_id", body=body, path_params={"customerExternalId": customerExternalId})

@router.get("/test/entityAdjustment")
async def get_entity_adjustment(customerExternalId: str = None, customerId: str = None):
    q = {}
    if customerExternalId: q["customerExternalId"] = customerExternalId
    if customerId: q["customerId"] = customerId
    return await _call("get_entity_adjustment", query_params=q)

# === User Management (extra) ===
@router.patch("/user/{userId}")
async def update_user_by_id(userId: str, body: dict):
    return await _call("update_user_by_id", body=body, path_params={"userId": userId})

@router.patch("/user/externalId/{userExternalId}")
async def update_user_by_external_id(userExternalId: str, body: dict):
    return await _call("update_user_by_external_id", body=body, path_params={"userExternalId": userExternalId})
