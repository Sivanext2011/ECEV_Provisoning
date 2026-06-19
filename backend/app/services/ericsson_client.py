import httpx
import ssl
import json
import logging
from datetime import datetime, timedelta, timezone
from jose import jwt
from tenacity import retry, stop_after_attempt, wait_fixed
from pathlib import Path
import httpx_socks

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).parent.parent.parent.parent / "config" / "config.json"

api_logs: list[dict] = []


def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)


def _build_client(svc_cfg: dict) -> httpx.AsyncClient:
    ssl_verify = svc_cfg.get("ssl_verify", False)
    ca_cert = svc_cfg.get("ca_cert_path", "")

    if not ssl_verify:
        verify = False
    elif ca_cert:
        verify = ssl.create_default_context(cafile=ca_cert)
    else:
        verify = True

    timeout = svc_cfg.get("timeout_seconds", 30)
    proxy = svc_cfg.get("socks5_proxy", "")

    if proxy:
        transport = httpx_socks.AsyncProxyTransport.from_url(proxy, verify=verify)
        return httpx.AsyncClient(timeout=timeout, transport=transport)
    return httpx.AsyncClient(timeout=timeout, verify=verify)


class EricssonClient:
    def __init__(self):
        cfg = load_config()
        self.cpm_cfg = cfg["cpm"]
        self.cha_cfg = cfg["cha"]
        self.auth_cfg = cfg.get("auth", {})
        self.apis = cfg["apis"]
        self._cpm_client = _build_client(self.cpm_cfg)
        self._cha_client = _build_client(self.cha_cfg)

    def _get_client(self, service: str) -> httpx.AsyncClient:
        return self._cpm_client if service == "cpm" else self._cha_client

    def _get_base_url(self, service: str) -> str:
        cfg = self.cpm_cfg if service == "cpm" else self.cha_cfg
        return cfg["base_url"]

    def _headers(self) -> dict:
        h = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        token = self.auth_cfg.get("token", "")
        if token:
            h["Authorization"] = f"Bearer {token}"
        elif self.auth_cfg.get("jwt_secret"):
            payload = {
                "iss": self.auth_cfg.get("jwt_issuer", "provisioning-tool"),
                "iat": datetime.now(timezone.utc),
                "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            }
            t = jwt.encode(payload, self.auth_cfg["jwt_secret"], algorithm="HS256")
            h["Authorization"] = f"Bearer {t}"
        return h

    def _resolve_url(self, api_key: str, path_params: dict = None) -> tuple[str, str]:
        api = self.apis[api_key]
        service = api["service"]
        path = api["path"]
        if path_params:
            for k, v in path_params.items():
                path = path.replace(f"{{{k}}}", v)
        url = f"{self._get_base_url(service)}{path}"
        return url, service

    def _log(self, method: str, url: str, status: int, req_body=None, resp_text=""):
        api_logs.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "method": method,
            "url": url,
            "status": status,
            "request_body": req_body,
            "response_body": resp_text[:2000],
        })

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(1))
    async def request(self, api_key: str, body: dict = None, path_params: dict = None, query_params: dict = None) -> dict:
        api = self.apis[api_key]
        method = api["method"]
        url, service = self._resolve_url(api_key, path_params)
        client = self._get_client(service)
        headers = self._headers()

        logger.info(f"{method} {url}")

        if method == "GET":
            r = await client.get(url, headers=headers, params=query_params)
        elif method == "POST":
            r = await client.post(url, json=body, headers=headers, params=query_params)
        elif method == "PUT":
            r = await client.put(url, json=body, headers=headers, params=query_params)
        elif method == "PATCH":
            r = await client.patch(url, json=body, headers=headers, params=query_params)
        elif method == "DELETE":
            r = await client.delete(url, headers=headers, params=query_params)
        else:
            raise ValueError(f"Unsupported method: {method}")

        self._log(method, url, r.status_code, body, r.text)
        r.raise_for_status()
        if r.status_code == 204 or not r.text:
            return {"status": "ok"}
        return r.json()

    async def close(self):
        await self._cpm_client.aclose()
        await self._cha_client.aclose()


ericsson_client = EricssonClient()
