from pathlib import Path
import json
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

    async def create_template(self, telegram_id: int, name: str, kind: str, config: dict) -> int:
        db = await self.connect()
        try:
            cur = await db.execute("INSERT INTO templates (telegram_id, name, kind, config_json) VALUES (?, ?, ?, ?)", (telegram_id, name, kind, json.dumps(config, ensure_ascii=False)))
            await db.commit()
            return int(cur.lastrowid)
        finally:
            await db.close()

    async def list_templates(self, telegram_id: int):
        db = await self.connect()
        try:
            cur = await db.execute("SELECT id, name, kind, created_at FROM templates WHERE telegram_id=? ORDER BY id DESC", (telegram_id,))
            return [dict(row) for row in await cur.fetchall()]
        finally:
            await db.close()

    async def get_template(self, telegram_id: int, template_id: int):
        db = await self.connect()
        try:
            cur = await db.execute("SELECT id, name, kind, config_json FROM templates WHERE id=? AND telegram_id=?", (template_id, telegram_id))
            row = await cur.fetchone()
            if not row:
                return None
            item = dict(row)
            item["config"] = json.loads(item.pop("config_json"))
            return item
        finally:
            await db.close()

    async def delete_template(self, telegram_id: int, template_id: int) -> bool:
        db = await self.connect()
        try:
            cur = await db.execute("DELETE FROM templates WHERE id=? AND telegram_id=?", (template_id, telegram_id))
            await db.commit()
            return cur.rowcount > 0
        finally:
            await db.close()
