from aiogram import F, Router
from aiogram.types import CallbackQuery
from app.keyboards import main_menu

router = Router()

@router.callback_query(F.data == "templates:list")
async def templates_list(callback: CallbackQuery):
    await callback.answer()
    await callback.message.edit_text(
        "📚 <b>قالب‌های من</b>\n\n"
        "فعلاً هنوز قالبی ذخیره نکردی.\n\n"
        "🔜 در نسخه بعدی می‌تونی قالب دلخواهت رو ذخیره کنی و فقط داده‌های جدید رو جایگزین کنی.",
        reply_markup=main_menu(),
    )
