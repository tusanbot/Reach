const token = process.env.BOT_TOKEN;
const workerUrl = process.env.WORKER_URL;
const secret = process.env.WEBHOOK_SECRET;

if (!token || !workerUrl || !secret) {
  console.error("BOT_TOKEN, WORKER_URL and WEBHOOK_SECRET are required.");
  process.exit(1);
}

const baseUrl = workerUrl.replace(/\/$/, "");
const webhookUrl = baseUrl + "/webhook";
const api = (method) => `https://api.telegram.org/bot${token}/${method}`;

async function telegram(method, options = {}) {
  const response = await fetch(api(method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options),
  });

  const body = await response.text();
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Telegram returned non-JSON response (HTTP ${response.status}).`);
  }

  if (!response.ok || data.ok !== true) {
    throw new Error(data.description || `Telegram API request failed (HTTP ${response.status}).`);
  }

  return data;
}

const result = await telegram("setWebhook", {
  url: webhookUrl,
  secret_token: secret,
  drop_pending_updates: true,
});

console.log(`Webhook registered: ${result.result === true ? "yes" : "no"}`);
console.log(`Webhook URL: ${webhookUrl}`);

const info = await telegram("getWebhookInfo");
const configured = info.result?.url === webhookUrl;

console.log(`Webhook verified: ${configured ? "yes" : "no"}`);
console.log(`Pending updates: ${info.result?.pending_update_count ?? 0}`);

if (info.result?.last_error_message) {
  console.log(`Telegram last error: ${info.result.last_error_message}`);
}

if (!configured) {
  console.error("Webhook verification failed: Telegram reports a different URL.");
  process.exit(1);
}
