# Reach

Telegram message builder for professional, forwardable tables and rich messages.


## ورود فایل

Reach می‌تواند داده را از فایل‌های **CSV، TXT و XLSX** دریافت کند.

- CSV: تشخیص جداکننده‌های رایج مانند `,`، `;`، Tab و `|`
- TXT: خواندن فایل‌های متنی جدولی با جداکننده تشخیص‌داده‌شده
- XLSX: خواندن Sheetهای دارای جدول
- Excel چندSheet: انتخاب Sheet قبل از Preview
- ردیف اول به‌عنوان Header در نظر گرفته می‌شود
- بعد از Import، داده وارد همان ویرایشگر Reach می‌شود و می‌توان ردیف، ستون، عنوان، مرتب‌سازی، تراز و قالب را تغییر داد


## Cloudflare Workers Deployment

Reach is an independent Telegram bot and its production runtime is Cloudflare Workers. The Worker receives Telegram updates through a webhook and stores persistent bot state/templates in Cloudflare D1. The previous aiogram/SQLite implementation remains in the repository as legacy/reference code; it is not the production entrypoint.

### 1. Create the D1 database

```bash
npx wrangler d1 create reach
```

Copy the returned `database_id` into `wrangler.toml`.

### 2. Apply the schema

```bash
npx wrangler d1 migrations apply reach --remote
```

### 3. Configure secrets

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```

Use a long random value for `WEBHOOK_SECRET`.

### 4. Install and deploy

```bash
npm install
npm run deploy
```

### 5. Set the Telegram webhook

After deployment, set Telegram's webhook with the included helper:

```bash
BOT_TOKEN="..." WORKER_URL="https://YOUR_WORKER_DOMAIN" WEBHOOK_SECRET="..." node scripts/set-webhook.mjs
```

The helper calls Telegram's `setWebhook` API and configures the secret token. Telegram then sends HTTPS POST updates directly to the Worker. Telegram delivers updates to the HTTPS webhook, so Reach no longer needs polling or a continuously running server.

Health check:

```text
https://YOUR_WORKER_DOMAIN/health
```

Expected response:

```json
{"ok":true,"service":"reach","runtime":"cloudflare-workers"}
```

### Cloudflare architecture

```text
Telegram
   ↓ HTTPS webhook
Cloudflare Worker
   ├── Telegram Bot API
   ├── Advanced Message Builder
   ├── Parser / Renderer
   └── Session + Template state
           ↓
         D1
```

No Railway, Vercel, Mafia bot, or other project is required by Reach.
