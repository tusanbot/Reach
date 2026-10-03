from pathlib import Path
import aiosqlite

class Database:
    def __init__(self, path: str):
        self.path = path

    async def connect(self):
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        db = await aiosqlite.connect(self.path)
        db.row_factory = aiosqlite.Row
        await db.execute("CREATE TABLE IF NOT EXISTS users (telegram_id INTEGER PRIMARY KEY, username TEXT, first_name TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
        await db.execute("CREATE TABLE IF NOT EXISTS templates (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, config_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (telegram_id) REFERENCES users(telegram_id))")
        await db.commit()
        return db

    async def upsert_user(self, telegram_id: int, username: str | None, first_name: str | None):
        db = await self.connect()
        try:
            await db.execute("INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?) ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, updated_at=CURRENT_TIMESTAMP", (telegram_id, username, first_name))
            await db.commit()
        finally:
            await db.close()
