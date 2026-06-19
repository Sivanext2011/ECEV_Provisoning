import aiosqlite
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "provisioning.db"


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS subscribers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                msisdn TEXT UNIQUE NOT NULL,
                party_id TEXT,
                customer_id TEXT,
                billing_account_id TEXT,
                agreement_id TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subscriber_id INTEGER REFERENCES subscribers(id),
                product_id TEXT,
                product_offering_id TEXT,
                status TEXT,
                valid_from TEXT,
                valid_to TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                msisdn TEXT,
                action TEXT,
                request_body TEXT,
                response_body TEXT,
                status TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS buckets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id TEXT,
                bucket_type TEXT,
                amount REAL,
                unit TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        """)


async def get_db():
    return await aiosqlite.connect(DB_PATH)
