import httpx
import ssl
import json
import re
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type

logger = logging.getLogger(__name__)

import os
CONFIG_PATH = Path(os.environ.get("CONFIG_PATH", Path(__file__).parent.parent.parent.parent / "config" / "config.json"))

# In-memory API call log
api_logs: list[dict] = []


def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return json.load(f)


class TokenManager:
    """Handles Keycloak OAuth2 token lifecycle."""

    def __init__(self, auth_cfg: dict, env_cfg: dict, ssl_ctx, proxy: str = ""):
        self.auth_cfg = auth_cfg
        self.env_cfg = env_cfg
        self.ssl_ctx = ssl_ctx
        self.proxy = proxy
        self.access_token: str = ""
        self.id_token: str = ""
        self.expires_at: float = 0

    def _token_url(self) -> str:
        url = self.auth_cfg.get("token_endpoint", "")
        return self._resolve_vars(url)

    def _resolve_vars(self, url: str) -> str:
        for k, v in self.env_cfg.items():
            url = url.replace(f"{{{{{k}}}}}", v)
        return url

    def is_expired(self) -> bool:
        return time.time() >= (self.expires_at - 30)

    def fetch_token(self):
        """Obtain token from Keycloak using password grant."""
        url = self._token_url()
        if not url or not self.auth_cfg.get("username") or not self.auth_cfg.get("password"):
            logger.warning("Auth not configured - skipping token fetch")
            return

        data = {
            "grant_type": "password",
            "client_id": self.auth_cfg.get("client_id", "AuthorizationClient"),
            "username": self.auth_cfg["username"],
            "password": self.auth_cfg["password"],
            "scope": self.auth_cfg.get("scope", "openid"),
        }

        verify = self.ssl_ctx if self.ssl_ctx else False
        with httpx.Client(timeout=15, verify=verify) as client:
            r = client.post(url, data=data)
            api_logs.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "method": "POST", "url": url,
                "status": r.status_code, "request_body": {"grant_type": "password", "username": data["username"]},
                "response_body": r.text[:500]
            })
            r.raise_for_status()
            token_data = r.json()

        self.access_token = token_data.get("access_token", "")
        self.id_token = token_data.get("id_token", "")
        self.expires_at = time.time() + token_data.get("expires_in", 300)
        logger.info(f"Token obtained, expires in {token_data.get('expires_in')}s")

    def get_access_token(self) -> str:
        if self.is_expired():
            self.fetch_token()
        return self.access_token

    def get_id_token(self) -> str:
        if self.is_expired():
            self.fetch_token()
        return self.id_token


class BAEClient:
    """Client for BAE/BSSF REST APIs with mTLS and auto-auth."""

    def __init__(self):
        self._load()

    def _load(self):
        cfg = load_config()
        self.env = cfg.get("environment", {})
        self.auth_cfg = cfg.get("auth", {})
        self.tls_cfg = cfg.get("tls", {})
        self.network_cfg = cfg.get("network", {})
        self.apis = cfg.get("apis", {})
        self.defaults = cfg.get("defaults", {})

        # Build SSL context
        self.ssl_ctx = self._build_ssl()

        # Token manager
        self.token_mgr = TokenManager(
            self.auth_cfg, self.env, self.ssl_ctx,
            self.network_cfg.get("socks5_proxy", "")
        )

        # HTTP client
        verify = self.ssl_ctx if self.ssl_ctx else False
        timeout = self.network_cfg.get("timeout_seconds", 30)

        proxy = self.network_cfg.get("socks5_proxy", "")
        if proxy:
            import httpx_socks
            transport = httpx_socks.AsyncProxyTransport.from_url(proxy, verify=verify)
            self._client = httpx.AsyncClient(timeout=timeout, transport=transport)
        else:
            self._client = httpx.AsyncClient(timeout=timeout, verify=verify)

    def _build_ssl(self):
        if not self.tls_cfg.get("ssl_verify", False):
            return False

        ca = self.tls_cfg.get("ca_cert_path", "")
        cert = self.tls_cfg.get("client_cert_path", "")
        key = self.tls_cfg.get("client_key_path", "")

        try:
            if ca and Path(ca).exists():
                ctx = ssl.create_default_context(cafile=ca)
            else:
                ctx = ssl.create_default_context()

            if cert and key and Path(cert).exists() and Path(key).exists():
                ctx.load_cert_chain(certfile=cert, keyfile=key)

            return ctx
        except Exception as e:
            logger.warning(f"SSL setup failed, disabling verify: {e}")
            return False

    def reload(self):
        """Reload config and reinitialize."""
        self._load()

    def _resolve_url(self, url_template: str, params: dict = None) -> str:
        url = url_template
        # Replace environment variables
        for k, v in self.env.items():
            url = url.replace(f"{{{{{k}}}}}", v)
        # Replace params
        if params:
            for k, v in params.items():
                url = url.replace(f"{{{{{k}}}}}", str(v))
        return url

    def _headers(self) -> dict:
        token = self.token_mgr.get_access_token()
        h = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if token:
            h["Authorization"] = f"Bearer {token}"
        return h

    def _log(self, method: str, url: str, status, req_body=None, res_body: str = ""):
        api_logs.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "method": method, "url": url,
            "status": status, "request_body": req_body,
            "response_body": res_body[:1000]
        })

    @retry(stop=stop_after_attempt(2), wait=wait_fixed(1), retry=retry_if_exception_type(httpx.HTTPStatusError))
    async def call(self, api_key: str, params: dict = None, body: dict = None) -> dict:
        """Execute an API call by key from config."""
        api = self.apis.get(api_key)
        if not api:
            raise ValueError(f"Unknown API: {api_key}")

        method = api["method"]
        url = self._resolve_url(api["url"], params)
        headers = self._headers()

        try:
            if method == "GET":
                r = await self._client.get(url, headers=headers)
            elif method == "POST":
                r = await self._client.post(url, json=body, headers=headers)
            elif method == "PATCH":
                r = await self._client.patch(url, json=body, headers=headers)
            elif method == "DELETE":
                r = await self._client.delete(url, headers=headers)
            elif method == "PUT":
                r = await self._client.put(url, json=body, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
        except httpx.ConnectError as e:
            self._log(method, url, "CONNECT_ERROR", body, str(e))
            raise ConnectionError(f"Cannot connect to {url}: {e}")
        except httpx.HTTPStatusError:
            raise
        except Exception as e:
            self._log(method, url, "ERROR", body, str(e))
            raise ConnectionError(f"Request failed: {e}")

        self._log(method, url, r.status_code, body, r.text)

        # Auto-retry on 401
        if r.status_code == 401:
            self.token_mgr.expires_at = 0
            raise httpx.HTTPStatusError("401 Unauthorized", request=r.request, response=r)

        r.raise_for_status()
        return r.json() if r.text else {}

    async def raw_call(self, method: str, url_template: str, params: dict = None, body: dict = None) -> dict:
        """Execute a raw API call with URL template."""
        url = self._resolve_url(url_template, params)
        headers = self._headers()

        try:
            if method == "GET":
                r = await self._client.get(url, headers=headers)
            elif method == "POST":
                r = await self._client.post(url, json=body, headers=headers)
            elif method == "PATCH":
                r = await self._client.patch(url, json=body, headers=headers)
            elif method == "DELETE":
                r = await self._client.delete(url, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
        except Exception as e:
            self._log(method, url, "ERROR", body, str(e))
            raise

        self._log(method, url, r.status_code, body, r.text)
        r.raise_for_status()
        return r.json() if r.text else {}

    async def close(self):
        await self._client.aclose()


# Singleton
bae_client = BAEClient()
