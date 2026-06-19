# ECEV Provisioning Tool

Manual provisioning tool for Ericsson BSSF/CPM/RMCA environment.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  React UI   │────▶│  FastAPI Backend  │────▶│  Ericsson BSSF   │
│  (Vite/TS)  │     │  (Python)         │     │  REST APIs       │
└─────────────┘     └──────────────────┘     └──────────────────┘
                           │
                    ┌──────┴──────┐
                    │   SQLite    │
                    │ (audit/cache)│
                    └─────────────┘
```

## Provisioning Flow

1. **Create Party** → TMF632 Party Management (`/bss/party-management/v1/individual`)
2. **Create Customer** → TMF629 Customer Management (`/bss/customer-management/v1/customer`)
3. **Create Party Role** → TMF669 Party Role Management (`/bss/party-role-management/v1/partyRole`)
4. **Create Billing Account** → TMF666 Account Management (`/bss/account-management/v1/billingAccount`)
5. **Create Agreement** → Agreement Management (`/bssf/agreement-management/v1/agreement`)
6. **Create Product** → TMF637 Product Inventory (`/bss/product-inventory-management/v1/product`)
7. **Allocate Buckets** → Balance Management (`/bssf/balance-management/v2/balanceTopUp`)

## Run Locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Docker

```bash
docker-compose up --build
```

- UI: http://localhost:3000
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/subscribers/provision | Full provisioning wizard |
| POST | /api/v1/party | Create Individual |
| POST | /api/v1/customer | Create Customer |
| POST | /api/v1/billing-account | Create Billing Account |
| POST | /api/v1/agreement | Create Agreement |
| POST | /api/v1/product | Create Product Instance |
| POST | /api/v1/bucket | Allocate Bucket |
| PATCH | /api/v1/product/{id}/status | Suspend/Resume/Terminate |
| GET | /api/v1/subscribers/{msisdn} | Search subscriber |
| GET | /api/v1/subscribers/{msisdn}/products | Get products |
| GET | /api/v1/balance/{productId} | Get current balances |
| GET | /api/v1/config/offerings | List product offerings |

## Configuration

Edit `config/config.json` to configure:
- Ericsson BSSF base URL and JWT credentials
- API paths per TMF interface
- Product offering catalog with validity and bucket templates

## Ericsson Interface Documents Used

| TMF | Document | Interface |
|-----|----------|-----------|
| TMF632 | 6/15519-FAY302584/1 | Party Management v1.5 |
| TMF629 | 6/15519-FAY302586/1 | Customer Management v1.5 |
| TMF669 | 2/15519-FAY302646/1 | Party Role Management v1.1 |
| TMF666 | 4/15519-FAY302633/1 | Account Management v1.3 |
| - | 8/15519-FAY302360/1 | Agreement Management v1.7 |
| TMF637 | 6/15519-FAY302612/1 | Product Inventory v1.5 |
| - | 13/15519-FAY302340/2 | Balance Management v2.12 |
| - | 10/15519-FAY302341/3 | Balance Enquiry v3.9 |
| - | 7/15519-FAY302366/1 | Agreement Enquiry v1.6 |
| - | 4/15519-FAY302505/1 | Account Enquiry v1.3 |
