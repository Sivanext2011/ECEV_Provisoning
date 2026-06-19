from fastapi import APIRouter, HTTPException, UploadFile, File
import httpx
from ..services.bae_client import bae_client, load_config, api_logs, CONFIG_PATH
from ..services.specs.parser import parse_business_config, get_parsed_specs
import json

router = APIRouter(prefix="/api/v1", tags=["provisioning"])


async def _safe_call(api_key: str, params: dict = None, body: dict = None):
    """Wrapper that converts exceptions to HTTPException with detail."""
    try:
        return await bae_client.call(api_key, params=params, body=body)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text[:500])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# === Generic API Executor ===
@router.post("/execute/{api_key}")
async def execute_api(api_key: str, body: dict = None):
    """Execute any configured API by key with params and body."""
    params = body.pop("_params", {}) if body and "_params" in body else {}
    return await _safe_call(api_key, params=params, body=body if body else None)


# === Party ===
@router.post("/party")
async def create_party(body: dict):
    return await bae_client.call("create_party", body=body)


@router.get("/party")
async def get_party(id: str = None, externalId: str = None):
    if id:
        return await _safe_call("get_party_by_id", params={"partyId": id})
    elif externalId:
        return await _safe_call("get_party_by_external_id", params={"partyExternalId": externalId})
    raise HTTPException(status_code=400, detail="Provide id or externalId")


@router.patch("/party/{external_id}")
async def update_party(external_id: str, body: dict):
    return await bae_client.call("update_party", params={"partyExternalId": external_id}, body=body)


@router.delete("/party/{identifier}")
async def delete_party(identifier: str, by: str = "externalId"):
    if by == "id":
        return await _safe_call("delete_party_by_id", params={"partyId": identifier})
    return await _safe_call("delete_party_by_external_id", params={"partyExternalId": identifier})


# === Customer ===
@router.post("/customer")
async def create_customer(body: dict):
    return await bae_client.call("create_customer", body=body)


@router.get("/customer")
async def get_customer(id: str = None, externalId: str = None, msisdn: str = None):
    if id:
        return await bae_client.call("get_customer_by_id", params={"customerId": id})
    elif externalId:
        return await bae_client.call("get_customer_by_external_id", params={"customerExternalId": externalId})
    elif msisdn:
        return await bae_client.call("get_customer_by_msisdn", params={"msisdn": msisdn})
    raise HTTPException(status_code=400, detail="Provide id, externalId, or msisdn")


@router.patch("/customer/{external_id}")
async def update_customer(external_id: str, body: dict):
    return await bae_client.call("update_customer", params={"customerExternalId": external_id}, body=body)


@router.delete("/customer/{identifier}")
async def delete_customer(identifier: str, by: str = "externalId"):
    if by == "id":
        return await bae_client.call("delete_customer_by_id", params={"customerId": identifier})
    return await bae_client.call("delete_customer_by_external_id", params={"customerExternalId": identifier})


# === Contract / Subscription ===
@router.post("/contract")
async def create_contract(body: dict, customerExternalId: str = None, customerId: str = None):
    if customerExternalId:
        return await bae_client.call("create_contract", params={"customerExternalId": customerExternalId}, body=body)
    elif customerId:
        return await bae_client.call("create_contract_by_id", params={"customerId": customerId}, body=body)
    raise HTTPException(status_code=400, detail="Provide customerExternalId or customerId")


@router.get("/contract")
async def get_contract(customerId: str = None, contractId: str = None, customerExternalId: str = None, contractExternalId: str = None, msisdn: str = None):
    if customerId and contractId:
        return await bae_client.call("get_contract_by_id", params={"customerId": customerId, "contractId": contractId})
    elif customerExternalId and contractExternalId:
        return await bae_client.call("get_contract_by_external_id", params={"customerExternalId": customerExternalId, "contractExternalId": contractExternalId})
    elif msisdn:
        return await bae_client.call("get_contract_by_msisdn", params={"msisdn": msisdn})
    raise HTTPException(status_code=400, detail="Provide customerId+contractId, customerExternalId+contractExternalId, or msisdn")


@router.patch("/contract")
async def update_contract(body: dict, customerExternalId: str = None, contractExternalId: str = None, customerId: str = None, contractId: str = None):
    if customerExternalId and contractExternalId:
        return await bae_client.call("update_contract", params={"customerExternalId": customerExternalId, "contractExternalId": contractExternalId}, body=body)
    elif customerId and contractId:
        return await bae_client.call("update_contract_by_id", params={"customerId": customerId, "contractId": contractId}, body=body)
    raise HTTPException(status_code=400, detail="Provide customerExternalId+contractExternalId or customerId+contractId")


@router.delete("/contract")
async def delete_contract(customerExternalId: str = None, contractExternalId: str = None, customerId: str = None, contractId: str = None, msisdn: str = None):
    if msisdn:
        return await bae_client.call("delete_contract_by_msisdn", params={"msisdn": msisdn})
    elif customerExternalId and contractExternalId:
        return await bae_client.call("delete_contract_by_external_id", params={"customerExternalId": customerExternalId, "contractExternalId": contractExternalId})
    elif customerId and contractId:
        return await bae_client.call("delete_contract_by_id", params={"customerId": customerId, "contractId": contractId})
    raise HTTPException(status_code=400, detail="Provide identifiers")


# === Balance ===
@router.get("/balance")
async def balance_enquiry(customerExternalId: str = None, msisdn: str = None):
    if msisdn:
        return await bae_client.call("balance_enquiry_msisdn", params={"msisdn": msisdn})
    elif customerExternalId:
        return await bae_client.call("balance_enquiry", params={"customerExternalId": customerExternalId})
    raise HTTPException(status_code=400, detail="Provide customerExternalId or msisdn")


@router.post("/balance/adjust")
async def balance_adjustment(body: dict):
    return await bae_client.call("balance_adjustment", body=body)


# === Resource Management ===
@router.post("/resource/swap")
async def swap_resource(body: dict):
    return await bae_client.call("swap_logical_resource", body=body)


@router.post("/product/replace")
async def replace_product(body: dict):
    return await bae_client.call("replace_product", body=body)


# === User ===
@router.post("/user")
async def create_user(body: dict):
    return await bae_client.call("create_user", body=body)


@router.get("/user")
async def get_user(externalId: str = None):
    if externalId:
        return await bae_client.call("get_user_by_external_id", params={"userExternalId": externalId})
    raise HTTPException(status_code=400, detail="Provide externalId")


@router.delete("/user/{user_id}")
async def delete_user(user_id: str):
    return await bae_client.call("delete_user_by_id", params={"userId": user_id})


# === Sharing ===
@router.get("/sharing/eligible-consumers")
async def get_eligible_consumers(customerExternalId: str):
    return await bae_client.call("get_eligible_consumers", params={"customerExternalId": customerExternalId})


# === Recurrence ===
@router.get("/recurrence")
async def recurrence_enquiry(msisdn: str):
    return await bae_client.call("recurrence_enquiry", params={"msisdn": msisdn})


@router.post("/recurrence/job")
async def create_recurrence_job(body: dict):
    return await bae_client.call("create_recurrence_job", body=body)


# === Specification Enquiry ===
@router.get("/spec/{spec_type}")
async def get_specification(spec_type: str, externalId: str):
    key = f"spec_{spec_type}"
    if key not in bae_client.apis:
        raise HTTPException(status_code=400, detail=f"Unknown spec type: {spec_type}. Available: contract, product, product_offering, bucket, billing_account")
    return await bae_client.call(key, params={"specExternalId": externalId})


# === Auth - Token ===
@router.post("/auth/token")
async def get_token():
    """Force fetch a new token from Keycloak."""
    try:
        bae_client.token_mgr.fetch_token()
        return {
            "status": "ok",
            "expires_at": bae_client.token_mgr.expires_at,
            "has_access_token": bool(bae_client.token_mgr.access_token),
            "has_id_token": bool(bae_client.token_mgr.id_token),
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token fetch failed: {e}")


# === Settings ===
@router.get("/settings")
async def get_settings():
    cfg = load_config()
    # Mask password
    if cfg.get("auth", {}).get("password"):
        cfg["auth"]["password"] = "***"
    return cfg


@router.put("/settings")
async def update_settings(body: dict):
    # If password is masked, keep existing
    existing = load_config()
    if body.get("auth", {}).get("password") == "***":
        body["auth"]["password"] = existing.get("auth", {}).get("password", "")
    with open(CONFIG_PATH, "w") as f:
        json.dump(body, f, indent=2)
    bae_client.reload()
    return {"status": "ok"}


# === Logs ===
@router.get("/logs")
async def get_api_logs():
    return list(reversed(api_logs[-200:]))


@router.delete("/logs/clear")
async def clear_api_logs():
    api_logs.clear()
    return {"status": "ok"}


# === Debug ===
@router.get("/debug/client")
async def debug_client():
    """Show current BAE client state for debugging."""
    from pathlib import Path
    tls = bae_client.tls_cfg
    net = bae_client.network_cfg
    ca = tls.get("ca_cert_path", "")
    cert = tls.get("client_cert_path", "")
    key = tls.get("client_key_path", "")
    return {
        "verify": str(bae_client._verify),
        "client_cert": str(bae_client._client_cert),
        "ssl_verify_config": tls.get("ssl_verify"),
        "ca_cert_path": ca,
        "ca_cert_exists": Path(ca).exists() if ca else False,
        "client_cert_path": cert,
        "client_cert_exists": Path(cert).exists() if cert else False,
        "client_key_path": key,
        "client_key_exists": Path(key).exists() if key else False,
        "socks5_enabled": net.get("socks5_enabled", False),
        "socks5_proxy": net.get("socks5_proxy", ""),
        "timeout": net.get("timeout_seconds", 30),
        "environment": bae_client.env,
        "token_configured": bool(bae_client.auth_cfg.get("username") and bae_client.auth_cfg.get("password")),
    }


# === Cert Upload ===
@router.post("/certs/upload")
async def upload_cert(file: UploadFile = File(...), name: str = ""):
    from pathlib import Path
    certs_dir = Path(CONFIG_PATH).parent / "certs"
    certs_dir.mkdir(exist_ok=True)
    filename = f"{name}_{file.filename}" if name else file.filename
    dest = certs_dir / filename
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)
    return {"path": str(dest.resolve())}


# === Full Provisioning Wizard ===
@router.post("/subscribers/provision")
async def provision_subscriber(body: dict):
    """Full provisioning: Create Party → Customer → Contract with base plan."""
    results = {}
    cfg = load_config()
    defaults = cfg.get("defaults", {})

    # 1. Create Party
    party_body = {
        "externalId": body.get("partyExternalId", f"extID-party-{body.get('msisdn')}"),
        "givenName": body.get("givenName"),
        "familyName": body.get("familyName"),
        "individualSpecification": {"externalId": body.get("partySpecId", defaults.get("partySpecExternalId", ""))},
    }
    if body.get("partyCharacteristics"):
        party_body["characteristic"] = [
            {"charSpecExternalId": k, "value": [{"value": v}]} for k, v in body["partyCharacteristics"].items() if v
        ]
    try:
        results["party"] = await bae_client.call("create_party", body=party_body)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Create Party failed: {e}")

    # 2. Create Customer
    # engagedParty references the party by externalId
    # characteristic tells BAE the rating type (internal/external)
    party_external_id = body.get("partyExternalId", f"extID-party-{body.get('msisdn')}")
    customer_body = {
        "externalId": body.get("customerExternalId", f"extID-customer-{body.get('msisdn')}"),
        "customerSpecification": {"externalId": body.get("customerSpecId", defaults.get("customerSpecExternalId", ""))},
        "status": [{"status": "CustomerActive"}],
        "account": [
            {
                "externalId": body.get("customerBAExternalId", f"extID_BA-{body.get('msisdn')}"),
                "billingAccountSpecExternalId": body.get("billingAccountSpecId") or defaults.get("billingAccountSpecExternalId") or "MISSING_BA_SPEC",
                "status": [{"status": "BillingAccountActive"}],
                **({
                    "customerBillCycleSpecification": [
                        {
                            "externalId": body.get("customerBCSExternalId", "extID_BCS"),
                            "billCycleSpecExternalId": body.get("billCycleSpecId")
                        }
                    ]
                } if body.get("billCycleSpecId") else {}),
                **({
                    "characteristic": [
                        {"charSpecExternalId": k, "value": [{"value": v}]}
                        for k, v in body.get("billingAccountCharacteristics", {}).items() if v
                    ]
                } if body.get("billingAccountCharacteristics") else {})
            }
        ],
        "engagedParty": {
            "externalId": party_external_id,
            "@referredType": body.get("engagedPartyType", "Individual")
        },
        **({
            "homeTimeZone": [{"timeZone": body.get("customerHTZ")}]
        } if body.get("customerHTZ") else {}),
        "characteristic": []
    }
    if body.get("customerCharacteristics"):
        customer_body["characteristic"] = [
            {"charSpecExternalId": k, "value": [{"value": v}]} for k, v in body["customerCharacteristics"].items() if v
        ]
    try:
        results["customer"] = await bae_client.call("create_customer", body=customer_body)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Create Customer failed: {e}")

    # 3. Create Contract with base plan
    contract_body = {
        "externalId": body.get("msisdn"),
        "contractSpecification": {"externalId": body.get("contractSpecId", defaults.get("contractSpecExternalId", ""))},
        "productOffering": {"externalId": body.get("productOfferingId", defaults.get("basePlanProductOfferingExternalId", ""))},
        "communicationIdentifier": [{"communicationId": body.get("msisdn"), "communicationIdType": "E.164"}],
    }
    if body.get("contractCharacteristics"):
        contract_body["characteristic"] = [
            {"charSpecExternalId": k, "value": [{"value": v}]} for k, v in body["contractCharacteristics"].items() if v
        ]
    try:
        results["contract"] = await bae_client.call(
            "create_contract", params={"customerExternalId": body.get("msisdn")}, body=contract_body
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Create Contract failed: {e}")

    return results


# === Spec Upload & Parsing ===
@router.post("/specs/upload")
async def upload_business_config(file: UploadFile = File(...)):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a .zip")
    content = await file.read()
    try:
        result = parse_business_config(content)
        return {
            "status": "ok",
            "partySpecs": len(result["partySpecifications"]),
            "customerSpecs": len(result["customerSpecifications"]),
            "contractSpecs": len(result["contractSpecifications"]),
            "billingAccountSpecs": len(result["billingAccountSpecifications"]),
            "productOfferings": len(result["productOfferings"]),
            "contactMediumSpecs": len(result["contactMediumSpecifications"]),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse: {e}")


@router.get("/specs")
async def get_specs():
    specs = get_parsed_specs()
    if not specs:
        raise HTTPException(status_code=404, detail="No specs loaded. Upload a BusinessConfig zip first.")
    return specs


@router.get("/specs/{spec_type}")
async def get_spec_by_type(spec_type: str):
    specs = get_parsed_specs()
    if not specs:
        raise HTTPException(status_code=404, detail="No specs loaded.")
    if spec_type not in specs:
        raise HTTPException(status_code=400, detail=f"Unknown spec type: {spec_type}")
    return specs[spec_type]


# === Config Offerings (legacy compat) ===
@router.get("/config/offerings")
async def get_offerings():
    specs = get_parsed_specs()
    if specs:
        return specs.get("productOfferings", [])
    return []
