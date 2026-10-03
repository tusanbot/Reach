from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from app.keyboards import main_menu, preview_menu, settings_menu, style_menu, editor_menu, sort_menu, align_menu
from app.services.parser import parse_table
from app.services.renderer import render_message

router = Router()

class BuilderState(StatesGroup):
    waiting_data = State()
    preview = State()
    style = State()
    settings = State()
    editor = State()
    edit_value = State()

TITLES = {"ranking": "🏆 رتبه‌بندی", "stats": "📈 آمار", "custom": "📝 پیام سفارشی", "table": "📊 جدول"}

def _render(data):
    return render_message(data["headers"], data["rows"], title=data.get("title",""), subtitle=data.get("subtitle",""), footer=data.get("footer",""), style=data.get("style","classic"), show_index=data.get("show_index",False), align=data.get("align","left"))

async def _prompt(message, kind, state):
    await state.update_data(kind=kind)
    await state.set_state(BuilderState.waiting_data)
    await message.answer(f"<b>{TITLES[kind]}</b>\n\nداده‌ها رو ارسال کن:\n\n<code>بازیکن | امتیاز | برد\nعلی | 1250 | 18\nمهدی | 1180 | 16\nرضا | 1040 | 14</code>\n\nخط اول نام ستون‌هاست و | ستون‌ها رو جدا می‌کنه.")

async def _edit_prompt(message, state, field, text):
    await state.update_data(edit_field=field)
    await state.set_state(BuilderState.edit_value)
    await message.answer(text)

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
    elif action == "editor":
        await callback.answer()
        await state.set_state(BuilderState.editor)
        await callback.message.answer("🛠 <b>ویرایشگر پیام</b>\n\nهر بخش رو که می‌خوای تغییر بده:", reply_markup=editor_menu())
    elif action == "style":
        await callback.answer()
        await state.set_state(BuilderState.style)
        await callback.message.answer("🎨 قالب پیام رو انتخاب کن:", reply_markup=style_menu())
    elif action == "settings":
        data = await state.get_data()
        await callback.answer()
        await state.set_state(BuilderState.settings)
        await callback.message.answer("⚙️ <b>تنظیمات</b>\n\nشماره ردیف‌ها رو نمایش بدیم؟", reply_markup=settings_menu(data.get("show_index",False)))
    elif action == "preview":
        await callback.answer()
        await state.set_state(BuilderState.preview)
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
    kind = data.get("kind","table")
    await state.update_data(headers=table.headers, rows=table.rows, title=TITLES[kind], subtitle="", footer="", style="classic", show_index=(kind=="ranking"), align="left")
    await state.set_state(BuilderState.preview)
    await message.answer(_render(await state.get_data()), reply_markup=preview_menu())

@router.callback_query(F.data.startswith("edit:"))
async def editor_actions(callback: CallbackQuery, state: FSMContext):
    action = callback.data.split(":",1)[1]
    data = await state.get_data()
    await callback.answer()
    if action == "title":
        await _edit_prompt(callback.message,state,"title","🏷 عنوان جدید رو بفرست. برای حذف عنوان - بفرست.")
    elif action == "subtitle":
        await _edit_prompt(callback.message,state,"subtitle","💬 زیرعنوان جدید رو بفرست. برای حذف - بفرست.")
    elif action == "footer":
        await _edit_prompt(callback.message,state,"footer","📝 پاورقی جدید رو بفرست. برای حذف - بفرست.")
    elif action == "headers":
        await _edit_prompt(callback.message,state,"headers","🔤 نام ستون‌ها رو با | جدا کن. مثال: بازیکن | امتیاز | برد")
    elif action == "addrow":
        await _edit_prompt(callback.message,state,"addrow","➕ ردیف جدید رو با | جدا کن.")
    elif action == "delrow":
        if len(data.get("rows",[])) <= 1:
            await callback.message.answer("⚠️ حداقل یک ردیف باید باقی بمونه.", reply_markup=editor_menu())
        else:
            await _edit_prompt(callback.message,state,"delrow","➖ شماره ردیفی که می‌خوای حذف بشه رو بفرست.")
    elif action == "addcol":
        await _edit_prompt(callback.message,state,"addcol","➕ نام ستون جدید رو بفرست.")
    elif action == "delcol":
        if len(data.get("headers",[])) <= 2:
            await callback.message.answer("⚠️ جدول حداقل باید دو ستون داشته باشه.", reply_markup=editor_menu())
        else:
            await _edit_prompt(callback.message,state,"delcol","➖ شماره ستون برای حذف رو بفرست.")
    elif action == "sort":
        await state.set_state(BuilderState.editor)
        await state.update_data(await_sort_column=True)
        await callback.message.answer("↕️ شماره ستون موردنظر برای مرتب‌سازی رو بفرست.")
    elif action == "align":
        await state.set_state(BuilderState.editor)
        await callback.message.answer("↔️ تراز متن جدول رو انتخاب کن:", reply_markup=align_menu())

@router.message(BuilderState.edit_value)
async def receive_edit_value(message: Message, state: FSMContext):
    data = await state.get_data()
    field = data.get("edit_field")
    value = (message.text or "").strip()
    if value == "-": value = ""
    try:
        if field in {"title","subtitle","footer"}:
            await state.update_data(**{field:value})
        elif field == "headers":
            headers=[x.strip() for x in value.split("|")]
            if len(headers)!=len(data["headers"]) or any(not x for x in headers): raise ValueError("تعداد نام ستون‌ها باید با جدول برابر باشه و خالی نباشه.")
            await state.update_data(headers=headers)
        elif field == "addrow":
            cells=[x.strip() for x in value.split("|")]
            if len(cells)>len(data["headers"]): raise ValueError("تعداد سلول‌ها بیشتر از تعداد ستون‌هاست.")
            await state.update_data(rows=[*data["rows"],cells+[""]*(len(data["headers"])-len(cells))])
        elif field == "delrow":
            index=int(value)-1
            if index<0 or index>=len(data["rows"]): raise ValueError("شماره ردیف معتبر نیست.")
            rows=data["rows"][:]; rows.pop(index)
            if not rows: raise ValueError("حداقل یک ردیف باید باقی بمونه.")
            await state.update_data(rows=rows)
        elif field == "addcol":
            if not value: raise ValueError("نام ستون نمی‌تونه خالی باشه.")
            await state.update_data(headers=[*data["headers"],value],rows=[[*r,""] for r in data["rows"]])
        elif field == "delcol":
            index=int(value)-1
            if index<0 or index>=len(data["headers"]): raise ValueError("شماره ستون معتبر نیست.")
            headers=data["headers"][:]; headers.pop(index)
            if len(headers)<2: raise ValueError("جدول حداقل باید دو ستون داشته باشه.")
            rows=[[cell for j,cell in enumerate(row) if j!=index] for row in data["rows"]]
            await state.update_data(headers=headers,rows=rows)
    except (ValueError,TypeError) as exc:
        await message.answer(f"⚠️ {exc}\n\nدوباره وارد کن.")
        return
    await state.set_state(BuilderState.editor)
    await message.answer("✅ تغییر اعمال شد.",reply_markup=editor_menu())

@router.message(BuilderState.editor)
async def editor_text(message: Message, state: FSMContext):
    data=await state.get_data()
    if data.get("await_sort_column"):
        try:
            column=int((message.text or "").strip())
            if not 1<=column<=len(data["headers"]): raise ValueError
        except ValueError:
            await message.answer("⚠️ شماره ستون معتبر نیست.")
            return
        await state.update_data(await_sort_column=False,sort_column=column)
        await message.answer("↕️ جهت مرتب‌سازی رو انتخاب کن:",reply_markup=sort_menu())

@router.callback_query(F.data.startswith("sort:"))
async def set_sort(callback: CallbackQuery,state:FSMContext):
    data=await state.get_data()
    column=data.get("sort_column")
    if not column:
        await callback.answer("اول شماره ستون را ارسال کن",show_alert=True); return
    idx=column-1
    if idx<0 or idx>=len(data["headers"]):
        await callback.answer("شماره ستون نامعتبر است",show_alert=True); return
    reverse=callback.data.endswith(":desc")
    rows=data["rows"][:]
    def key(row):
        value=row[idx].strip()
        try: return (0,float(value.replace(",","")))
        except ValueError: return (1,value.casefold())
    rows.sort(key=key,reverse=reverse)
    await state.update_data(rows=rows,sort_column=None)
    await state.set_state(BuilderState.editor)
    await callback.answer("مرتب شد")
    await callback.message.answer("✅ جدول مرتب شد.",reply_markup=editor_menu())

@router.callback_query(F.data.startswith("style:"))
async def set_style(callback: CallbackQuery,state:FSMContext):
    style=callback.data.split(":",1)[1]
    await state.update_data(style=style)
    await state.set_state(BuilderState.preview)
    await callback.answer("قالب اعمال شد")
    await callback.message.edit_text(_render(await state.get_data()),reply_markup=preview_menu())

@router.callback_query(F.data == "setting:index")
async def toggle_index(callback: CallbackQuery,state:FSMContext):
    data=await state.get_data()
    await state.update_data(show_index=not data.get("show_index",False))
    await state.set_state(BuilderState.editor)
    await callback.answer("تنظیم شد")
    await callback.message.answer("✅ شماره ردیف تنظیم شد.",reply_markup=editor_menu())

@router.callback_query(F.data.startswith("align:"))
async def set_align(callback: CallbackQuery,state:FSMContext):
    align=callback.data.split(":",1)[1]
    if align in {"left","center","right"}: await state.update_data(align=align)
    await state.set_state(BuilderState.editor)
    await callback.answer("تراز اعمال شد")
    await callback.message.answer("✅ تراز متن تغییر کرد.",reply_markup=editor_menu())

@router.callback_query(F.data == "help")
async def help_handler(callback: CallbackQuery):
    await callback.answer()
    await callback.message.answer("<b>ℹ️ راهنمای Reach</b>\n\nداده‌ها رو با | جدا کن؛ خط اول عنوان ستون‌هاست. بعد از پیش‌نمایش می‌تونی عنوان، ستون، ردیف، ترتیب و تراز جدول رو تغییر بدی.\n\n<code>بازیکن | امتیاز\nعلی | 1250\nمهدی | 1180</code>",reply_markup=main_menu())
