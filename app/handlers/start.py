from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message
from app.keyboards import main_menu
from app.storage.db import Database

router = Router()

@router.message(CommandStart())
async def start_handler(message: Message, db: Database):
    user = message.from_user
    if user:
        await db.upsert_user(user.id, user.username, user.first_name)
    await message.answer("👋 <b>به Reach خوش اومدی!</b>\n\nاینجا می‌تونی اطلاعات خامت رو به جدول و پیام‌های حرفه‌ای تبدیل کنی و بعد پیام ساخته‌شده رو مستقیم به کانال یا گروهت فوروارد کنی.\n\nبرای شروع یکی از گزینه‌های زیر رو انتخاب کن:", reply_markup=main_menu())
