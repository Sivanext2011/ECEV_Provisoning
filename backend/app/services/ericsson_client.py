import httpx
import ssl
import json
import re
import os
import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(os.environ.get("CONFIG_PATH", Path(__file__).parent.parent.parent.parent / "config" / "config.json"))

api_logs: list[dict] = []
_config_cache: dict | None = None
_config_mtime: float = 0


def load_config() -> dict:
    global _config_cache, _config_mtime
    try:
        mtime = CONFIG_PATH.stat().st_mtime
    except OSError:
        mtime = 0
    if _config_cache is None or mtime != _config_mtime:
        with open(CONFIG_PATH) as f:
            _config_cache = json.load(f)
        _config_mtime = mtime
    return _config_cache


def invalidate_config_cache():
    global _config_cache, _config_mtime
    _config_cache = None
    _config_mtime = 0


class EricssonClient:
    def __init__(self):
        self._token: str = ""
        self._token_expiry: float = 0
        self._token_lock = asyncio.Lock()
        self._client: httpx.AsyncClient | None = None
        self._reload_config()

    def _reload_config(self):
        cfg = load_config()
        self.env = cfg.get("environment", {})
        self.auth_cfg = cfg.get("auth", {})
        self.tls_cfg = cfg.get("tls", {})
        self.network_cfg = cfg.get("network", {})
        self.apis = cfg.get("apis", {})

    def _build_client(self) -> httpx.AsyncClient:
        ca_cert = self.tls_cfg.get("ca_cert_path", "")
        client_cert = self.tls_cfg.get("client_cert_path", "")
        client_key = self.tls_cfg.get("client_key_path", "")
        ssl_verify = self.tls_cfg.get("ssl_verify", False)

        # Build SSL context with mTLS support
        if client_cert and Path(client_cert).exists():
            ctx = ssl.create_default_context()
            if not ssl_verify:
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
            else:
                # Load all CA certs from the certs directory for server verification
                certs_dir = Path(ca_cert).parent if ca_cert and Path(ca_cert).exists() else None
                if certs_dir:
                    for cert_file in certs_dir.glob("*.crt"):
                        try:
                            ctx.load_verify_locations(cafile=str(cert_file))
                        except Exception:
                            pass
            # Always load client cert for mTLS
            ctx.load_cert_chain(client_cert, client_key if client_key and Path(client_key).exists() else None)
            verify = ctx
        elif not ssl_verify:
            verify = False
        else:
            verify = True

        timeout = self.network_cfg.get("timeout_seconds", 30)
        proxy = self.network_cfg.get("socks5_proxy", "") if self.network_cfg.get("socks5_enabled", False) else ""

        if proxy:
            try:
                import httpx_socks
                transport = httpx_socks.AsyncProxyTransport.from_url(proxy, verify=verify)
                return httpx.AsyncClient(timeout=timeout, transport=transport)
            except ImportError:
                logger.warning("httpx_socks not installed, ignoring proxy")

        return httpx.AsyncClient(timeout=timeout, verify=verify)

    async def _ensure_client(self):
        if not self._client:
            self._client = self._build_client()

    async def _get_token(self) -> str:
        """Get OAuth2 token using password grant with lock to prevent race conditions."""
        now = datetime.now(timezone.utc).timestamp()
        if self._token and now < self._token_expiry:
            return self._token

        async with self._token_lock:
            # Double-check after acquiring lock
            now = datetime.now(timezone.utc).timestamp()
            if self._token and now < self._token_expiry:
                return self._token

            endpoint = self.auth_cfg.get("token_endpoint", "")
            if not endpoint:
                return ""

            data = {
                "grant_type": self.auth_cfg.get("grant_type", "password"),
                "client_id": self.auth_cfg.get("client_id", ""),
                "username": self.auth_cfg.get("username", ""),
                "password": self.auth_cfg.get("password", ""),
                "scope": self.auth_cfg.get("scope", "openid"),
            }

            # Token endpoint doesn't require mTLS - use a plain client with no verify
            timeout = self.network_cfg.get("timeout_seconds", 30)
            async with httpx.AsyncClient(timeout=timeout, verify=False) as token_client:
                try:
                    r = await token_client.post(endpoint, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
                    self._log("POST", endpoint, r.status_code, {"grant_type": data["grant_type"], "client_id": data["client_id"]}, r.text)
                    r.raise_for_status()
                    token_data = r.json()
                    self._token = token_data.get("access_token", "")
                    expires_in = token_data.get("expires_in", 300)
                    self._token_expiry = now + expires_in - 30
                    return self._token
                except httpx.HTTPStatusError:
                    raise
                except Exception as e:
                    self._log("POST", endpoint, "ERROR", {"grant_type": data.get("grant_type")}, str(e))
                    logger.error(f"Token fetch failed: {e}")
                    raise

    def _invalidate_token(self):
        self._token = ""
        self._token_expiry = 0

    def _resolve_url(self, api_key: str, path_params: dict = None) -> tuple[str, str]:
        """Resolve URL template from config, replacing {{VAR}} with env vars and path params."""
        api = self.apis[api_key]
        url_template = api["url"]
        method = api["method"]

        def replace_env(match):
            var = match.group(1)
            return self.env.get(var, "")

        url = re.sub(r"\{\{([A-Z_]+)\}\}", replace_env, url_template)

        if path_params:
            for k, v in path_params.items():
                url = url.replace(f"{{{{{k}}}}}", v)

        return url, method

    def _log(self, method: str, url: str, status: int, req_body=None, resp_text=""):
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "method": method,
            "url": url,
            "status": status,
            "request_body": req_body,
            "response_body": resp_text[:2000] if resp_text else "",
        }
        api_logs.append(entry)
        if len(api_logs) > 500:
            api_logs.pop(0)

    async def request(self, api_key: str, body: dict = None, path_params: dict = None, query_params: dict = None) -> dict:
        await self._ensure_client()
        url, method = self._resolve_url(api_key, path_params)
        # Use defaultBody from config if no body provided
        if body is None and "defaultBody" in self.apis.get(api_key, {}):
            body = self.apis[api_key]["defaultBody"]
        token = await self._get_token()

        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        logger.info(f"{method} {url}")

        try:
            r = await self._do_request(method, url, headers, body, query_params)
        except Exception as e:
            self._log(method, url, "ERROR", body, str(e))
            raise

        # On 401, invalidate token and retry once
        if r.status_code == 401:
            self._invalidate_token()
            token = await self._get_token()
            if token:
                headers["Authorization"] = f"Bearer {token}"
            try:
                r = await self._do_request(method, url, headers, body, query_params)
            except Exception as e:
                self._log(method, url, "ERROR", body, str(e))
                raise

        self._log(method, url, r.status_code, body, r.text)
        r.raise_for_status()

        if r.status_code == 204 or not r.text:
            return {"status": "ok"}
        return r.json()

    async def _do_request(self, method: str, url: str, headers: dict, body: dict = None, query_params: dict = None) -> httpx.Response:
        if method == "GET":
            return await self._client.get(url, headers=headers, params=query_params)
        elif method == "POST":
            return await self._client.post(url, json=body, headers=headers, params=query_params)
        elif method == "PUT":
            return await self._client.put(url, json=body, headers=headers, params=query_params)
        elif method == "PATCH":
            return await self._client.patch(url, json=body, headers=headers, params=query_params)
        elif method == "DELETE":
            return await self._client.delete(url, headers=headers, params=query_params)
        raise ValueError(f"Unsupported method: {method}")

    def reinit(self):
        """Reload config and reset client + token."""
        invalidate_config_cache()
        self._reload_config()
        self._token = ""
        self._token_expiry = 0
        self._client = None

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None


ericsson_client = EricssonClient()
