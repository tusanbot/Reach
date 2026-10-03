from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from app.handlers.builder import BuilderState
from app.keyboards import main_menu
from app.storage.db import Database

router = Router()

class TemplateState(StatesGroup):
    waiting_name = State()

KIND_LABELS = {"table": "📊 جدول", "ranking": "🏆 رتبه‌بندی", "stats": "📈 آمار", "custom": "📝 پیام سفارشی"}

def _templates_keyboard(items):
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
    rows = []
    for item in items:
        rows.append([
            InlineKeyboardButton(text=f"🚀 {item['name']}", callback_data=f"template:use:{item['id']}"),
            InlineKeyboardButton(text="🗑", callback_data=f"template:delete:{item['id']}"),
        ])
    rows.append([InlineKeyboardButton(text="↩️ بازگشت", callback_data="template:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)

async def _show_list(callback: CallbackQuery, db: Database):
    items = await db.list_templates(callback.from_user.id)
    if not items:
        await callback.message.edit_text(
            "📚 <b>قالب‌های من</b>\n\n"
            "هنوز قالبی ذخیره نکردی.\n"
            "اول یک پیام بساز و از گزینه «💾 ذخیره قالب» استفاده کن.",
            reply_markup=main_menu(),
        )
        return
    lines = ["📚 <b>قالب‌های من</b>", "", "🚀 برای استفاده روی نام قالب بزن؛ 🗑 برای حذف."]
    for i, item in enumerate(items, 1):
        lines.append(f"<b>{i}.</b> {item['name']} — {KIND_LABELS.get(item['kind'], '📊 جدول')}")
    await callback.message.edit_text("\n".join(lines), reply_markup=_templates_keyboard(items))

@router.callback_query(F.data == "templates:list")
async def templates_list(callback: CallbackQuery, db: Database):
    await callback.answer()
    await _show_list(callback, db)

@router.callback_query(F.data == "templates:save")
async def save_template_start(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    if not data.get("headers") or not data.get("rows"):
        await callback.answer("اول یک جدول بساز", show_alert=True)
        return
    await callback.answer()
    await state.set_state(TemplateState.waiting_name)
    await callback.message.answer("💾 <b>ذخیره قالب</b>\n\nیک نام کوتاه برای قالب بفرست؛ مثلاً:\n<code>رنکینگ هفتگی</code>")

@router.message(TemplateState.waiting_name)
async def save_template(message: Message, state: FSMContext, db: Database):
    name = (message.text or "").strip()
    if not name:
        await message.answer("⚠️ نام قالب نمی‌تواند خالی باشد.")
        return
    if len(name) > 80:
        await message.answer("⚠️ نام قالب حداکثر ۸۰ کاراکتر باشد.")
        return
    data = await state.get_data()
    config = {
        "title": data.get("title", ""),
        "subtitle": data.get("subtitle", ""),
        "footer": data.get("footer", ""),
        "style": data.get("style", "classic"),
        "show_index": bool(data.get("show_index", False)),
        "align": data.get("align", "left"),
        "headers": data.get("headers", []),
        "kind": data.get("kind", "table"),
        "advanced": bool(data.get("advanced", False)),
        "layout": data.get("layout"),
    }
    template_id = await db.create_template(message.from_user.id, name, config["kind"], config)
    await state.update_data(template_id=template_id)
    await state.set_state(BuilderState.preview)
    from app.keyboards import preview_menu
    await message.answer(
        f"✅ قالب <b>{name}</b> ذخیره شد.\n\n"
        "ساختار قالب ذخیره شد و هر زمان بخوای می‌تونی داده‌های جدید رو روی همین ظاهر اجرا کنی.",
        reply_markup=preview_menu(bool(data.get("advanced"))),
    )

@router.callback_query(F.data.startswith("template:use:"))
async def use_template(callback: CallbackQuery, state: FSMContext, db: Database):
    try:
        template_id = int(callback.data.rsplit(":", 1)[1])
    except ValueError:
        await callback.answer("قالب نامعتبر است", show_alert=True)
        return
    item = await db.get_template(callback.from_user.id, template_id)
    if not item:
        await callback.answer("قالب پیدا نشد", show_alert=True)
        return
    config = item["config"]
    await state.clear()
    await state.update_data(
        kind=config.get("kind", item.get("kind", "table")),
        template_id=template_id,
        template_name=item["name"],
        template_config=config,
        importing=False,
        advanced=bool(config.get("advanced", bool(config.get("layout")))),
    )
    await state.set_state(BuilderState.waiting_data)
    await callback.answer("قالب انتخاب شد")
    await callback.message.edit_text(
        f"🚀 <b>{item['name']}</b> آماده است.\n\n"
        "داده‌های جدید رو با <code>|</code> بفرست یا فایل CSV / TXT / XLSX وارد کن."
    )

@router.callback_query(F.data.startswith("template:delete:"))
async def delete_template(callback: CallbackQuery, db: Database):
    try:
        template_id = int(callback.data.rsplit(":", 1)[1])
    except ValueError:
        await callback.answer("قالب نامعتبر است", show_alert=True)
        return
    deleted = await db.delete_template(callback.from_user.id, template_id)
    await callback.answer("قالب حذف شد" if deleted else "قالب پیدا نشد")
    await _show_list(callback, db)

@router.callback_query(F.data == "template:back")
async def template_back(callback: CallbackQuery):
    await callback.answer()
    await callback.message.edit_text("منوی اصلی Reach", reply_markup=main_menu())
