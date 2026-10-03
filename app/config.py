import os
from dataclasses import dataclass
from dotenv import load_dotenv
load_dotenv()

@dataclass(frozen=True)
class Settings:
    bot_token: str
    database_path: str = "data/reach.db"

def get_settings() -> Settings:
    token = os.getenv("BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError("BOT_TOKEN is not configured")
    return Settings(token, os.getenv("DATABASE_PATH", "data/reach.db"))
