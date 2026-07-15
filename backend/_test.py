import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app

async def main():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        # Simulate exactly what the frontend wizard sends
        payload = {
            "partyBody": {"externalId": "extID-party-123456", "givenName": "Test", "familyName": "User", "individualSpecification": {"externalId": "PS1"}, "status": [{"status": "PartyActive"}]},
            "customerBody": {"externalId": "extID-customer-123456", "customerSpecification": {"externalId": "CS1"}, "status": [{"status": "CustomerActive"}], "account": [{"externalId": "extID_BA-123456", "billingAccountSpecExternalId": "BAS1", "status": [{"status": "BillingAccountActive"}]}], "engagedParty": {"externalId": "extID-party-123456", "@referredType": "Individual"}},
            "contractBody": {"externalId": "extID-contract-123456", "contractSpecification": {"externalId": "CTS1"}, "status": [{"status": "Active"}]},
            "customerExternalId": "extID-customer-123456"
        }
        r = await c.post("/api/v1/subscribers/provision", json=payload)
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text[:300]}")
        print()
        
        # Check logs
        r2 = await c.get("/api/v1/logs")
        logs = r2.json()
        print(f"Logs: {len(logs)} entries")
        for l in logs:
            print(f"  [{l.get('status')}] {l.get('method')} {l.get('url','')[:80]}")
            if l.get('response_body'):
                print(f"    -> {l['response_body'][:100]}")

asyncio.run(main())
