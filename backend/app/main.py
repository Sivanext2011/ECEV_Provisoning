from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .routers.provisioning import router
from .services.database import init_db
from .services.bae_client import bae_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await bae_client.close()


app = FastAPI(
    title="Ericsson BAE/BSSF Provisioning Tool",
    description="Manual provisioning tool for Ericsson BAE/BSSF",
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


@app.get("/health")
async def health():
    return {"status": "ok"}
