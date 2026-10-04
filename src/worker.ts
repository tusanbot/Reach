import * as XLSX from "xlsx";

interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  DIAGNOSTIC_SECRET: string;
  ENVIRONMENT?: string;
}

type Block =
  | { type: "header"; title: string; subtitle?: string }
  | { type: "text"; text: string }
  | { type: "table" }
  | { type: "stats"; items: { label: string; value: string }[] }
  | { type: "highlight"; title?: string; text?: string }
  | { type: "separator" }
  | { type: "footer"; text: string };

const API = (env: Env) => `https://api.telegram.org/bot${env.BOT_TOKEN}`;

async function runtimeLog(env: Env, level: string, event: string, data?: unknown) {
  try {
    await env.DB.prepare(
      "INSERT INTO runtime_logs(level,event,data_json) VALUES(?,?,?)"
    ).bind(level, event, data == null ? null : JSON.stringify(data)).run();
  } catch (error) {
    console.error("runtime log persistence failed", { event, error });
  }
}

function diagnosticAuthorized(request: Request, env: Env, url: URL) {
  const headerSecret = request.headers.get("X-Diagnostic-Secret");
  const querySecret = url.searchParams.get("token");
  return Boolean(env.DIAGNOSTIC_SECRET) &&
    (headerSecret === env.DIAGNOSTIC_SECRET || querySecret === env.DIAGNOSTIC_SECRET);
}

function logsLoginHtml(message = "") {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Reach · ورود به لاگ‌ها</title>
<style>:root{color-scheme:dark}body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:520px;margin:10vh auto;padding:24px}.card{background:#111827;border:1px solid #334155;border-radius:16px;padding:24px}
h1{margin-top:0}.sub{color:#94a3b8;line-height:1.8}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #475569;border-radius:10px;background:#020617;color:#fff;margin:14px 0}
button{width:100%;padding:12px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:15px;cursor:pointer}.error{color:#fca5a5;margin-bottom:10px}
code{direction:ltr;display:block;text-align:left;background:#020617;padding:8px;border-radius:8px}</style></head><body><main><div class="card">
<h1>🔐 لاگ‌های Reach</h1><p class="sub">برای مشاهده لاگ‌های runtime، مقدار <code>DIAGNOSTIC_SECRET</code> را وارد کن.</p>
${message ? `<div class="error">${esc(message)}</div>` : ""}
<form method="post" action="/logs"><input type="password" name="token" autocomplete="off" placeholder="Diagnostic Secret" required>
<button type="submit">مشاهده لاگ‌ها</button></form></div></main></body></html>`;
}

function logsHtml(rows: any[], token: string) {
  const escHtml = (v: unknown) => esc(v);
  const badge = (level: string) => {
    const l = String(level || "info").toLowerCase();
    return `<span class="badge ${escHtml(l)}">${escHtml(l)}</span>`;
  };
  const items = rows.map((row) => {
    const details = row.data_json ? escHtml(row.data_json) : "";
    return `<article class="log">
      <div class="meta"><span>${escHtml(row.created_at)}</span>${badge(row.level)}<code>${escHtml(row.event)}</code></div>
      ${details ? `<pre>${details}</pre>` : ""}
    </article>`;
  }).join("");
  const jsonHref = "/logs?token=" + encodeURIComponent(token) + "&format=json";
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="10">
<title>Reach · Runtime Logs</title>
<style>
:root{color-scheme:dark}body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px}.top{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
h1{margin:0;font-size:24px}.sub{color:#94a3b8;margin-top:6px}.actions{display:flex;gap:8px}.btn{display:inline-block;padding:9px 13px;border:1px solid #334155;border-radius:9px;color:#e2e8f0;text-decoration:none;background:#1e293b}
.log{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:14px;margin:10px 0}.meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:#94a3b8}
code{font-family:ui-monospace,SFMono-Regular,monospace;color:#cbd5e1}.badge{border-radius:999px;padding:3px 8px;font-size:12px}.error{background:#7f1d1d;color:#fecaca}.warn{background:#78350f;color:#fde68a}.info{background:#1e3a8a;color:#bfdbfe}
pre{white-space:pre-wrap;word-break:break-word;background:#020617;border-radius:8px;padding:10px;margin:10px 0 0;color:#cbd5e1;direction:ltr;text-align:left}
.empty{padding:40px;text-align:center;color:#94a3b8;background:#111827;border-radius:12px}
</style>
</head>
<body><main>
<div class="top"><div><h1>🧾 لاگ‌های Reach</h1><div class="sub">آخرین ۱۰۰ رویداد · بروزرسانی خودکار هر ۱۰ ثانیه</div></div>
<div class="actions"><a class="btn" href="/logs?token=${encodeURIComponent(token)}">🔄 بروزرسانی</a><a class="btn" href="${jsonHref}">JSON</a></div></div>
<section>${items || '<div class="empty">لاگی ثبت نشده است.</div>'}</section>
</main></body></html>`;
}
const TITLES: Record<string,string> = {
  table:"📊 جدول", ranking:"🏆 رتبه‌بندی", stats:"📈 آمار", custom:"📝 پیام سفارشی", advanced:"✨ پیام پیشرفته"
};

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function defaultLayout(kind="table"): Block[] {
  return [
    {type:"header",title:TITLES[kind] ?? "📊 جدول",subtitle:""},
    {type:"table"},
    {type:"stats",items:[{label:"تعداد ردیف",value:"{{count}}"}]},
    {type:"footer",text:""}
  ];
}

function normalizeLayout(layout: unknown, kind="table"): Block[] {
  if (!Array.isArray(layout)) return defaultLayout(kind);
  const valid = new Set(["header","text","table","stats","highlight","separator","footer"]);
  const out: Block[] = [];
  for (const raw of layout) {
    if (!raw || typeof raw !== "object" || !valid.has((raw as any).type)) continue;
    const b:any = structuredClone(raw);
    if (b.type==="header") { b.title ??=""; b.subtitle ??=""; }
    if (b.type==="text" || b.type==="footer") b.text ??="";
    if (b.type==="stats") b.items ??=[];
    if (b.type==="highlight") { b.title ??=""; b.text ??=""; }
    out.push(b);
  }
  return out.length ? out : defaultLayout(kind);
}

function legacyLayout(config:any, kind="table"): Block[] {
  if (config?.layout) return normalizeLayout(config.layout,kind);
  const l=defaultLayout(kind);
  const h=l.find((x:any)=>x.type==="header") as any;
  const f=l.find((x:any)=>x.type==="footer") as any;
  if(h){h.title=config?.title ?? h.title; h.subtitle=config?.subtitle ?? "";}
  if(f) f.text=config?.footer ?? "";
  return l;
}

function parseTable(text:string) {
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(lines.length<2) throw new Error("حداقل یک ردیف داده لازم است.");
  const rows=lines.map(line=>line.split("|").map(x=>x.trim()));
  const width=rows[0].length;
  if(width<2) throw new Error("جدول باید حداقل دو ستون داشته باشد.");
  if(rows.some(r=>r.length!==width)) throw new Error("تعداد ستون‌های ردیف‌ها یکسان نیست.");
  return {headers:rows[0],rows:rows.slice(1)};
}

function parseDelimited(text:string) {
  const lines=text.split(/\r?\n/).filter(x=>x.trim());
  if(lines.length<2) throw new Error("فایل داده کافی ندارد.");
  const first=lines[0];
  const candidates=[",",";","\t","|"];
  const delimiter=candidates.sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  const parse=(line:string)=>line.split(delimiter).map(x=>x.trim().replace(/^"(.*)"$/,"$1"));
  const all=lines.map(parse);
  const width=all[0].length;
  if(width<2 || all.some(r=>r.length!==width)) throw new Error("ساختار فایل جدولی معتبر نیست.");
  return {headers:all[0],rows:all.slice(1)};
}

function renderTable(headers:string[],rows:string[][],style="classic",showIndex=false,align="left") {
  const data=showIndex ? [["# ",...headers],...rows.map((r,i)=>[String(i+1),...r])] : [headers,...rows];
  const widths=data[0].map((_,i)=>Math.max(...data.map(r=>String(r[i]??"").length),1));
  const chars=style==="competition"?["╔","╦","╗","╠","╬","╣","╚","╩","╝"]:style==="clean"?["╭","┬","╮","├","┼","┤","╰","┴","╯"]:["┌","┬","┐","├","┼","┤","└","┴","┘"];
  const line=(l,m,r)=>l+widths.map(w=>"─".repeat(w+2)).join(m)+r;
  const row=(cells:string[])=>"│"+cells.map((c,i)=>" "+(align==="right"?String(c).padStart(widths[i]):align==="center"?String(c).padStart(Math.ceil((widths[i]+String(c).length)/2)).padEnd(widths[i]):String(c).padEnd(widths[i]))+" ").join("│")+"│";
  const [tl,tm,tr,ml,mm,mr,bl,bm,br]=chars;
  return "<pre>"+[line(tl,tm,tr),row(data[0].map(esc)),line(ml,mm,mr),...data.slice(1).map(r=>row(r.map(esc))),line(bl,bm,br)].join("\n")+"</pre>";
}

function buildRichMessage(layout:Block[],headers:string[],rows:string[][],opts:any={}): any {
  const blocks:any[]=[];
  for(const b of normalizeLayout(layout,opts.kind)){
    if(b.type==="header"){
      if(b.title || b.subtitle){
        blocks.push({
          type:"heading",
          size:2,
          text:[
            ...(b.title ? [{type:"bold",text:"🏷 " + b.title}] : []),
            ...(b.subtitle ? ["\n" + b.subtitle] : [])
          ]
        });
      }
    } else if(b.type==="text"){
      if(b.text?.trim()) blocks.push({type:"paragraph",text:b.text});
    } else if(b.type==="table"){
      const data=[headers,...rows];
      blocks.push({
        type:"table",
        cells:data.map((r,rowIndex)=>r.map((c)=>({
          text:String(c??""),
          is_header:rowIndex===0,
          align:opts.align==="center" ? "center" : opts.align==="right" ? "right" : "left",
          valign:"middle"
        }))),
        is_bordered:true,
        is_striped:true,
        is_compact:false
      });
    } else if(b.type==="stats"){
      const items=(b.items ?? []).map((item:any)=>({
        blocks:[{type:"paragraph",text:[
          {type:"bold",text:String(item.label??"")},
          ": " + String(item.value??"").replaceAll("{{count}}",String(rows.length))
        ]}]
      }));
      if(items.length) blocks.push({
        type:"details",
        summary:"📈 آمار",
        blocks:[{type:"list",items}]
      });
    } else if(b.type==="highlight"){
      if(b.title || b.text) blocks.push({
        type:"blockquote",
        blocks:[{
          type:"paragraph",
          text:[
            ...(b.title ? [{type:"bold",text:"⭐ " + b.title}] : []),
            ...(b.text ? (b.title ? ["\n"] : []).concat([b.text]) : [])
          ]
        }]
      });
    } else if(b.type==="separator"){
      blocks.push({type:"divider"});
    } else if(b.type==="footer" && b.text?.trim()){
      blocks.push({type:"footer",text:b.text});
    }
  }
  return {blocks,is_rtl:true};
}

function richTextToHtml(value:any): string {
  if(Array.isArray(value)) return value.map(richTextToHtml).join("");
  if(value && typeof value==="object"){
    if(value.type==="bold") return "<b>"+richTextToHtml(value.text)+"</b>";
    if(value.type==="italic") return "<i>"+richTextToHtml(value.text)+"</i>";
    if(value.type==="underline") return "<u>"+richTextToHtml(value.text)+"</u>";
    if(value.type==="strikethrough") return "<s>"+richTextToHtml(value.text)+"</s>";
    if(value.type==="code") return "<code>"+richTextToHtml(value.text)+"</code>";
    return richTextToHtml(value.text ?? "");
  }
  return esc(value ?? "");
}

function buildRichFallbackHtml(rich:any): string {
  const out:string[]=[];
  for(const b of rich.blocks ?? []){
    if(b.type==="heading") out.push(richTextToHtml(b.text));
    else if(b.type==="paragraph") out.push(richTextToHtml(b.text));
    else if(b.type==="divider") out.push("────────────");
    else if(b.type==="footer") out.push("📌 "+richTextToHtml(b.text));
    else if(b.type==="table") {
      const rows=(b.cells ?? []).map((row:any[])=>row.map((cell:any)=>richTextToHtml(cell?.text ?? "")).join(" | "));
      if(rows.length) out.push("<pre>"+rows.join("\n")+"</pre>");
      if(b.caption) out.push(richTextToHtml(b.caption));
    }
    else if(b.type==="buttons") { /* native rich buttons are supplied via reply_markup on fallback */ }
    else if(b.type==="blockquote") out.push("❯ "+richTextToHtml(b.blocks?.[0]?.text));
    else if(b.type==="details") out.push("<b>"+richTextToHtml(b.summary)+"</b>");
  }
  return out.join("\n\n").slice(0,3900);
}

function getMessageLayout(data:any): Block[] {
  if (data.advanced) return normalizeLayout(data.layout,data.kind);
  return normalizeLayout([
    {type:"header",title:data.title,subtitle:data.subtitle},
    {type:"table"},
    {type:"footer",text:data.footer}
  ],data.kind);
}

async function sendRichMessage(env:Env,chat:number,rich_message:any,reply_markup?:any) {
  try {
    return await tg(env,"sendRichMessage",{
      chat_id:chat,
      rich_message,
      reply_markup
    });
  } catch(error) {
    await runtimeLog(env,"warn","RICH_MESSAGE_FALLBACK",{
      message:error instanceof Error ? error.message : String(error)
    });
    return tg(env,"sendMessage",{
      chat_id:chat,
      text:buildRichFallbackHtml(rich_message),
      parse_mode:"HTML",
      disable_web_page_preview:true,
      reply_markup
    });
  }
}

function mainKeyboard() {
  return {inline_keyboard:[
    [{text:"📊 ساخت جدول",callback_data:"builder:table"},{text:"🏆 رتبه‌بندی",callback_data:"builder:ranking"}],
    [{text:"📈 آمار",callback_data:"builder:stats"},{text:"📝 پیام سفارشی",callback_data:"builder:custom"}],
    [{text:"✨ پیام پیشرفته",callback_data:"builder:advanced"}],
    [{text:"📥 ورود فایل",callback_data:"file:upload"},{text:"📚 قالب‌های من",callback_data:"templates:list"}],
    [{text:"ℹ️ راهنما",callback_data:"help"}]
  ]};
}

function previewKeyboard(advanced=false) {
  return {inline_keyboard:advanced ? [
    [{text:"✅ ساخت پیام",callback_data:"builder:publish"},{text:"🧩 مدیریت بخش‌ها",callback_data:"builder:blocks"}],
    [{text:"🎨 قالب",callback_data:"builder:style"},{text:"💾 ذخیره قالب",callback_data:"templates:save"}],
    [{text:"❌ لغو",callback_data:"builder:cancel"}]
  ] : [
    [{text:"✅ ساخت پیام",callback_data:"builder:publish"},{text:"✏️ ویرایش",callback_data:"builder:edit"}],
    [{text:"💾 ذخیره قالب",callback_data:"templates:save"},{text:"❌ لغو",callback_data:"builder:cancel"}]
  ]};
}

async function tg(env:Env,method:string,payload:any) {
  const r=await fetch(API(env)+"/"+method,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(payload)
  });
  const raw=await r.text();
  let data:any;
  try {
    data=JSON.parse(raw);
  } catch {
    await runtimeLog(env,"error","TELEGRAM_API_ERROR",{method,http_status:r.status,description:"invalid_json"});
    throw new Error(`Telegram API ${method} returned invalid JSON (HTTP ${r.status})`);
  }
  if(!r.ok || data?.ok!==true) {
    const description=data?.description || "unknown Telegram API error";
    await runtimeLog(env,"error","TELEGRAM_API_ERROR",{method,http_status:r.status,description});
    throw new Error(`Telegram API ${method} failed (HTTP ${r.status}): ${description}`);
  }
  return data;
}
async function answer(env:Env,id:string,text="") { return tg(env,"answerCallbackQuery",{callback_query_id:id,text}); }
async function send(env:Env,chat:number,text:string,reply_markup?:any) {
  return tg(env,"sendMessage",{chat_id:chat,text,parse_mode:"HTML",reply_markup});
}
async function edit(env:Env,chat:number,message:number,text:string,reply_markup?:any) {
  return tg(env,"editMessageText",{chat_id:chat,message_id:message,text,parse_mode:"HTML",reply_markup});
}

async function saveSession(env:Env,id:number,state:string,data:any) {
  await env.DB.prepare("INSERT INTO sessions(telegram_id,state,data,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(telegram_id) DO UPDATE SET state=excluded.state,data=excluded.data,updated_at=CURRENT_TIMESTAMP")
    .bind(id,state,JSON.stringify(data)).run();
}
async function getSession(env:Env,id:number) {
  const r=await env.DB.prepare("SELECT state,data FROM sessions WHERE telegram_id=?").bind(id).first<any>();
  return r ? {state:r.state,data:JSON.parse(r.data)} : null;
}
async function clearSession(env:Env,id:number) { await env.DB.prepare("DELETE FROM sessions WHERE telegram_id=?").bind(id).run(); }

async function upsertUser(env:Env,u:any) {
  await env.DB.prepare("INSERT INTO users(telegram_id,username,first_name) VALUES(?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,updated_at=CURRENT_TIMESTAMP")
    .bind(u.id,u.username??"",u.first_name??"").run();
}

async function showPreview(env:Env,chat:number,message:number,data:any) {
  const rich_message=buildRichMessage(getMessageLayout(data),data.headers,data.rows,{style:data.style,showIndex:data.showIndex,align:data.align,kind:data.kind});
  try {
    await tg(env,"editMessageText",{
      chat_id:chat,
      message_id:message,
      rich_message,
      reply_markup:previewKeyboard(Boolean(data.advanced))
    });
  } catch(error) {
    await runtimeLog(env,"warn","RICH_PREVIEW_FALLBACK",{
      message:error instanceof Error ? error.message : String(error)
    });
    await edit(env,chat,message,buildRichFallbackHtml(rich_message),previewKeyboard(Boolean(data.advanced)));
  }
}

function richText(value:string,bold=false): any {
  return bold ? {type:"bold",text:value} : value;
}
function richBuilderButtons(data:any) {
  const buttons=(data.richButtons ?? []).filter((b:any)=>b?.text && b?.url);
  return buttons.length ? {inline_keyboard:buttons.map((b:any)=>[{text:String(b.text).slice(0,64),url:String(b.url)}])} : undefined;
}
function buildSimpleRichMessage(data:any): any {
  const blocks:any[]=[];
  const title=String(data.richTitle ?? "").trim();
  const caption=String(data.richCaption ?? "").trim();
  const headers=Array.isArray(data.headers) ? data.headers : [];
  const rows=Array.isArray(data.rows) ? data.rows : [];
  if(title) blocks.push({type:"heading",size:2,text:richText("🏷 "+title,Boolean(data.richTitleBold))});
  if(headers.length && rows.length) {
    const cells=[headers,...rows].map((row:any[],rowIndex:number)=>row.map((cell:any)=>({text:String(cell ?? ""),is_header:rowIndex===0,align:data.align==="center"?"center":data.align==="right"?"right":"left",valign:"middle"})));
    const table:any={type:"table",cells,is_bordered:true,is_striped:true,is_compact:false};
    if(caption) table.caption=richText(caption,Boolean(data.richCaptionBold));
    blocks.push(table);
  } else if(caption) blocks.push({type:"paragraph",text:richText(caption,Boolean(data.richCaptionBold))});
  const buttons=(data.richButtons ?? []).filter((b:any)=>b?.text && b?.url);
  for(let i=0;i<buttons.length;i+=4) blocks.push({type:"buttons",buttons:buttons.slice(i,i+4).map((b:any)=>({text:String(b.text).slice(0,64),style:["danger","success","primary","link"].includes(b.style)?b.style:"primary",url:String(b.url)})),align:"center"});
  return {blocks,is_rtl:true};
}
function richBuilderKeyboard() {
  return {inline_keyboard:[
    [{text:"🚀 ساخت پیام",callback_data:"rich:publish"},{text:"🔄 شروع دوباره",callback_data:"rich:restart"}],
    [{text:"🏷 عنوان",callback_data:"rich:edit:title"},{text:"📊 جدول",callback_data:"rich:edit:table"}],
    [{text:"💬 توضیحات",callback_data:"rich:edit:caption"},{text:"🔘 دکمه‌ها",callback_data:"rich:edit:buttons"}],
    [{text:"💾 ذخیره قالب",callback_data:"templates:save"},{text:"❌ لغو",callback_data:"rich:cancel"}]
  ]};
}
function richStageKeyboard(stage:string) {
  if(stage==="title") return {inline_keyboard:[[{text:"⏭️ بدون عنوان",callback_data:"rich:skip:title"}],[{text:"❌ لغو",callback_data:"rich:cancel"}]]};
  if(stage==="title_style") return {inline_keyboard:[[{text:"🅱️ بولد",callback_data:"rich:title:bold"},{text:"🔤 معمولی",callback_data:"rich:title:normal"}],[{text:"🗑 حذف عنوان",callback_data:"rich:skip:title"},{text:"↩️ دوباره",callback_data:"rich:edit:title"}]]};
  if(stage==="table") return {inline_keyboard:[[{text:"⏭️ بدون جدول",callback_data:"rich:skip:table"}],[{text:"❌ لغو",callback_data:"rich:cancel"}]]};
  if(stage==="caption") return {inline_keyboard:[[{text:"⏭️ بدون توضیحات",callback_data:"rich:skip:caption"}],[{text:"❌ لغو",callback_data:"rich:cancel"}]]};
  if(stage==="caption_style") return {inline_keyboard:[[{text:"🅱️ بولد",callback_data:"rich:caption:bold"},{text:"🔤 معمولی",callback_data:"rich:caption:normal"}],[{text:"🗑 حذف توضیحات",callback_data:"rich:skip:caption"},{text:"↩️ دوباره",callback_data:"rich:edit:caption"}]]};
  return {inline_keyboard:[[{text:"⏭️ بدون دکمه",callback_data:"rich:skip:buttons"}],[{text:"❌ لغو",callback_data:"rich:cancel"}]]};
}
function richBuilderPrompt(stage:string) {
  const p:any={
    title:"🏷 <b>مرحله ۱ از ۴ · عنوان</b>\n\nعنوان پیام رو بفرست.\nمی‌تونی این مرحله رو هم خالی بذاری.",
    table:"📊 <b>مرحله ۲ از ۴ · جدول</b>\n\nاطلاعات جدول رو بفرست. خط اول نام ستون‌هاست و <code>|</code> ستون‌ها رو جدا می‌کنه.\n\n<code>بازیکن | امتیاز | برد\nعلی | 1250 | 18\nمهدی | 1180 | 16</code>",
    caption:"💬 <b>مرحله ۳ از ۴ · توضیحات زیر جدول</b>\n\nمتن کپشن یا توضیحی که می‌خوای زیر جدول نمایش داده بشه رو بفرست.",
    buttons:"🔘 <b>مرحله ۴ از ۴ · دکمه</b>\n\nاول عنوان دکمه رو بفرست؛ بعد لینک دکمه رو جداگانه می‌فرستی.\n\nمثلاً:\n<code>🌐 مشاهده سایت</code>\nبعد: <code>https://example.com</code>\n\nاگر چند دکمه می‌خوای، بعد از ثبت هر دکمه دوباره عنوان دکمه بعدی رو بفرست.\n\nهمچنین می‌تونی چند دکمه رو یکجا با فرمت <code>عنوان | لینک</code> ارسال کنی.\nبرای رد کردن این مرحله «-» بفرست."
  };
  return p[stage];
}
async function startSimpleRichBuilder(env:Env,chat:number,userId:number) {
  await saveSession(env,userId,"rich_title",{kind:"table",advanced:false,richBuilder:true,richTitle:"",richTitleBold:true,headers:[],rows:[],richCaption:"",richCaptionBold:false,richButtons:[],style:"classic",align:"left"});
  await send(env,chat,richBuilderPrompt("title"),richStageKeyboard("title"));
}
async function sendSimpleRichMessage(env:Env,chat:number,rich:any,data:any) {
  try {
    return await tg(env,"sendRichMessage",{chat_id:chat,rich_message:rich});
  } catch(error) {
    await runtimeLog(env,"warn","RICH_SIMPLE_SEND_FALLBACK",{message:error instanceof Error ? error.message : String(error)});
    return await tg(env,"sendMessage",{chat_id:chat,text:buildRichFallbackHtml(rich),parse_mode:"HTML",disable_web_page_preview:true,reply_markup:richBuilderButtons(data)});
  }
}

async function showSimpleRichPreview(env:Env,chat:number,message:number,data:any) {
  const rich_message=buildSimpleRichMessage(data);
  if(!rich_message.blocks.length) { await edit(env,chat,message,"⚠️ هنوز هیچ محتوایی برای پیام انتخاب نکردی.",richBuilderKeyboard()); return; }
  try { await tg(env,"editMessageText",{chat_id:chat,message_id:message,rich_message,reply_markup:richBuilderKeyboard()}); }
  catch(error) {
    await runtimeLog(env,"warn","RICH_SIMPLE_PREVIEW_FALLBACK",{message:error instanceof Error ? error.message : String(error)});
    await edit(env,chat,message,buildRichFallbackHtml(rich_message),richBuilderKeyboard());
  }
}

async function handleUpdate(env:Env,update:any) {
  const message=update.message;
  const cb=update.callback_query;
  const chat=message?.chat?.id ?? cb?.message?.chat?.id;
  const user=message?.from ?? cb?.from;
  if(!chat || !user) return;
  await upsertUser(env,user);

  if(cb) {
    const id=cb.id, data=cb.data||"";
    await answer(env,id);
    const session=await getSession(env,user.id);
    if(data==="help") { await send(env,chat,"<b>ℹ️ راهنمای Reach</b>\n\nReach برای ساخت پیام‌های حرفه‌ای و قابل فوروارد تلگرام است. در پیام پیشرفته می‌توانی چند بخش را داخل یک پیام واحد بچینی.",mainKeyboard()); return; }
    if(data.startsWith("style:") && session) {
      const style=data.split(":")[1];
      if(["classic","clean","competition"].includes(style)) {
        const d={...session.data,style};
        await saveSession(env,user.id,"preview",d);
        await showPreview(env,chat,cb.message.message_id,d);
      }
      return;
    }
    if(data.startsWith("rich:") && session) {
      const p=data.split(":"); const action=p[1];
      if(action==="cancel") { await clearSession(env,user.id); await edit(env,chat,cb.message.message_id,"❌ ساخت پیام لغو شد.",mainKeyboard()); return; }
      if(action==="restart") { await startSimpleRichBuilder(env,chat,user.id); return; }
      if(action==="publish") {
        const d=session.data; const rich=buildSimpleRichMessage(d);
        if(!rich.blocks.length) { await answer(env,id,"حداقل یک بخش از پیام را اضافه کن.",true); return; }
        await clearSession(env,user.id); await sendSimpleRichMessage(env,chat,rich,d); await send(env,chat,"📤 پیام نهایی آماده شد.",mainKeyboard()); return;
      }
      if(action==="edit") {
        const target=p[2];
        if(target==="title") { await saveSession(env,user.id,"rich_title",{...session.data}); await send(env,chat,"🏷 <b>عنوان جدید</b>\n\nعنوان جدید را بفرست. برای حذف <code>-</code> بفرست.",richStageKeyboard("title")); }
        else if(target==="table") { await saveSession(env,user.id,"rich_table",{...session.data}); await send(env,chat,richBuilderPrompt("table"),richStageKeyboard("table")); }
        else if(target==="caption") { await saveSession(env,user.id,"rich_caption",{...session.data}); await send(env,chat,"💬 <b>توضیحات جدید</b>\n\nمتن جدید را بفرست. برای حذف <code>-</code> بفرست.",richStageKeyboard("caption")); }
        else if(target==="buttons") { await saveSession(env,user.id,"rich_buttons",{...session.data}); await send(env,chat,richBuilderPrompt("buttons"),richStageKeyboard("buttons")); }
        return;
      }
      if(action==="skip") {
        const target=p[2]; const d={...session.data};
        if(target==="title") { d.richTitle=""; d.richTitleBold=false; await saveSession(env,user.id,"rich_table",d); await send(env,chat,richBuilderPrompt("table"),richStageKeyboard("table")); }
        else if(target==="table") { d.headers=[]; d.rows=[]; await saveSession(env,user.id,"rich_caption",d); await send(env,chat,richBuilderPrompt("caption"),richStageKeyboard("caption")); }
        else if(target==="caption") { d.richCaption=""; d.richCaptionBold=false; await saveSession(env,user.id,"rich_buttons",d); await send(env,chat,richBuilderPrompt("buttons"),richStageKeyboard("buttons")); }
        else if(target==="buttons") { d.richButtons=[]; await saveSession(env,user.id,"rich_preview",d); await showSimpleRichPreview(env,chat,cb.message.message_id,d); }
        return;
      }
      if(action==="title" && ["bold","normal"].includes(p[2])) {
        const d={...session.data,richTitleBold:p[2]==="bold"}; await saveSession(env,user.id,"rich_table",d); await send(env,chat,richBuilderPrompt("table"),richStageKeyboard("table")); return;
      }
      if(action==="caption" && ["bold","normal"].includes(p[2])) {
        const d={...session.data,richCaptionBold:p[2]==="bold"}; await saveSession(env,user.id,"rich_buttons",d); await send(env,chat,richBuilderPrompt("buttons"),richStageKeyboard("buttons")); return;
      }
    }

    if(data.startsWith("builder:")) {
      const action=data.split(":")[1];
      if(action==="table") {
        await startSimpleRichBuilder(env,chat,user.id);
      } else if(["ranking","stats","custom"].includes(action)) {
        await saveSession(env,user.id,"waiting_data",{kind:action,advanced:false});
        await send(env,chat,"<b>"+TITLES[action]+"</b>\n\nداده‌ها را با | جدا کن:\n\n<code>بازیکن | امتیاز | برد\nعلی | 1250 | 18\nمهدی | 1180 | 16</code>");
      } else if(action==="advanced") {
        await saveSession(env,user.id,"waiting_data",{kind:"table",advanced:true});
        await send(env,chat,"✨ <b>پیام پیشرفته</b>\n\nداده‌های جدول را با | جدا کن یا یک فایل CSV/TXT/XLSX بفرست.");
      } else if(action==="style") {
        await send(env,chat,"🎨 <b>قالب پیام</b>\n\nیک سبک را انتخاب کن:",{inline_keyboard:[
          [{text:"📦 کلاسیک",callback_data:"style:classic"},{text:"✨ تمیز",callback_data:"style:clean"}],
          [{text:"🏆 مسابقاتی",callback_data:"style:competition"}],
          [{text:"↩️ بازگشت",callback_data:"builder:preview"}]
        ]});
      } else if(action==="blocks" && session) {
        const layout=normalizeLayout(session.data.layout,session.data.kind);
        const rows=layout.map((b:any,i)=>[{text:(i+1)+" · "+({header:"🏷 سربرگ",text:"📝 متن",table:"📊 جدول",stats:"📈 آمار",highlight:"⭐ برجسته",separator:"➖ جداکننده",footer:"📌 پاورقی"}[b.type]||"بخش"),callback_data:"adv:edit:"+i},{text:"⬆️",callback_data:"adv:up:"+i},{text:"⬇️",callback_data:"adv:down:"+i},{text:"🗑",callback_data:"adv:delete:"+i}]);
        layout.forEach((b:any,i)=>{ if(b.type==="header"||b.type==="table"||b.type==="footer") rows[i].pop(); });
        rows.push([{text:"➕ متن",callback_data:"adv:add:text"},{text:"📈 آمار",callback_data:"adv:add:stats"}],[{text:"⭐ برجسته",callback_data:"adv:add:highlight"},{text:"➖ جداکننده",callback_data:"adv:add:separator"}],[{text:"👁 پیش‌نمایش",callback_data:"builder:preview"}]);
        await edit(env,chat,cb.message.message_id,"🧩 <b>مدیریت بخش‌ها</b>",{inline_keyboard:rows});
      } else if(action==="preview" && session) await showPreview(env,chat,cb.message.message_id,session.data);
      else if(action==="publish" && session) {
        const d=session.data;
        if(d.richBuilder) {
          const rich=buildSimpleRichMessage(d);
          if(!rich.blocks.length) { await answer(env,id,"حداقل یک بخش از پیام را اضافه کن.",true); return; }
          await clearSession(env,user.id); await sendRichMessage(env,chat,rich,richBuilderButtons(d)); await send(env,chat,"📤 پیام نهایی آماده شد.",mainKeyboard());
        } else {
          const rich_message=buildRichMessage(getMessageLayout(d),d.headers,d.rows,{style:d.style,showIndex:d.showIndex,align:d.align,kind:d.kind});
          await clearSession(env,user.id); await sendRichMessage(env,chat,rich_message); await send(env,chat,"📤 پیام بالا آماده فوروارد است.",mainKeyboard());
        }
            } else if(action==="cancel") { await clearSession(env,user.id); await edit(env,chat,cb.message.message_id,"❌ ساخت پیام لغو شد.",mainKeyboard()); }
      return;
    }
    if(data.startsWith("adv:") && session) {
      const p=data.split(":"); const action=p[1]; const layout=normalizeLayout(session.data.layout,session.data.kind);
      if(action==="add" && p[2]) {
        const defaults:any={text:{type:"text",text:"متن جدید"},stats:{type:"stats",items:[{label:"تعداد",value:"{{count}}"}]},highlight:{type:"highlight",title:"نکته مهم",text:""},separator:{type:"separator"}};
        if(defaults[p[2]]) layout.push(defaults[p[2]]);
        await saveSession(env,user.id,session.state,{...session.data,layout});
        await send(env,chat,"✅ بخش اضافه شد."); return;
      }
      if(["up","down","delete"].includes(action)) {
        const i=Number(p[2]);
        if(action==="up"&&i>0)[layout[i-1],layout[i]]=[layout[i],layout[i-1]];
        if(action==="down"&&i<layout.length-1)[layout[i+1],layout[i]]=[layout[i],layout[i+1]];
        if(action==="delete"&&!["header","table","footer"].includes((layout[i] as any)?.type))layout.splice(i,1);
        await saveSession(env,user.id,session.state,{...session.data,layout});
        await send(env,chat,"✅ تغییر اعمال شد."); return;
      }
      if(action==="edit") {
        const i=Number(p[2]); await saveSession(env,user.id,"advanced_edit",{...session.data,advIndex:i});
        await send(env,chat,"📝 بخش را چگونه ویرایش می‌کنی؟ برای سربرگ/برجسته یا متن، مقدار جدید را بفرست. برای آمار، هر خط «عنوان | مقدار» باشد."); return;
      }
      if(action==="field") {
        const i=Number(p[2]); const field=p[3]; await saveSession(env,user.id,"advanced_edit",{...session.data,advIndex:i,advField:field});
        await send(env,chat,"📝 مقدار جدید را بفرست."); return;
      }
    }
    if(data==="templates:list") {
      const list=await env.DB.prepare("SELECT id,name,kind FROM templates WHERE telegram_id=? ORDER BY created_at DESC").bind(user.id).all<any>();
      const rows=(list.results||[]).map((t:any)=>[{text:"🚀 "+t.name,callback_data:"template:use:"+t.id},{text:"🗑",callback_data:"template:delete:"+t.id}]);
      rows.push([{text:"↩️ بازگشت",callback_data:"home"}]);
      await edit(env,chat,cb.message.message_id,"📚 <b>قالب‌های من</b>\n\nیک قالب را انتخاب کن.",{inline_keyboard:rows.length>1?rows:[[ {text:"↩️ بازگشت",callback_data:"home"} ]]}); return;
    }
    if(data==="home") { await edit(env,chat,cb.message.message_id,"🏠 <b>Reach</b>\n\nچه چیزی می‌سازی؟",mainKeyboard()); return; }
    if(data==="templates:save" && session) {
      await saveSession(env,user.id,"template_name",session.data);
      await send(env,chat,"💾 نام قالب را بفرست."); return;
    }
    if(data.startsWith("template:use:")) {
      const id=Number(data.split(":")[2]); const t=await env.DB.prepare("SELECT * FROM templates WHERE id=? AND telegram_id=?").bind(id,user.id).first<any>();
      if(!t) return;
      const config=JSON.parse(t.config_json);
      if(config.richBuilder) {
        const d={...config,templateId:id,richBuilder:true,headers:[],rows:[],richButtons:config.richButtons??[]};
        await saveSession(env,user.id,"rich_table",d);
        await send(env,chat,"🚀 قالب <b>"+esc(t.name)+"</b> آماده است. داده‌های جدول جدید رو بفرست یا «بدون جدول» رو انتخاب کن.",richStageKeyboard("table"));
      } else {
        await saveSession(env,user.id,"waiting_data",{...config,templateId:id,advanced:Boolean(config.advanced||config.layout)});
        await send(env,chat,"🚀 قالب <b>"+esc(t.name)+"</b> آماده است. داده‌های جدید را بفرست.");
      }
      return;
    }
    if(data.startsWith("template:delete:")) {
      await env.DB.prepare("DELETE FROM templates WHERE id=? AND telegram_id=?").bind(Number(data.split(":")[2]),user.id).run();
      await send(env,chat,"🗑 قالب حذف شد."); return;
    }
    if(data==="file:upload") { await send(env,chat,"📥 فایل CSV، TXT یا XLSX را ارسال کن."); return; }
  }

  if(message) {
    const session=await getSession(env,user.id);
    if(message.text==="/start") { await send(env,chat,"🏠 <b>به Reach خوش اومدی</b>\n\nپیام‌های حرفه‌ای و قابل فوروارد بساز.",mainKeyboard()); return; }
    if(session?.state==="template_name" && message.text) {
      const name=message.text.trim().slice(0,80);
      if(!name) return send(env,chat,"⚠️ نام قالب نمی‌تواند خالی باشد.");
      const cfg={...session.data,layout:session.data.layout??null};
      await env.DB.prepare("INSERT INTO templates(telegram_id,name,kind,config_json) VALUES(?,?,?,?) ON CONFLICT(telegram_id,name) DO UPDATE SET kind=excluded.kind,config_json=excluded.config_json").bind(user.id,name,cfg.kind??"table",JSON.stringify(cfg)).run();
      await saveSession(env,user.id,"preview",session.data); await send(env,chat,"✅ قالب <b>"+esc(name)+"</b> ذخیره شد.",mainKeyboard()); return;
    }
    if(message.document) {
      try {
        const file=await tg(env,"getFile",{file_id:message.document.file_id}) as any;
        const path=file.result.file_path;
        const raw=await (await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${path}`)).arrayBuffer();
        let table;
        const name=(message.document.file_name||"").toLowerCase();
        if(name.endsWith(".xlsx")||name.endsWith(".xls")){
          const wb=XLSX.read(new Uint8Array(raw),{type:"array"});
          const sheet=wb.Sheets[wb.SheetNames[0]];
          const matrix=XLSX.utils.sheet_to_json<any[]>(sheet,{header:1,defval:""});
          const rows=matrix.map(r=>r.map(x=>String(x??"").trim())).filter(r=>r.some(Boolean));
          if(rows.length<2) throw new Error("فایل شیت داده کافی ندارد.");
          table={headers:rows[0],rows:rows.slice(1).map(r=>{const x=[...r];while(x.length<table.headers.length)x.push("");return x.slice(0,table.headers.length);})};
        } else {
          const text=new TextDecoder("utf-8").decode(raw);
          table=parseDelimited(text);
        }
        const d={...(session?.data??{kind:"table",advanced:false}),...table,style:session?.data.style??"classic",showIndex:session?.data.showIndex??false,align:session?.data.align??"left",title:session?.data.title??TITLES[session?.data.kind??"table"],subtitle:session?.data.subtitle??"",footer:session?.data.footer??"",layout:session?.data.layout??defaultLayout(session?.data.kind??"table")};
        await saveSession(env,user.id,"preview",d); await sendRichMessage(env,chat,buildRichMessage(getMessageLayout(d),d.headers,d.rows,{style:d.style,showIndex:d.showIndex,align:d.align,kind:d.kind}),previewKeyboard(Boolean(d.advanced)));
      } catch(e:any) { await send(env,chat,"⚠️ فایل قابل پردازش نیست. "+esc(e?.message||"خطای ناشناخته")); }
      return;
    }
    if(session?.state==="rich_title" && message.text) {
      const value=message.text.trim(); const d={...session.data,richTitle:value==="-"?"":value};
      if(!d.richTitle) { d.richTitleBold=false; await saveSession(env,user.id,"rich_table",d); await send(env,chat,richBuilderPrompt("table"),richStageKeyboard("table")); }
      else { await saveSession(env,user.id,"rich_title_style",d); await send(env,chat,"🎨 عنوان رو چطور نمایش بدیم؟",richStageKeyboard("title_style")); }
      return;
    }
    if(session?.state==="rich_table" && message.text) {
      try { const table=parseTable(message.text.trim()); const d={...session.data,...table}; await saveSession(env,user.id,"rich_caption",d); await send(env,chat,richBuilderPrompt("caption"),richStageKeyboard("caption")); }
      catch(e:any) { await send(env,chat,"⚠️ "+esc(e?.message||"ساخت جدول ناموفق بود.")+"\n\nاگر جدول نمی‌خوای، «بدون جدول» رو بزن.",richStageKeyboard("table")); }
      return;
    }
    if(session?.state==="rich_caption" && message.text) {
      const value=message.text.trim(); const d={...session.data,richCaption:value==="-"?"":value};
      if(!d.richCaption) { d.richCaptionBold=false; await saveSession(env,user.id,"rich_buttons",d); await send(env,chat,richBuilderPrompt("buttons"),richStageKeyboard("buttons")); }
      else { await saveSession(env,user.id,"rich_caption_style",d); await send(env,chat,"🎨 توضیحات رو چطور نمایش بدیم؟",richStageKeyboard("caption_style")); }
      return;
    }
    if(session?.state==="rich_button_url" && message.text) {
      const url=message.text.trim();
      const buttonText=String(session.data.richButtonDraftText||"").trim();
      if(!buttonText) {
        await saveSession(env,user.id,"rich_buttons",{...session.data,richButtonDraftText:""});
        await send(env,chat,"🏷 عنوان دکمه رو بفرست.",richStageKeyboard("buttons"));
        return;
      }
      if(!url || !/^(https?:\/\/|tg:\/\/)/i.test(url)) {
        await send(env,chat,"⚠️ لینک معتبر نیست. لینک باید با <code>https://</code>، <code>http://</code> یا <code>tg://</code> شروع بشه.\n\nمثلاً: <code>https://example.com</code>",richStageKeyboard("buttons"));
        return;
      }
      const current=Array.isArray(session.data.richButtons) ? session.data.richButtons : [];
      if(current.length>=8) {
        await send(env,chat,"⚠️ حداکثر ۸ دکمه می‌تونی اضافه کنی.");
        return;
      }
      const d={...session.data,richButtons:[...current,{text:buttonText.slice(0,64),url,style:"primary"}],richButtonDraftText:""};
      await saveSession(env,user.id,"rich_preview",d);
      await showSimpleRichPreview(env,chat,message.message_id,d);
      return;
    }

    if(session?.state==="rich_buttons" && message.text) {
      const lines=message.text.split(/\r?\n/).map((x:string)=>x.trim()).filter(Boolean);
      if(lines.length>8) { await send(env,chat,"⚠️ حداکثر ۸ دکمه می‌تونی اضافه کنی.",richStageKeyboard("buttons")); return; }
      if(lines.length===1 && lines[0]==="-") {
        const d={...session.data,richButtons:[],richButtonDraftText:""}; await saveSession(env,user.id,"rich_preview",d); await showSimpleRichPreview(env,chat,message.message_id,d); return;
      }
      const buttons:any[]=[];
      for(const line of lines) {
        const parts=line.split("|").map((x:string)=>x.trim());
        if(parts.length===1) {
          const buttonText=parts[0];
          if(!buttonText) {
            await send(env,chat,"⚠️ عنوان دکمه نمی‌تونه خالی باشه.",richStageKeyboard("buttons"));
            return;
          }
          if((session.data.richButtons??[]).length + 1 > 8) {
            await send(env,chat,"⚠️ حداکثر ۸ دکمه می‌تونی اضافه کنی.",richStageKeyboard("buttons"));
            return;
          }
          await saveSession(env,user.id,"rich_button_url",{...session.data,richButtonDraftText:buttonText});
          await send(env,chat,"🔗 <b>لینک دکمه</b>\n\nحالا لینک این دکمه رو بفرست.\nمثلاً: <code>https://example.com</code>",richStageKeyboard("buttons"));
          return;
        }
        const text=parts.shift()||"";
        const url=parts.join("|").trim();
        if(!text || !url || !/^(https?:\/\/|tg:\/\/)/i.test(url)) {
          await send(env,chat,"⚠️ فرمت دکمه درست نیست. هر خط باید این شکلی باشه:\n<code>متن دکمه | https://example.com</code>",richStageKeyboard("buttons"));
          return;
        }
        buttons.push({text:text.slice(0,64),url,style:"primary"});
      }
      const current=Array.isArray(session.data.richButtons) ? session.data.richButtons : [];
      if(current.length + buttons.length > 8) {
        await send(env,chat,"⚠️ حداکثر ۸ دکمه می‌تونی اضافه کنی.",richStageKeyboard("buttons"));
        return;
      }
      const d={...session.data,richButtons:[...current,...buttons],richButtonDraftText:""};
      await saveSession(env,user.id,"rich_preview",d);
      await showSimpleRichPreview(env,chat,message.message_id,d);
      return;
    }

    if(session?.state==="waiting_data" && message.text) {
      try {
        const table=parseTable(message.text);
        const template=session.data;
        const d={...template,...table,style:template.style??"classic",showIndex:template.showIndex??(template.kind==="ranking"),align:template.align??"left",title:template.title??TITLES[template.kind??"table"],subtitle:template.subtitle??"",footer:template.footer??"",layout:template.layout?legacyLayout(template,template.kind):defaultLayout(template.kind)};
        await saveSession(env,user.id,"preview",d); await sendRichMessage(env,chat,buildRichMessage(getMessageLayout(d),d.headers,d.rows,{style:d.style,showIndex:d.showIndex,align:d.align,kind:d.kind}),previewKeyboard(Boolean(d.advanced)));
      } catch(e:any) { await send(env,chat,"⚠️ "+esc(e.message)); }
      return;
    }
    if(session?.state==="advanced_edit" && message.text) {
      const d=session.data; const layout=normalizeLayout(d.layout,d.kind); const i=Number(d.advIndex); const b:any=layout[i]; const value=message.text.trim();
      if(!b) return send(env,chat,"⚠️ بخش پیدا نشد.");
      if(b.type==="stats"){ b.items=value.split(/\r?\n/).map(line=>{const [label,...rest]=line.split("|");return {label:(label||"").trim(),value:rest.join("|").trim()};}).filter(x=>x.label); }
      else if(b.type==="header"){ b.title=value==="-"?"":value; }
      else if(b.type==="footer"||b.type==="text"){ b.text=value==="-"?"":value; }
      else if(b.type==="highlight"){ b.text=value==="-"?"":value; }
      await saveSession(env,user.id,"preview",{...d,layout}); await send(env,chat,"✅ بخش به‌روزرسانی شد.",previewKeyboard(true)); return;
    }
  }
}

export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    const url=new URL(request.url);
    if(request.method==="GET" && url.pathname==="/diagnostic") {
      const requestId=crypto.randomUUID();
      const timestamp=new Date().toISOString();
      await runtimeLog(env,"info","DIAGNOSTIC_REQUEST",{
        request_id:requestId,
        method:request.method,
        pathname:url.pathname,
        timestamp
      });
      return Response.json({
        ok:true,
        service:"reach",
        diagnostic:true,
        request_id:requestId,
        timestamp
      });
    }
    if(request.method==="GET" && url.pathname==="/logs") {
      if(!diagnosticAuthorized(request,env,url)) {
        return new Response(logsLoginHtml(),{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
      }
      const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||"100"),1),500);
      let rows:any[]=[];
      try {
        rows=(await env.DB.prepare("SELECT id,level,event,data_json,created_at FROM runtime_logs ORDER BY id DESC LIMIT ?").bind(limit).all<any>()).results || [];
      } catch(error) {
        return new Response(logsLoginHtml("جدول runtime_logs در D1 در دسترس نیست یا migration هنوز روی دیتابیس متصل به Worker اعمال نشده است."),{status:500,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
      }
      if(url.searchParams.get("format")==="json") {
        return Response.json({ok:true,count:rows.length,logs:rows},{headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
      }
      return new Response(logsHtml(rows,url.searchParams.get("token")||""),{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
    }
    if(request.method==="POST" && url.pathname==="/logs") {
      const form=await request.formData();
      const token=String(form.get("token")||"");
      if(!token || token!==env.DIAGNOSTIC_SECRET) {
        return new Response(logsLoginHtml("Secret واردشده صحیح نیست."),{status:401,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
      }
      const limit=100;
      let rows:any[]=[];
      try {
        rows=(await env.DB.prepare("SELECT id,level,event,data_json,created_at FROM runtime_logs ORDER BY id DESC LIMIT ?").bind(limit).all<any>()).results || [];
      } catch(error) {
        return new Response(logsLoginHtml("جدول runtime_logs در D1 در دسترس نیست یا migration هنوز روی دیتابیس متصل به Worker اعمال نشده است."),{status:500,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
      }
      return new Response(logsHtml(rows,token),{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
    }
    if(request.method==="POST" && url.pathname==="/admin/set-webhook") {
      const diagnosticSecret=request.headers.get("X-Diagnostic-Secret");
      if(!env.DIAGNOSTIC_SECRET || diagnosticSecret!==env.DIAGNOSTIC_SECRET) {
        await runtimeLog(env,"warn","WEBHOOK_SETUP_REJECTED",{reason:"invalid_diagnostic_secret"});
        return Response.json({ok:false,error:"Unauthorized"},{status:401});
      }
      try {
        const webhookUrl=new URL("/webhook",request.url).toString();
        const result=await tg(env,"setWebhook",{
          url:webhookUrl,
          secret_token:env.WEBHOOK_SECRET,
          drop_pending_updates:true
        });
        const info=await tg(env,"getWebhookInfo");
        const configured=info.result?.url===webhookUrl;
        await runtimeLog(env,"info","WEBHOOK_CONFIGURED",{
          url:webhookUrl,
          verified:configured,
          pending_update_count:info.result?.pending_update_count ?? 0
        });
        return Response.json({
          ok:configured,
          webhook_url:webhookUrl,
          verified:configured,
          pending_update_count:info.result?.pending_update_count ?? 0,
          last_error_message:info.result?.last_error_message ?? null
        });
      } catch(error) {
        await runtimeLog(env,"error","WEBHOOK_SETUP_ERROR",{
          message:error instanceof Error ? error.message : String(error)
        });
        return Response.json({ok:false,error:error instanceof Error ? error.message : String(error)},{status:502});
      }
    }
    if(request.method==="GET" && url.pathname==="/health") {
      let dbOk=false;
      try {
        await env.DB.prepare("SELECT 1 AS ok").first();
        dbOk=true;
      } catch (error) {
        console.error("health database check failed", error);
      }
      let runtimeLogsTable=false;
      try {
        await env.DB.prepare("SELECT 1 FROM runtime_logs LIMIT 1").first();
        runtimeLogsTable=true;
      } catch (error) {
        console.error("health runtime_logs check failed", error);
      }
      return Response.json({
        ok: dbOk && runtimeLogsTable && Boolean(env.BOT_TOKEN) && Boolean(env.WEBHOOK_SECRET) && Boolean(env.DIAGNOSTIC_SECRET),
        service:"reach",
        runtime:"cloudflare-workers",
        config:{
          botToken:Boolean(env.BOT_TOKEN),
          webhookSecret:Boolean(env.WEBHOOK_SECRET),
          diagnosticSecret:Boolean(env.DIAGNOSTIC_SECRET),
          database:dbOk,
          runtimeLogsTable
        }
      });
    }
    if(request.method==="POST" && url.pathname==="/webhook") {
      const secret=request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if(!secret || secret!==env.WEBHOOK_SECRET) {
        await runtimeLog(env,"warn","WEBHOOK_REJECTED",{reason:"invalid_secret",has_secret:Boolean(secret)});
        console.warn("telegram webhook rejected",{reason:"invalid_secret",has_secret:Boolean(secret)});
        return new Response("Unauthorized",{status:401});
      }
      try {
        const update=await request.json();
        await runtimeLog(env,"info","WEBHOOK_RECEIVED", {
          update_id:update?.update_id,
          type:update?.message ? "message" : update?.callback_query ? "callback_query" : "other",
          chat_id:update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id
        });
        await handleUpdate(env,update);
        await runtimeLog(env,"info","UPDATE_HANDLED", { update_id:update?.update_id });
      } catch (error) {
        await runtimeLog(env,"error","WEBHOOK_HANDLER_ERROR",{message:error instanceof Error ? error.message : String(error)});
        console.error("telegram webhook handler failed", error);
      }
      return new Response("ok");
    }
    return new Response("Reach Worker");
  }
};