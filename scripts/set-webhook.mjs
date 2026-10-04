const workerUrl = process.env.WORKER_URL;
const diagnosticSecret = process.env.DIAGNOSTIC_SECRET;

if (!workerUrl || !diagnosticSecret) {
  console.error("WORKER_URL and DIAGNOSTIC_SECRET are required.");
  process.exit(1);
}

const rawWorkerUrl = workerUrl.trim();
let baseUrl;
try {
  baseUrl = new URL(rawWorkerUrl).origin;
} catch {
  console.error("WORKER_URL must be a full URL, for example https://reach.example.workers.dev");
  process.exit(1);
}

const endpoint = baseUrl + "/admin/set-webhook";

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "X-Diagnostic-Secret": diagnosticSecret,
  },
});

const body = await response.text();
let data;
try {
  data = JSON.parse(body);
} catch {
  throw new Error("Worker returned non-JSON response (HTTP " + response.status + ").");
}

if (!response.ok || data.ok !== true) {
  throw new Error(data.error || "Webhook setup failed (HTTP " + response.status + ").");
}

console.log("Webhook registered: " + (data.verified ? "yes" : "no"));
console.log("Webhook URL: " + data.webhook_url);
console.log("Webhook verified: " + (data.verified ? "yes" : "no"));
console.log("Pending updates: " + (data.pending_update_count ?? 0));

if (data.last_error_message) {
  console.log("Telegram last error: " + data.last_error_message);
}
