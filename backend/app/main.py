from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .routers.provisioning import router
from .routers.bssf_apis import router as bssf_router
from .services.database import init_db
from .services.ericsson_client import ericsson_client
import shutil
from pathlib import Path

CONFIG_PATH = Path(__file__).parent.parent.parent / "config" / "config.json"
CONFIG_TEMPLATE = Path(__file__).parent.parent.parent / "config" / "config.template.json"


def _ensure_config():
    if not CONFIG_PATH.exists() and CONFIG_TEMPLATE.exists():
        shutil.copy(CONFIG_TEMPLATE, CONFIG_PATH)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_config()
    await init_db()
    yield
    await ericsson_client.close()


app = FastAPI(
    title="Ericsson BSSF Provisioning Tool",
    description="Schema-driven provisioning tool for Ericsson BSSF/CPM/RMCA",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(bssf_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/bssf")
async def health_bssf():
    """Check BSSF connectivity by verifying token fetch."""
    try:
        token = await ericsson_client._get_token()
        return {"status": "ok" if token else "no_token", "has_token": bool(token)}
    except Exception as e:
        return {"status": "error", "detail": str(e)}
