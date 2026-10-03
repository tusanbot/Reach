from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from app.keyboards import main_menu, preview_menu, settings_menu, style_menu, editor_menu, sort_menu, align_menu, blocks_menu, block_add_menu, block_edit_menu
from app.services.parser import parse_table
from app.services.renderer import render_message, render_layout
from app.services.layout import default_layout, migrate_legacy, normalize_layout

router = Router()

class BuilderState(StatesGroup):
    waiting_data = State()
    preview = State()
    style = State()
    settings = State()
    editor = State()
    edit_value = State()

TITLES = {"ranking": "🏆 رتبه‌بندی", "stats": "📈 آمار", "custom": "📝 پیام سفارشی", "table": "📊 جدول", "advanced": "✨ پیام پیشرفته"}

def _render(data):
    if data.get("advanced"):
        return render_layout(data.get("layout") or default_layout(data.get("kind", "table")), data["headers"], data["rows"], style=data.get("style","classic"), show_index=data.get("show_index",False), align=data.get("align","left"))
    return render_message(data["headers"], data["rows"], title=data.get("title",""), subtitle=data.get("subtitle",""), footer=data.get("footer",""), style=data.get("style","classic"), show_index=data.get("show_index",False), align=data.get("align","left"))

async def _prompt(message, kind, state):
    await state.update_data(kind=kind, advanced=False)
    await state.set_state(BuilderState.waiting_data)
    await message.answer(f"<b>{TITLES[kind]}</b>\\n\\nداده‌ها رو ارسال کن:\\n\\n<code>بازیکن | امتیاز | برد\\nعلی | 1250 | 18\\nمهدی | 1180 | 16\\nرضا | 1040 | 14</code>\\n\\nخط اول نام ستون‌هاست و | ستون‌ها رو جدا می‌کنه.")

async def _edit_prompt(message, state, field, text):
    await state.update_data(edit_field=field)
    await state.set_state(BuilderState.edit_value)
    await message.answer(text)

@router.callback_query(F.data.startswith("builder:"))
async def builder_actions(callback: CallbackQuery, state: FSMContext):
    action = callback.data.split(":", 1)[1]
    if action in TITLES and action != "advanced":
        await callback.answer(); await _prompt(callback.message, action, state)
    elif action == "advanced":
        await callback.answer()
        await state.clear(); await state.update_data(kind="table", advanced=True)
        await state.set_state(BuilderState.waiting_data)
        await callback.message.answer("✨ <b>پیام پیشرفته</b>\\n\\nیک جدول یا فایل داده بفرست تا پیام چندبخشی ساخته بشه.\\nبعد می‌تونی سربرگ، متن، آمار، بخش برجسته و پاورقی رو جابه‌جا یا ویرایش کنی.")
    elif action == "blocks":
        data=await state.get_data(); layout=normalize_layout(data.get("layout"),data.get("kind","table"))
        await state.update_data(layout=layout); await state.set_state(BuilderState.preview); await callback.answer()
        await callback.message.edit_text("🧩 <b>مدیریت بخش‌های پیام</b>\\n\\nهر بخش را ویرایش، جابه‌جا یا حذف کن:",reply_markup=blocks_menu(layout))
    elif action == "edit":
        await callback.answer(); await state.set_state(BuilderState.waiting_data); await callback.message.answer("✏️ اطلاعات جدید رو ارسال کن.")
    elif action == "editor":
        await callback.answer(); await state.set_state(BuilderState.editor); await callback.message.answer("🛠 <b>ویرایشگر جدول</b>\\n\\nهر بخش رو که می‌خوای تغییر بده:", reply_markup=editor_menu())
    elif action == "style":
        await callback.answer(); await state.set_state(BuilderState.style); await callback.message.answer("🎨 قالب پیام رو انتخاب کن:", reply_markup=style_menu())
    elif action == "settings":
        data=await state.get_data(); await callback.answer(); await state.set_state(BuilderState.settings); await callback.message.answer("⚙️ <b>تنظیمات</b>\\n\\nشماره ردیف‌ها رو نمایش بدیم؟",reply_markup=settings_menu(data.get("show_index",False)))
    elif action == "preview":
        await callback.answer(); await state.set_state(BuilderState.preview); await callback.message.edit_text(_render(await state.get_data()),reply_markup=preview_menu(bool((await state.get_data()).get("advanced"))))
    elif action == "publish":
        data=await state.get_data(); rendered=_render(data); await state.clear(); await callback.answer("پیام آماده شد"); await callback.message.answer(rendered); await callback.message.answer("📤 پیام بالا آماده فوروارد به کانال یا گروهه.")
    elif action == "cancel":
        await state.clear(); await callback.answer("لغو شد"); await callback.message.edit_text("❌ ساخت پیام لغو شد.",reply_markup=main_menu())

@router.message(BuilderState.waiting_data)
async def receive_data(message: Message, state: FSMContext):
    try: table=parse_table(message.text or "")
    except ValueError as exc: await message.answer(f"⚠️ {exc}\\n\\nدوباره اطلاعات رو ارسال کن."); return
    data=await state.get_data(); kind=data.get("kind","table"); template=data.get("template_config") or {}
    advanced=bool(data.get("advanced"))
    layout=migrate_legacy(template,kind) if template else default_layout(kind) if advanced else None
    await state.update_data(headers=table.headers,rows=table.rows,title=template.get("title",TITLES[kind]),subtitle=template.get("subtitle",""),footer=template.get("footer",""),style=template.get("style","classic"),show_index=bool(template.get("show_index",kind=="ranking")),align=template.get("align","left"),layout=layout)
    await state.set_state(BuilderState.preview)
    await message.answer(_render(await state.get_data()),reply_markup=preview_menu(advanced))

@router.callback_query(F.data.startswith("edit:"))
async def editor_actions(callback: CallbackQuery,state:FSMContext):
    action=callback.data.split(":",1)[1]; data=await state.get_data(); await callback.answer()
    if action=="title": await _edit_prompt(callback.message,state,"title","🏷 عنوان جدید رو بفرست. برای حذف - بفرست.")
    elif action=="subtitle": await _edit_prompt(callback.message,state,"subtitle","💬 زیرعنوان جدید رو بفرست. برای حذف - بفرست.")
    elif action=="footer": await _edit_prompt(callback.message,state,"footer","📝 پاورقی جدید رو بفرست. برای حذف - بفرست.")
    elif action=="headers": await _edit_prompt(callback.message,state,"headers","🔤 نام ستون‌ها رو با | جدا کن. مثال: بازیکن | امتیاز | برد")
    elif action=="addrow": await _edit_prompt(callback.message,state,"addrow","➕ ردیف جدید رو با | جدا کن.")
    elif action=="delrow":
        if len(data.get("rows",[]))<=1: await callback.message.answer("⚠️ حداقل یک ردیف باید باقی بمونه.",reply_markup=editor_menu())
        else: await _edit_prompt(callback.message,state,"delrow","➖ شماره ردیفی که می‌خوای حذف بشه رو بفرست.")
    elif action=="addcol": await _edit_prompt(callback.message,state,"addcol","➕ نام ستون جدید رو بفرست.")
    elif action=="delcol":
        if len(data.get("headers",[]))<=2: await callback.message.answer("⚠️ جدول حداقل باید دو ستون داشته باشه.",reply_markup=editor_menu())
        else: await _edit_prompt(callback.message,state,"delcol","➖ شماره ستون برای حذف رو بفرست.")
    elif action=="sort": await state.set_state(BuilderState.editor); await state.update_data(await_sort_column=True); await callback.message.answer("↕️ شماره ستون موردنظر برای مرتب‌سازی رو بفرست.")
    elif action=="align": await state.set_state(BuilderState.editor); await callback.message.answer("↔️ تراز متن جدول رو انتخاب کن:",reply_markup=align_menu())

@router.message(BuilderState.edit_value)
async def receive_edit_value(message:Message,state:FSMContext):
    data=await state.get_data()
    if data.get("adv_field") is not None:
        layout=normalize_layout(data.get("layout"),data.get("kind","table")); i=int(data.get("adv_index",0)); field=data.get("adv_field"); value=(message.text or "").strip()
        if not 0<=i<len(layout): await message.answer("⚠️ بخش پیدا نشد."); return
        if field=="items":
            items=[]
            for line in value.splitlines():
                cells=[x.strip() for x in line.split("|",1)]
                if len(cells)==2 and cells[0]: items.append({"label":cells[0],"value":cells[1]})
            if not items: await message.answer("⚠️ حداقل یک آیتم معتبر وارد کن."); return
            layout[i]["items"]=items
        else: layout[i][field]="" if value=="-" else value
        await state.update_data(layout=layout,adv_index=None,adv_field=None); await state.set_state(BuilderState.preview)
        await message.answer("✅ بخش به‌روزرسانی شد.",reply_markup=preview_menu(True)); return
    field=data.get("edit_field"); value=(message.text or "").strip(); value="" if value=="-" else value
    try:
        if field in {"title","subtitle","footer"}: await state.update_data(**{field:value})
        elif field=="headers":
            headers=[x.strip() for x in value.split("|")]
            if len(headers)!=len(data["headers"]) or any(not x for x in headers): raise ValueError("تعداد نام ستون‌ها باید با جدول برابر باشه و خالی نباشه.")
            await state.update_data(headers=headers)
        elif field=="addrow":
            cells=[x.strip() for x in value.split("|")]
            if len(cells)>len(data["headers"]): raise ValueError("تعداد سلول‌ها بیشتر از تعداد ستون‌هاست.")
            await state.update_data(rows=[*data["rows"],cells+[""]*(len(data["headers"])-len(cells))])
        elif field=="delrow":
            index=int(value)-1
            if index<0 or index>=len(data["rows"]): raise ValueError("شماره ردیف معتبر نیست.")
            rows=data["rows"][:]; rows.pop(index); await state.update_data(rows=rows)
        elif field=="addcol":
            if not value: raise ValueError("نام ستون نمی‌تونه خالی باشه.")
            await state.update_data(headers=[*data["headers"],value],rows=[[*r,""] for r in data["rows"]])
        elif field=="delcol":
            index=int(value)-1
            if index<0 or index>=len(data["headers"]): raise ValueError("شماره ستون معتبر نیست.")
            headers=data["headers"][:]; headers.pop(index)
            if len(headers)<2: raise ValueError("جدول حداقل باید دو ستون داشته باشه.")
            await state.update_data(headers=headers,rows=[[cell for j,cell in enumerate(row) if j!=index] for row in data["rows"]])
    except (ValueError,TypeError) as exc: await message.answer(f"⚠️ {exc}\\n\\nدوباره وارد کن."); return
    await state.set_state(BuilderState.editor); await message.answer("✅ تغییر اعمال شد.",reply_markup=editor_menu())

@router.message(BuilderState.editor)
async def editor_text(message:Message,state:FSMContext):
    data=await state.get_data()
    if data.get("await_sort_column"):
        try:
            column=int((message.text or "").strip())
            if not 1<=column<=len(data["headers"]): raise ValueError
        except ValueError: await message.answer("⚠️ شماره ستون معتبر نیست."); return
        await state.update_data(await_sort_column=False,sort_column=column); await message.answer("↕️ جهت مرتب‌سازی رو انتخاب کن:",reply_markup=sort_menu())

@router.callback_query(F.data.startswith("sort:"))
async def set_sort(callback:CallbackQuery,state:FSMContext):
    data=await state.get_data(); column=data.get("sort_column")
    if not column: await callback.answer("اول شماره ستون را ارسال کن",show_alert=True); return
    idx=column-1; reverse=callback.data.endswith(":desc"); rows=data["rows"][:]
    def key(row):
        value=row[idx].strip()
        try:return (0,float(value.replace(",","")))
        except ValueError:return (1,value.casefold())
    rows.sort(key=key,reverse=reverse); await state.update_data(rows=rows,sort_column=None); await state.set_state(BuilderState.editor); await callback.answer("مرتب شد"); await callback.message.answer("✅ جدول مرتب شد.",reply_markup=editor_menu())

@router.callback_query(F.data.startswith("style:"))
async def set_style(callback:CallbackQuery,state:FSMContext):
    style=callback.data.split(":",1)[1]; await state.update_data(style=style); await state.set_state(BuilderState.preview); await callback.answer("قالب اعمال شد"); data=await state.get_data(); await callback.message.edit_text(_render(data),reply_markup=preview_menu(bool(data.get("advanced"))))

@router.callback_query(F.data == "setting:index")
async def toggle_index(callback:CallbackQuery,state:FSMContext):
    data=await state.get_data(); await state.update_data(show_index=not data.get("show_index",False)); await state.set_state(BuilderState.editor); await callback.answer("تنظیم شد"); await callback.message.answer("✅ شماره ردیف تنظیم شد.",reply_markup=editor_menu())

@router.callback_query(F.data.startswith("align:"))
async def set_align(callback:CallbackQuery,state:FSMContext):
    align=callback.data.split(":",1)[1]
    if align in {"left","center","right"}: await state.update_data(align=align)
    await state.set_state(BuilderState.editor); await callback.answer("تراز اعمال شد"); await callback.message.answer("✅ تراز متن تغییر کرد.",reply_markup=editor_menu())

@router.callback_query(F.data == "help")
async def help_handler(callback:CallbackQuery):
    await callback.answer(); await callback.message.answer("<b>ℹ️ راهنمای Reach</b>\\n\\nبرای پیام پیشرفته می‌تونی چند بخش را در یک پیام واحد بچینی: سربرگ، متن، جدول، آمار، بخش برجسته، جداکننده و پاورقی.\\n\\nداده‌ها رو با | جدا کن؛ خط اول عنوان ستون‌هاست.",reply_markup=main_menu())

@router.callback_query(F.data.startswith("adv:"))
async def advanced_actions(callback:CallbackQuery,state:FSMContext):
    data=await state.get_data(); layout=normalize_layout(data.get("layout"),data.get("kind","table")); parts=callback.data.split(":"); action=parts[1]
    if action=="add": await callback.answer(); await callback.message.edit_text("➕ <b>افزودن بخش</b>\\n\\nنوع بخش را انتخاب کن:",reply_markup=block_add_menu()); return
    if action=="add" and len(parts)>2: return
    if action in {"up","down","delete","edit"}:
        try:i=int(parts[2])
        except (ValueError,IndexError): await callback.answer("بخش نامعتبر است",show_alert=True); return
        if not 0<=i<len(layout): await callback.answer("بخش نامعتبر است",show_alert=True); return
        if action=="up" and i>0: layout[i-1],layout[i]=layout[i],layout[i-1]
        elif action=="down" and i<len(layout)-1: layout[i+1],layout[i]=layout[i],layout[i+1]
        elif action=="delete" and layout[i].get("type") not in {"header","table","footer"}: layout.pop(i)
        elif action=="edit": await callback.answer(); await callback.message.edit_text("🛠 <b>ویرایش بخش</b>",reply_markup=block_edit_menu(i,layout[i].get("type"))); return
        await state.update_data(layout=layout); await callback.answer("انجام شد"); await callback.message.edit_text("🧩 <b>مدیریت بخش‌های پیام</b>",reply_markup=blocks_menu(layout)); return
    if action=="add" and len(parts)==3:
        typ=parts[2]
        if typ not in {"text","stats","highlight","separator"}: await callback.answer("نوع نامعتبر",show_alert=True); return
        defaults={"text":{"type":"text","text":"متن جدید"},"stats":{"type":"stats","items":[{"label":"تعداد","value":"{{count}}"}]},"highlight":{"type":"highlight","title":"نکته مهم","text":""},"separator":{"type":"separator"}}
        layout.append(defaults[typ]); await state.update_data(layout=layout); await callback.answer("بخش اضافه شد"); await callback.message.edit_text("🧩 <b>مدیریت بخش‌های پیام</b>",reply_markup=blocks_menu(layout)); return
    if action=="field":
        i=int(parts[2]); field=parts[3]; await state.update_data(adv_index=i,adv_field=field); await state.set_state(BuilderState.edit_value); await callback.answer()
        prompt="📝 مقدار جدید را بفرست."
        if field=="items": prompt="📈 آیتم‌های آمار را هر خط به شکل «عنوان | مقدار» بفرست. مثال:\\n<b>برد | 18</b>\\n<b>امتیاز | 1250</b>\\nبرای {{count}} از تعداد ردیف‌ها استفاده کن."
        await callback.message.answer(prompt); return
