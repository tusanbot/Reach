from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from app.keyboards import main_menu, preview_menu, style_menu
from app.services.parser import ParsedTable, parse_table
from app.services.renderer import render_table

router = Router()

class BuilderState(StatesGroup):
    waiting_data = State()
    preview = State()
    style = State()

async def _show_input_prompt(message: Message, kind: str, state: FSMContext):
    title = "🏆 ساخت جدول رتبه‌بندی" if kind == "ranking" else "📊 ساخت جدول"
    await state.update_data(kind=kind)
    await state.set_state(BuilderState.waiting_data)
    await message.answer(f"<b>{title}</b>\n\nاطلاعاتت رو این‌طوری بفرست؛ هر خط یک ردیف و | جداکننده ستون‌هاست:\n\n<code>نام | امتیاز | برد\nعلی | 1250 | 18\nمهدی | 1180 | 16\nرضا | 1040 | 14</code>\n\nخط اول عنوان ستون‌هاست.")

@router.callback_query(F.data.in_({"builder:table", "builder:ranking"}))
async def start_builder(callback: CallbackQuery, state: FSMContext):
    kind = callback.data.split(":", 1)[1]
    await callback.answer()
    await _show_input_prompt(callback.message, kind, state)

@router.message(BuilderState.waiting_data)
async def receive_data(message: Message, state: FSMContext):
    try:
        table = parse_table(message.text or "")
    except ValueError as exc:
        await message.answer(f"⚠️ {exc}\n\nدوباره اطلاعات رو ارسال کن.")
        return
    data = await state.get_data()
    title = "🏆 رتبه‌بندی" if data.get("kind") == "ranking" else "📊 جدول"
    await state.update_data(headers=table.headers, rows=table.rows, title=title, style="classic")
    await state.set_state(BuilderState.preview)
    await message.answer(render_table(table, title=title), reply_markup=preview_menu())

@router.callback_query(F.data == "builder:edit")
async def edit_data(callback: CallbackQuery, state: FSMContext):
    await callback.answer()
    await state.set_state(BuilderState.waiting_data)
    await callback.message.answer("✏️ اطلاعات جدید جدول رو ارسال کن.")

@router.callback_query(F.data == "builder:style")
async def choose_style(callback: CallbackQuery, state: FSMContext):
    await callback.answer()
    await state.set_state(BuilderState.style)
    await callback.message.answer("🎨 قالب پیام رو انتخاب کن:", reply_markup=style_menu())

@router.callback_query(F.data.startswith("style:"))
async def set_style(callback: CallbackQuery, state: FSMContext):
    style = callback.data.split(":", 1)[1]
    data = await state.get_data()
    table = ParsedTable(data["headers"], data["rows"])
    await state.update_data(style=style)
    await state.set_state(BuilderState.preview)
    await callback.answer("قالب اعمال شد")
    await callback.message.edit_text(render_table(table, title=data.get("title"), style=style), reply_markup=preview_menu())

@router.callback_query(F.data == "builder:preview")
async def back_to_preview(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    table = ParsedTable(data["headers"], data["rows"])
    await state.set_state(BuilderState.preview)
    await callback.answer()
    await callback.message.edit_text(render_table(table, title=data.get("title"), style=data.get("style", "classic")), reply_markup=preview_menu())

@router.callback_query(F.data == "builder:publish")
async def publish(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    table = ParsedTable(data["headers"], data["rows"])
    rendered = render_table(table, title=data.get("title"), style=data.get("style", "classic"))
    await state.clear()
    await callback.answer("پیام آماده شد")
    await callback.message.answer(rendered + "\n\n📤 این پیام رو می‌تونی مستقیم به کانال یا گروهت فوروارد کنی.")

@router.callback_query(F.data == "builder:cancel")
async def cancel(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.answer("لغو شد")
    await callback.message.edit_text("❌ ساخت پیام لغو شد.", reply_markup=main_menu())

@router.callback_query(F.data == "help")
async def help_handler(callback: CallbackQuery):
    await callback.answer()
    await callback.message.answer("<b>ℹ️ راهنمای Reach</b>\n\nداده‌ها رو با | جدا کن و بفرست.\nخط اول عنوان ستون‌هاست.\n\nمثال:\n<code>بازیکن | امتیاز\nعلی | 1250\nمهدی | 1180</code>", reply_markup=main_menu())
