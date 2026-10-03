const token=process.env.BOT_TOKEN;
const workerUrl=process.env.WORKER_URL;
const secret=process.env.WEBHOOK_SECRET;
if(!token||!workerUrl||!secret){
  console.error("BOT_TOKEN, WORKER_URL and WEBHOOK_SECRET are required.");
  process.exit(1);
}
const url=workerUrl.replace(/\/$/,"")+"/webhook";
const response=await fetch(`https://api.telegram.org/bot${token}/setWebhook`,{
  method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({url,secret_token:secret,drop_pending_updates:true})
});
const body=await response.text();
console.log(body);
if(!response.ok) process.exit(1);
