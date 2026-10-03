from aiogram import F, Router

router = Router()

@router.callback_query(F.data == "file:upload")
async def ask_file(callback, state):
    await callback.answer()
    await callback.message.answer("فایل CSV، TXT یا XLSX را ارسال کنید.")
