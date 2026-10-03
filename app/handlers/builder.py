from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from app.keyboards import main_menu, preview_menu, settings_menu, style_menu
from app.services.parser import parse_table
from app.services.renderer import render_message

router = Router()

class BuilderState(StatesGroup):
    waiting_data = State()
    preview = State()
    style = State()
    settings = State()

TITLES = {
    "ranking": "🏆 رتبه‌بندی",
    "stats": "📈 آمار",
    "custom": "📝 پیام سفارشی",
    "table": "📊 جدول",
}

def _render(data):
    return render_message(
        data["headers"], data["rows"],
        title=data.get("title", ""),
        subtitle=data.get("subtitle", ""),
        footer=data.get("footer", ""),
        style=data.get("style", "classic"),
        show_index=data.get("show_index", False),
    )

async def _prompt(message, kind, state):
    await state.update_data(kind=kind)
    await state.set_state(BuilderState.waiting_data)
    await message.answer(
        f"<b>{TITLES[kind]}</b>\n\n"
        "داده‌ها رو به‌صورت سریع ارسال کن:\n\n"
        "<code>بازیکن | امتیاز | برد\nعلی | 1250 | 18\nمهدی | 1180 | 16\nرضا | 1040 | 14</code>\n\n"
        "خط اول نام ستون‌هاست و | ستون‌ها رو جدا می‌کنه."
    )

@router.callback_query(F.data.startswith("builder:"))
async def builder_actions(callback: CallbackQuery, state: FSMContext):
    action = callback.data.split(":", 1)[1]
    if action in TITLES:
        await callback.answer()
        await _prompt(callback.message, action, state)
    elif action == "edit":
        await callback.answer()
        await state.set_state(BuilderState.waiting_data)
        await callback.message.answer("✏️ اطلاعات جدید رو ارسال کن.")
    elif action == "style":
        await callback.answer()
        await state.set_state(BuilderState.style)
        await callback.message.answer("🎨 قالب پیام رو انتخاب کن:", reply_markup=style_menu())
    elif action == "settings":
        data = await state.get_data()
        await callback.answer()
        await state.set_state(BuilderState.settings)
        await callback.message.answer("⚙️ <b>تنظیمات جدول</b>\n\nشماره ردیف‌ها رو نمایش بدیم؟", reply_markup=settings_menu(data.get("show_index", False)))
    elif action == "preview":
        await callback.answer()
        await callback.message.edit_text(_render(await state.get_data()), reply_markup=preview_menu())
    elif action == "publish":
        data = await state.get_data()
        rendered = _render(data)
        await state.clear()
        await callback.answer("پیام آماده شد")
        await callback.message.answer(rendered)
        await callback.message.answer("📤 پیام بالا آماده فوروارد به کانال یا گروهه.")
    elif action == "cancel":
        await state.clear()
        await callback.answer("لغو شد")
        await callback.message.edit_text("❌ ساخت پیام لغو شد.", reply_markup=main_menu())

@router.message(BuilderState.waiting_data)
async def receive_data(message: Message, state: FSMContext):
    try:
        table = parse_table(message.text or "")
    except ValueError as exc:
        await message.answer(f"⚠️ {exc}\n\nدوباره اطلاعات رو ارسال کن.")
        return

    data = await state.get_data()
    kind = data.get("kind", "table")
    await state.update_data(
        headers=table.headers, rows=table.rows,
        title=TITLES[kind], subtitle="", footer="",
        style="classic", show_index=(kind == "ranking")
    )
    await state.set_state(BuilderState.preview)
    await message.answer(_render(await state.get_data()), reply_markup=preview_menu())

@router.callback_query(F.data.startswith("style:"))
async def set_style(callback: CallbackQuery, state: FSMContext):
    style = callback.data.split(":", 1)[1]
    await state.update_data(style=style)
    await state.set_state(BuilderState.preview)
    await callback.answer("قالب اعمال شد")
    await callback.message.edit_text(_render(await state.get_data()), reply_markup=preview_menu())

@router.callback_query(F.data == "setting:index")
async def toggle_index(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    await state.update_data(show_index=not data.get("show_index", False))
    await state.set_state(BuilderState.preview)
    await callback.answer("تنظیم شد")
    await callback.message.edit_text(_render(await state.get_data()), reply_markup=preview_menu())

@router.callback_query(F.data == "help")
async def help_handler(callback: CallbackQuery):
    await callback.answer()
    await callback.message.answer(
        "<b>ℹ️ راهنمای Reach</b>\n\n"
        "هر خط یک ردیفه و | ستون‌ها رو جدا می‌کنه. خط اول عنوان ستون‌هاست.\n\n"
        "<code>بازیکن | امتیاز\nعلی | 1250\nمهدی | 1180</code>",
        reply_markup=main_menu(),
    )
