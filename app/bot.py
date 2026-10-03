from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import BotCommand
from app.config import get_settings
from app.handlers.builder import router as builder_router
from app.handlers.importer import router as importer_router
from app.handlers.start import router as start_router
from app.handlers.templates import router as templates_router
from app.storage.db import Database

class DatabaseMiddleware:
    def __init__(self, db: Database):
        self.db = db

    async def __call__(self, handler, event, data):
        data["db"] = self.db
        return await handler(event, data)

async def run():
    settings = get_settings()
    bot = Bot(
        token=settings.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=MemoryStorage())
    db = Database(settings.database_path)
    middleware = DatabaseMiddleware(db)
    dp.message.middleware(middleware)
    dp.callback_query.middleware(middleware)
    dp.include_router(start_router)
    dp.include_router(builder_router)
    dp.include_router(importer_router)
    dp.include_router(templates_router)
    await bot.set_my_commands([
        BotCommand(command="start", description="شروع کار با Reach")
    ])
    await dp.start_polling(bot)
