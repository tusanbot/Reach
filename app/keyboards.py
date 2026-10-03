from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

def main_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📊 ساخت جدول", callback_data="builder:table"), InlineKeyboardButton(text="🏆 رتبه‌بندی", callback_data="builder:ranking")],
        [InlineKeyboardButton(text="📈 آمار", callback_data="builder:stats"), InlineKeyboardButton(text="📝 پیام سفارشی", callback_data="builder:custom")],
        [InlineKeyboardButton(text="✨ پیام پیشرفته", callback_data="builder:advanced")],
        [InlineKeyboardButton(text="📥 ورود فایل", callback_data="file:upload"), InlineKeyboardButton(text="📚 قالب‌های من", callback_data="templates:list")],
        [InlineKeyboardButton(text="ℹ️ راهنما", callback_data="help")],
    ])

def import_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📎 ارسال فایل", callback_data="file:upload")],
        [InlineKeyboardButton(text="↩️ بازگشت", callback_data="builder:table")],
    ])

def preview_menu(advanced=False):
    if advanced:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✅ ساخت پیام", callback_data="builder:publish"), InlineKeyboardButton(text="🧩 مدیریت بخش‌ها", callback_data="builder:blocks")],
            [InlineKeyboardButton(text="🎨 قالب", callback_data="builder:style"), InlineKeyboardButton(text="💾 ذخیره قالب", callback_data="templates:save")],
            [InlineKeyboardButton(text="↩️ ویرایش جدول", callback_data="builder:editor"), InlineKeyboardButton(text="❌ لغو", callback_data="builder:cancel")],
        ])
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ ساخت پیام", callback_data="builder:publish"), InlineKeyboardButton(text="✏️ ویرایش", callback_data="builder:editor")],
        [InlineKeyboardButton(text="🎨 قالب", callback_data="builder:style"), InlineKeyboardButton(text="⚙️ تنظیمات", callback_data="builder:settings")],
        [InlineKeyboardButton(text="💾 ذخیره قالب", callback_data="templates:save"), InlineKeyboardButton(text="❌ لغو", callback_data="builder:cancel")],
    ])

def editor_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🏷 عنوان", callback_data="edit:title"), InlineKeyboardButton(text="💬 زیرعنوان", callback_data="edit:subtitle")],
        [InlineKeyboardButton(text="📝 پاورقی", callback_data="edit:footer"), InlineKeyboardButton(text="🔤 نام ستون‌ها", callback_data="edit:headers")],
        [InlineKeyboardButton(text="➕ افزودن ردیف", callback_data="edit:addrow"), InlineKeyboardButton(text="➖ حذف ردیف", callback_data="edit:delrow")],
        [InlineKeyboardButton(text="➕ افزودن ستون", callback_data="edit:addcol"), InlineKeyboardButton(text="➖ حذف ستون", callback_data="edit:delcol")],
        [InlineKeyboardButton(text="↕️ مرتب‌سازی", callback_data="edit:sort"), InlineKeyboardButton(text="↔️ تراز متن", callback_data="edit:align")],
        [InlineKeyboardButton(text="🔢 شماره ردیف", callback_data="setting:index")],
        [InlineKeyboardButton(text="👁 پیش‌نمایش", callback_data="builder:preview")],
    ])

def blocks_menu(layout):
    rows=[]
    for i, block in enumerate(layout):
        label = {"header":"🏷 سربرگ","text":"📝 متن","table":"📊 جدول","stats":"📈 آمار","highlight":"⭐ برجسته","separator":"➖ جداکننده","footer":"📌 پاورقی"}.get(block.get("type"), "بخش")
        controls=[InlineKeyboardButton(text=f"{label} {i+1}", callback_data=f"adv:edit:{i}")]
        if i > 0: controls.append(InlineKeyboardButton(text="⬆️", callback_data=f"adv:up:{i}"))
        if i < len(layout)-1: controls.append(InlineKeyboardButton(text="⬇️", callback_data=f"adv:down:{i}"))
        if block.get("type") not in {"header","table","footer"}: controls.append(InlineKeyboardButton(text="🗑", callback_data=f"adv:delete:{i}"))
        rows.append(controls)
    rows.append([InlineKeyboardButton(text="➕ افزودن بخش", callback_data="adv:add")])
    rows.append([InlineKeyboardButton(text="👁 پیش‌نمایش", callback_data="builder:preview")])
    return InlineKeyboardMarkup(inline_keyboard=rows)

def block_add_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📝 متن", callback_data="adv:add:text"), InlineKeyboardButton(text="📈 آمار", callback_data="adv:add:stats")],
        [InlineKeyboardButton(text="⭐ برجسته", callback_data="adv:add:highlight"), InlineKeyboardButton(text="➖ جداکننده", callback_data="adv:add:separator")],
        [InlineKeyboardButton(text="↩️ بازگشت", callback_data="builder:blocks")],
    ])

def block_edit_menu(index, block_type):
    rows=[]
    if block_type == "header": rows.append([InlineKeyboardButton(text="🏷 عنوان", callback_data=f"adv:field:{index}:title"), InlineKeyboardButton(text="💬 زیرعنوان", callback_data=f"adv:field:{index}:subtitle")])
    elif block_type in {"text","footer"}: rows.append([InlineKeyboardButton(text="📝 متن", callback_data=f"adv:field:{index}:text")])
    elif block_type == "highlight": rows.append([InlineKeyboardButton(text="🏷 عنوان", callback_data=f"adv:field:{index}:title"), InlineKeyboardButton(text="📝 متن", callback_data=f"adv:field:{index}:text")])
    elif block_type == "stats": rows.append([InlineKeyboardButton(text="📈 آیتم‌های آمار", callback_data=f"adv:field:{index}:items")])
    rows.append([InlineKeyboardButton(text="↩️ بازگشت", callback_data="builder:blocks")])
    return InlineKeyboardMarkup(inline_keyboard=rows)

def sort_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔼 صعودی", callback_data="sort:asc"), InlineKeyboardButton(text="🔽 نزولی", callback_data="sort:desc")],
        [InlineKeyboardButton(text="↩️ بازگشت", callback_data="builder:editor")],
    ])

def align_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="⬅️ چپ", callback_data="align:left"), InlineKeyboardButton(text="↔️ وسط", callback_data="align:center"), InlineKeyboardButton(text="➡️ راست", callback_data="align:right")],
        [InlineKeyboardButton(text="↩️ بازگشت", callback_data="builder:editor")],
    ])

def style_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📦 کلاسیک", callback_data="style:classic"), InlineKeyboardButton(text="✨ تمیز", callback_data="style:clean")],
        [InlineKeyboardButton(text="🏆 مسابقاتی", callback_data="style:competition")],
        [InlineKeyboardButton(text="↩️ بازگشت", callback_data="builder:preview")],
    ])

def settings_menu(show_index=False):
    label = "🔢 حذف شماره ردیف" if show_index else "🔢 نمایش شماره ردیف"
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=label, callback_data="setting:index")],
        [InlineKeyboardButton(text="↩️ بازگشت", callback_data="builder:editor")],
    ])
