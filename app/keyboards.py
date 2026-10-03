from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

def main_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📊 ساخت جدول", callback_data="builder:table"), InlineKeyboardButton(text="🏆 رتبه‌بندی", callback_data="builder:ranking")],
        [InlineKeyboardButton(text="📈 آمار", callback_data="builder:stats"), InlineKeyboardButton(text="📝 پیام سفارشی", callback_data="builder:custom")],
        [InlineKeyboardButton(text="📚 قالب‌های من", callback_data="templates:list"), InlineKeyboardButton(text="ℹ️ راهنما", callback_data="help")],
    ])

def import_menu():
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="ارسال فایل", callback_data="file:upload")],[InlineKeyboardButton(text="بازگشت", callback_data="builder:table")]])

def preview_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ ساخت پیام", callback_data="builder:publish"), InlineKeyboardButton(text="✏️ ویرایش", callback_data="builder:editor")],
        [InlineKeyboardButton(text="🎨 قالب", callback_data="builder:style"), InlineKeyboardButton(text="⚙️ تنظیمات", callback_data="builder:settings")],
        [InlineKeyboardButton(text="❌ لغو", callback_data="builder:cancel")],
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
