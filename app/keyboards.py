from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

def main_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📊 ساخت جدول", callback_data="builder:table"), InlineKeyboardButton(text="🏆 رتبه‌بندی", callback_data="builder:ranking")],
        [InlineKeyboardButton(text="📈 آمار", callback_data="builder:stats"), InlineKeyboardButton(text="📝 پیام سفارشی", callback_data="builder:custom")],
        [InlineKeyboardButton(text="📚 قالب‌های من", callback_data="templates:list"), InlineKeyboardButton(text="ℹ️ راهنما", callback_data="help")],
    ])

def preview_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ ساخت پیام", callback_data="builder:publish"), InlineKeyboardButton(text="✏️ ویرایش داده", callback_data="builder:edit")],
        [InlineKeyboardButton(text="🎨 قالب", callback_data="builder:style"), InlineKeyboardButton(text="⚙️ تنظیمات", callback_data="builder:settings")],
        [InlineKeyboardButton(text="❌ لغو", callback_data="builder:cancel")],
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
        [InlineKeyboardButton(text="↩️ بازگشت", callback_data="builder:preview")],
    ])
