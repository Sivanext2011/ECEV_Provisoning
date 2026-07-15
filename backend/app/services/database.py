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
                contract_id TEXT,
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
        # Migrate: rename agreement_id -> contract_id if old schema exists
        cursor = await db.execute("PRAGMA table_info(subscribers)")
        columns = [row[1] for row in await cursor.fetchall()]
        if "agreement_id" in columns and "contract_id" not in columns:
            await db.execute("ALTER TABLE subscribers RENAME COLUMN agreement_id TO contract_id")
            await db.commit()


async def get_db() -> aiosqlite.Connection:
    return await aiosqlite.connect(DB_PATH)
