import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app

async def test():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/v1/settings")
        print(f"Status: {r.status_code}")
        print(f"Body: {r.text}")

asyncio.run(test())
