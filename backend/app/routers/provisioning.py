from fastapi import APIRouter, HTTPException, UploadFile, File
from pathlib import Path
import httpx
from ..services.ericsson_client import ericsson_client, load_config, api_logs, CONFIG_PATH
from ..services.catalog import get_catalog, parse_business_config, reload_catalog

SCHEMAS_DIR = Path(__file__).parent.parent / "schemas"
from ..services import provisioning as prov
from ..models.schemas import (
    SubscriberProvision, IndividualCreate, CustomerCreate,
    ContractCreate, BalanceTopUp, TerminateRequest, GenericApiRequest,
)
import json

router = APIRouter(prefix="/api/v1", tags=["provisioning"])


async def _safe_call(api_key: str, path_params: dict = None, body: dict = None, query_params: dict = None):
    try:
        return await ericsson_client.request(api_key, body=body, path_params=path_params, query_params=query_params)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text[:500])
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"API key not found in config: {e}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# === Generic API Executor ===
@router.post("/execute/{api_key}")
async def execute_api(api_key: str, body: dict = None):
    """Execute any configured API by key. Pass _pathParams/_params and _queryParams in body."""
    path_params = {}
    if body:
        path_params = body.pop("_pathParams", body.pop("_params", {}))
    query_params = body.pop("_queryParams", {}) if body and "_queryParams" in body else {}
    return await _safe_call(api_key, path_params=path_params, body=body if body else None, query_params=query_params)


@router.post("/execute")
async def execute_generic(req: GenericApiRequest):
    """Execute any configured API with structured request."""
    return await _safe_call(req.apiKey, path_params=req.pathParams, body=req.body, query_params=req.queryParams)


# === Full Provisioning Wizard ===
@router.post("/subscribers/provision")
async def provision_subscriber(body: dict):
    """Accepts either raw JSON bodies (partyBody/customerBody/contractBody) or SubscriberProvision fields."""
    try:
        if "partyBody" in body:
            # Spec-driven wizard: forward pre-built JSON bodies
            return await prov.provision_raw(
                body["partyBody"], body["customerBody"], body["contractBody"]
            )
        else:
            # Simple provisioning with field inputs
            return await prov.provision_subscriber(
                body["givenName"], body["familyName"], body["msisdn"],
                body.get("email"), body.get("productOfferingExternalId"),
                body.get("imsi"), body.get("billCycleSpecExternalId")
            )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text[:500])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# === Party ===
@router.post("/party")
async def create_party(req: IndividualCreate):
    try:
        return await prov.create_party(req.givenName, req.familyName, req.msisdn, req.email)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text[:500])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/party")
async def get_party(id: str = None, externalId: str = None):
    if id:
        return await _safe_call("get_party_by_id", path_params={"partyId": id})
    elif externalId:
        return await _safe_call("get_party_by_external_id", path_params={"partyExternalId": externalId})
    raise HTTPException(status_code=400, detail="Provide id or externalId")


@router.delete("/party/{identifier}")
async def delete_party(identifier: str, by: str = "externalId"):
    if by == "id":
        return await _safe_call("delete_party_by_id", path_params={"partyId": identifier})
    return await _safe_call("delete_party_by_external_id", path_params={"partyExternalId": identifier})


# === Customer ===
@router.post("/customer")
async def create_customer(req: CustomerCreate):
    try:
        return await prov.create_customer(req.partyExternalId, req.msisdn, req.billCycleSpecExternalId)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text[:500])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/customer")
async def get_customer(id: str = None, externalId: str = None, msisdn: str = None):
    if id:
        return await _safe_call("get_customer_by_id", path_params={"customerId": id})
    elif externalId:
        return await _safe_call("get_customer_by_external_id", path_params={"customerExternalId": externalId})
    elif msisdn:
        return await _safe_call("get_customer_by_msisdn", path_params={"msisdn": msisdn})
    raise HTTPException(status_code=400, detail="Provide id, externalId, or msisdn")


@router.delete("/customer/{identifier}")
async def delete_customer(identifier: str, by: str = "externalId"):
    if by == "id":
        return await _safe_call("delete_customer_by_id", path_params={"customerId": identifier})
    return await _safe_call("delete_customer_by_external_id", path_params={"customerExternalId": identifier})


# === Contract ===
@router.post("/contract")
async def create_contract(req: ContractCreate):
    try:
        return await prov.create_contract(req.customerExternalId, req.msisdn, req.productOfferingExternalId, req.billingAccountExternalId, req.imsi)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text[:500])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/contract")
async def get_contract(msisdn: str = None, customerExternalId: str = None, contractExternalId: str = None):
    if msisdn:
        return await _safe_call("get_contract_by_msisdn", path_params={"msisdn": msisdn})
    elif customerExternalId and contractExternalId:
        return await _safe_call("get_contract_by_external_id", path_params={"customerExternalId": customerExternalId, "contractExternalId": contractExternalId})
    raise HTTPException(status_code=400, detail="Provide msisdn or customerExternalId+contractExternalId")


@router.delete("/contract")
async def delete_contract(msisdn: str = None, customerExternalId: str = None, contractExternalId: str = None):
    if msisdn:
        return await _safe_call("delete_contract_by_msisdn", path_params={"msisdn": msisdn})
    elif customerExternalId and contractExternalId:
        return await _safe_call("delete_contract_by_external_id", path_params={"customerExternalId": customerExternalId, "contractExternalId": contractExternalId})
    raise HTTPException(status_code=400, detail="Provide msisdn or customerExternalId+contractExternalId")


# === Balance ===
@router.get("/balance")
async def balance_enquiry(msisdn: str = None, customerExternalId: str = None):
    if msisdn:
        return await _safe_call("balance_enquiry_msisdn", path_params={"msisdn": msisdn})
    elif customerExternalId:
        return await _safe_call("balance_enquiry", path_params={"customerExternalId": customerExternalId})
    raise HTTPException(status_code=400, detail="Provide msisdn or customerExternalId")


@router.post("/balance/topup")
async def balance_topup(req: BalanceTopUp):
    try:
        return await prov.balance_topup(req.customerExternalId, req.contractExternalId, req.msisdn, req.amount, req.unit, req.decimalPlaces)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text[:500])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# === Terminate ===
@router.post("/terminate/party")
async def terminate_party(req: TerminateRequest):
    try:
        return await prov.terminate_party(req.externalId)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text[:500])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/terminate/customer")
async def terminate_customer_ep(req: TerminateRequest):
    try:
        return await prov.terminate_customer(req.externalId)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text[:500])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# === Specification Enquiry ===
@router.get("/spec/{spec_type}")
async def get_specification(spec_type: str, externalId: str):
    key = f"spec_{spec_type}"
    return await _safe_call(key, path_params={"specExternalId": externalId})


# === Settings ===
@router.get("/settings")
async def get_settings():
    cfg = load_config()
    # Mask sensitive fields
    safe = json.loads(json.dumps(cfg))
    if safe.get("auth", {}).get("password"):
        safe["auth"]["password"] = "***"
    if safe.get("tls", {}).get("client_key_path"):
        safe["tls"]["client_key_path"] = "***"
    return safe


@router.put("/settings")
async def update_settings(body: dict):
    existing = load_config()
    # Restore masked fields from existing config
    if body.get("auth", {}).get("password") == "***":
        body["auth"]["password"] = existing.get("auth", {}).get("password", "")
    if body.get("tls", {}).get("client_key_path") == "***":
        body["tls"]["client_key_path"] = existing.get("tls", {}).get("client_key_path", "")
    with open(CONFIG_PATH, "w") as f:
        json.dump(body, f, indent=2)
    ericsson_client.reinit()
    return {"status": "ok"}


# === API Logs ===
@router.get("/logs")
async def get_api_logs(limit: int = 50, offset: int = 0):
    logs = list(reversed(api_logs))
    return logs[offset:offset + limit]


@router.delete("/logs/clear")
async def clear_api_logs():
    api_logs.clear()
    return {"status": "ok"}


# === Config: Available APIs ===
@router.get("/config/apis")
async def get_available_apis():
    """List all configured API keys with their method and URL template."""
    cfg = load_config()
    return {k: {"method": v["method"], "url": v["url"]} for k, v in cfg.get("apis", {}).items()}


@router.get("/config/offerings")
async def get_offerings():
    """Return product offerings from defaults."""
    cfg = load_config()
    return cfg.get("defaults", {})


# === Catalog / Specs ===
@router.get("/specs")
async def get_specs():
    """Get parsed RMCA specifications (from uploaded BusinessConfig)."""
    catalog = reload_catalog()
    if not any(catalog.get(k) for k in catalog):
        return None
    # Frontend expects 'partySpecifications' but catalog stores 'individualPartySpecifications'
    return {
        "partySpecifications": catalog.get("individualPartySpecifications", []),
        "customerSpecifications": catalog.get("customerSpecifications", []),
        "contractSpecifications": catalog.get("contractSpecifications", []),
        "billingAccountSpecifications": catalog.get("billingAccountSpecifications", []),
        "productSpecifications": catalog.get("productSpecifications", []),
        "productOfferings": catalog.get("productOfferings", []),
        "resourceSpecifications": catalog.get("resourceSpecifications", []),
        "bucketTags": catalog.get("bucketTags", []),
        "characteristicSetSpecifications": catalog.get("characteristicSetSpecifications", []),
        "customerFacingServiceSpecifications": catalog.get("customerFacingServiceSpecifications", []),
        "billingCycleSpecifications": catalog.get("billingCycleSpecifications", []),
        "scheduleDefinitions": catalog.get("scheduleDefinitions", []),
        "contactMediumSpecifications": catalog.get("contactMediumSpecifications", []),
    }


@router.post("/specs/upload")
async def upload_specs(file: UploadFile = File(...)):
    """Upload an RMCA BusinessConfig zip/json and parse specifications."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        result = parse_business_config(content)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse: {e}")


# === Cert Upload ===
@router.post("/certs/upload")
async def upload_cert(file: UploadFile = File(...), name: str = "cert"):
    """Upload a cert/key file to config/certs/ directory."""
    certs_dir = Path(__file__).parent.parent.parent.parent / "config" / "certs"
    certs_dir.mkdir(parents=True, exist_ok=True)
    dest = certs_dir / file.filename
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    dest.write_bytes(content)
    return {"path": str(dest.resolve())}


# === JSON Schemas ===
@router.get("/schemas")
async def list_schemas():
    """List available JSON schemas."""
    if not SCHEMAS_DIR.exists():
        return []
    return [f.stem for f in SCHEMAS_DIR.glob("*.json")]


@router.get("/schemas/{schema_name}")
async def get_schema(schema_name: str):
    """Get a specific JSON schema for frontend form generation."""
    path = SCHEMAS_DIR / f"{schema_name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Schema not found: {schema_name}")
    import json as _json
    return _json.loads(path.read_text(encoding="utf-8"))
