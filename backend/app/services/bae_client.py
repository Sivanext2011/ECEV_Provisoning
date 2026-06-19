import httpx
import ssl
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

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
        # ssl_ctx is either False (no ssl config) or an ssl.SSLContext
        verify = self.ssl_ctx if self.ssl_ctx else False
        timeout = self.network_cfg.get("timeout_seconds", 30)

        proxy = self.network_cfg.get("socks5_proxy", "")
        socks_enabled = self.network_cfg.get("socks5_enabled", False)
        if proxy and socks_enabled:
            import httpx_socks
            transport = httpx_socks.AsyncProxyTransport.from_url(proxy, verify=verify)
            self._client = httpx.AsyncClient(timeout=timeout, transport=transport)
        else:
            self._client = httpx.AsyncClient(timeout=timeout, verify=verify)

        logger.info(f"BAEClient loaded: ssl_ctx={type(self.ssl_ctx).__name__}, verify={verify is not False}, socks5={proxy if socks_enabled else 'DISABLED'}")

    def _build_ssl(self):
        ca = self.tls_cfg.get("ca_cert_path", "")
        cert = self.tls_cfg.get("client_cert_path", "")
        key = self.tls_cfg.get("client_key_path", "")
        verify = self.tls_cfg.get("ssl_verify", False)

        has_ca = ca and Path(ca).exists()
        has_client_cert = cert and key and Path(cert).exists() and Path(key).exists()

        # If no certs at all and no verify, just skip SSL
        if not verify and not has_client_cert:
            return False

        try:
            if verify and has_ca:
                ctx = ssl.create_default_context(cafile=ca)
            elif verify:
                ctx = ssl.create_default_context()
            else:
                # Don't verify server cert, but still need context for client cert
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE

            if has_client_cert:
                ctx.load_cert_chain(certfile=cert, keyfile=key)
                logger.info(f"mTLS: loaded client cert={cert}, key={key}")

            return ctx
        except Exception as e:
            logger.warning(f"SSL setup failed: {e}")
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

    def _log_request(self, method: str, url: str, headers: dict, body=None):
        safe_headers = {k: (v[:20] + '...' if k == 'Authorization' and v else v) for k, v in headers.items()}
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": "REQUEST",
            "method": method, "url": url,
            "headers": safe_headers,
            "request_body": body,
            "status": "-",
            "ssl_verify": str(self.ssl_ctx),
            "socks5_enabled": self.network_cfg.get("socks5_enabled", False),
            "socks5_proxy": self.network_cfg.get("socks5_proxy", "") if self.network_cfg.get("socks5_enabled") else "DISABLED",
        }
        api_logs.append(entry)
        logger.info(f"REQUEST: {method} {url} | ssl_verify={self.ssl_ctx} | headers={safe_headers}")

    def _log_response(self, method: str, url: str, status, req_body=None, res_body: str = "", res_headers: dict = None):
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": "RESPONSE",
            "method": method, "url": url,
            "status": status,
            "request_body": req_body,
            "response_body": res_body[:4000],
            "response_headers": res_headers,
        }
        api_logs.append(entry)
        logger.info(f"RESPONSE: {method} {url} | status={status} | body={res_body[:200]}")

    async def call(self, api_key: str, params: dict = None, body: dict = None) -> dict:
        """Execute an API call by key from config."""
        api = self.apis.get(api_key)
        if not api:
            raise ValueError(f"Unknown API: {api_key}")

        method = api["method"]
        url = self._resolve_url(api["url"], params)
        headers = self._headers()

        # Log the request before sending
        self._log_request(method, url, headers, body)

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
        except Exception as e:
            import traceback
            err_detail = traceback.format_exc()
            err_msg = f"{type(e).__name__}: {e}"
            self._log_response(method, url, "ERROR", body, f"{err_msg}\n\n{err_detail}")
            raise ConnectionError(f"{method} {url} failed: {err_msg}")

        self._log_response(method, url, r.status_code, body, r.text, dict(r.headers))

        # Retry once on 401
        if r.status_code == 401 and not getattr(self, '_retrying', False):
            self._retrying = True
            self.token_mgr.expires_at = 0
            try:
                return await self.call(api_key, params=params, body=body)
            finally:
                self._retrying = False

        if r.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"{r.status_code}: {r.text[:500]}", request=r.request, response=r
            )

        return r.json() if r.text else {}

    async def raw_call(self, method: str, url_template: str, params: dict = None, body: dict = None) -> dict:
        """Execute a raw API call with URL template."""
        url = self._resolve_url(url_template, params)
        headers = self._headers()
        self._log_request(method, url, headers, body)

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
            import traceback
            err_detail = traceback.format_exc()
            err_msg = f"{type(e).__name__}: {e}"
            self._log_response(method, url, "ERROR", body, f"{err_msg}\n\n{err_detail}")
            raise ConnectionError(f"{method} {url} failed: {err_msg}")

        self._log_response(method, url, r.status_code, body, r.text, dict(r.headers))
        r.raise_for_status()
        return r.json() if r.text else {}

    async def close(self):
        await self._client.aclose()


# Singleton
bae_client = BAEClient()
