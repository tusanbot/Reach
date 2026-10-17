import * as XLSX from "xlsx";
import { Lang, LANGS, normalizeLang, tr } from "./i18n";

interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  DIAGNOSTIC_SECRET: string;
  ENVIRONMENT?: string;
  ADMIN_USER_IDS?: string;
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
const OWNER_ID = 7918162941;
function adminIds(env:Env) { return new Set([OWNER_ID,...String(env.ADMIN_USER_IDS||"").split(",").map(x=>Number(x.trim())).filter(Number.isFinite)]); }
function isAdmin(env:Env,id:number) { return adminIds(env).has(id); }
async function getLang(env:Env,id:number):Promise<Lang> { const row=await env.DB.prepare("SELECT language FROM users WHERE telegram_id=?").bind(id).first<any>(); return normalizeLang(row?.language); }
async function setLang(env:Env,id:number,lang:Lang) { await env.DB.prepare("UPDATE users SET language=?,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?").bind(lang,id).run(); }
function settingsKeyboard(lang:Lang) { return {inline_keyboard:[[{text:tr(lang,"language"),callback_data:"settings:language"}],[{text:tr(lang,"support"),callback_data:"support:start"}],[{text:tr(lang,"back"),callback_data:"home"}]]}; }
function languageKeyboard(lang:Lang) { return {inline_keyboard:[[{text:"🇮🇷 فارسی",callback_data:"settings:setlang:fa"}],[{text:"🇬🇧 English",callback_data:"settings:setlang:en"}],[{text:"🇸🇦 العربية",callback_data:"settings:setlang:ar"}],[{text:tr(lang,"back"),callback_data:"settings"}]]}; }
function adminKeyboard(lang:Lang) { return {inline_keyboard:[[{text:tr(lang,"broadcast"),callback_data:"admin:broadcast"}],[{text:tr(lang,"back"),callback_data:"home"}]]}; }


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
<meta name="viewport" content="width=device-width,initial-scale=1"><title>جدول ساز · ورود به لاگ‌ها</title>
<style>:root{color-scheme:dark}body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:520px;margin:10vh auto;padding:24px}.card{background:#111827;border:1px solid #334155;border-radius:16px;padding:24px}
h1{margin-top:0}.sub{color:#94a3b8;line-height:1.8}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #475569;border-radius:10px;background:#020617;color:#fff;margin:14px 0}
button{width:100%;padding:12px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:15px;cursor:pointer}.error{color:#fca5a5;margin-bottom:10px}
code{direction:ltr;display:block;text-align:left;background:#020617;padding:8px;border-radius:8px}</style></head><body><main><div class="card">
<h1>🔐 لاگ‌های جدول ساز</h1><p class="sub">برای مشاهده لاگ‌های runtime، مقدار <code>DIAGNOSTIC_SECRET</code> را وارد کن.</p>
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
<title>جدول ساز · Runtime Logs</title>
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
<div class="top"><div><h1>🧾 لاگ‌های جدول ساز</h1><div class="sub">آخرین ۱۰۰ رویداد · بروزرسانی خودکار هر ۱۰ ثانیه</div></div>
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
    else if(b.type==="photo" || b.type==="video") out.push((b.type==="photo"?"🖼 ":"🎬 ")+`<a href="${esc(b.url)}">${esc(b.caption||b.url)}</a>`);
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

function mainKeyboard(lang:Lang="fa",admin=false) {
  const rows=[
    [{text:tr(lang,"table"),callback_data:"builder:table"},{text:tr(lang,"ranking"),callback_data:"builder:ranking"}],
    [{text:tr(lang,"stats"),callback_data:"builder:stats"},{text:tr(lang,"custom"),callback_data:"builder:custom"}],
    [{text:tr(lang,"advanced"),callback_data:"builder:advanced"}],
    [{text:tr(lang,"file"),callback_data:"file:upload"},{text:tr(lang,"templates"),callback_data:"templates:list"}],
    [{text:"⚙️ "+tr(lang,"settings").replace(/<[^>]+>/g,""),callback_data:"settings"},{text:"ℹ️ "+tr(lang,"help").replace(/<[^>]+>/g,""),callback_data:"help"}]
  ];
  if(admin) rows.push([{text:tr(lang,"admin"),callback_data:"admin"}]);
  return {inline_keyboard:rows};
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
  const items=Array.isArray(data.richItems) ? data.richItems : [
    ...(data.richTitle ? [{type:"heading",text:data.richTitle,bold:data.richTitleBold}] : []),
    ...(Array.isArray(data.headers)&&data.headers.length&&Array.isArray(data.rows)&&data.rows.length ? [{type:"table",headers:data.headers,rows:data.rows,caption:data.richCaption,bold:data.richCaptionBold}] : []),
    ...(data.richCaption&&!data.headers?.length ? [{type:"text",text:data.richCaption,bold:data.richCaptionBold}] : []),
    ...((data.richButtons??[]).length ? [{type:"buttons",buttons:data.richButtons}] : [])
  ];
  for(const item of items){
    if(item.type==="heading" && String(item.text??"").trim()) blocks.push({type:"heading",size:2,text:richText(String(item.text).trim(),Boolean(item.bold))});
    else if((item.type==="text"||item.type==="caption") && String(item.text??"").trim()) blocks.push({type:"paragraph",text:richText(String(item.text).trim(),Boolean(item.bold))});
    else if(item.type==="quote" && String(item.text??"").trim()) blocks.push({type:"blockquote",blocks:[{type:"paragraph",text:String(item.text).trim()}]});
    else if(item.type==="divider") blocks.push({type:"divider"});
    else if(item.type==="table" && Array.isArray(item.headers) && item.headers.length && Array.isArray(item.rows)){
      const cells=[item.headers,...item.rows].map((row:any[],rowIndex:number)=>row.map((cell:any)=>({text:String(cell??""),is_header:rowIndex===0,align:data.align==="center"?"center":data.align==="right"?"right":"left",valign:"middle"})));
      const table:any={type:"table",cells,is_bordered:true,is_striped:true,is_compact:false};
      if(String(item.caption??"").trim()) table.caption=richText(String(item.caption).trim(),Boolean(item.bold));
      blocks.push(table);
    } else if((item.type==="photo"||item.type==="video") && /^https?:\/\//i.test(String(item.url??""))){
      const media={type:item.type,media:String(item.url).trim()};
      blocks.push(item.type==="photo" ? {type:"photo",photo:media,...(item.caption?{caption:{text:String(item.caption)}}:{})} : {type:"video",video:media,...(item.caption?{caption:{text:String(item.caption)}}:{})});
    } else if(item.type==="buttons"){
      const buttons=(item.buttons??[]).filter((b:any)=>b?.text&&b?.url);
      for(let i=0;i<buttons.length;i+=8) blocks.push({type:"buttons",buttons:buttons.slice(i,i+8).map((b:any)=>({text:String(b.text).slice(0,64),style:["danger","success","primary","link"].includes(b.style)?b.style:"primary",url:String(b.url)})),align:"center"});
    }
  }
  return {blocks,is_rtl:true};
}
function richBuilderKeyboard(data:any={}) {
  const items=Array.isArray(data.richItems)?data.richItems:[];
  const rows:any[]=[
    [{text:"🏷 افزودن تیتر",callback_data:"richv2:add:heading"},{text:"📝 افزودن متن",callback_data:"richv2:add:text"}],
    [{text:"📊 افزودن جدول",callback_data:"richv2:add:table"},{text:"💬 کپشن مستقل",callback_data:"richv2:add:caption"}],
    [{text:"🖼 افزودن عکس",callback_data:"richv2:add:photo"},{text:"🎬 افزودن ویدیو",callback_data:"richv2:add:video"}],
    [{text:"❝ نقل‌قول",callback_data:"richv2:add:quote"},{text:"➖ جداکننده",callback_data:"richv2:add:divider"}],
    [{text:"🔘 افزودن دکمه‌ها",callback_data:"richv2:add:buttons"}]
  ];
  if(items.length) rows.push([{text:"↕️ جابه‌جایی و مدیریت آیتم‌ها ("+items.length+")",callback_data:"richv2:manage"}]);
  rows.push([{text:"👁 ایجاد پیش‌نمایش پیام",callback_data:"richv2:preview"}],[{text:"🏷 ویرایش عنوان پیام",callback_data:"richv2:title"},{text:"❌ لغو",callback_data:"rich:cancel"}]);
  return {inline_keyboard:rows};
}
function richItemsKeyboard(data:any) {
  const items=Array.isArray(data.richItems)?data.richItems:[];
  const labels:any={heading:"🏷 تیتر",text:"📝 متن",table:"📊 جدول",caption:"💬 کپشن",photo:"🖼 عکس",video:"🎬 ویدیو",quote:"❝ نقل‌قول",divider:"➖ جداکننده",buttons:"🔘 دکمه‌ها"};
  const rows:any[]=items.map((item:any,i:number)=>[
    {text:(i+1)+". "+(labels[item.type]||"آیتم"),callback_data:"richv2:actions:"+i},
    {text:"⬆️",callback_data:"richv2:up:"+i},{text:"⬇️",callback_data:"richv2:down:"+i}
  ]);
  rows.push([{text:"↩️ بازگشت به ویرایشگر",callback_data:"richv2:editor"}]);
  return {inline_keyboard:rows};
}
function richItemActionsKeyboard(index:number) {
  return {inline_keyboard:[
    [{text:"⬆️ رفت به بالا",callback_data:"richv2:up:"+index},{text:"⬇️ رفت به پایین",callback_data:"richv2:down:"+index}],
    [{text:"⏫ رفت به اولین",callback_data:"richv2:top:"+index},{text:"⏬ رفت به آخرین",callback_data:"richv2:bottom:"+index}],
    [{text:"✏️ ویرایش",callback_data:"richv2:edit:"+index},{text:"🗑 حذف",callback_data:"richv2:delete:"+index}],
    [{text:"↩️ فهرست آیتم‌ها",callback_data:"richv2:manage"}]
  ]};
}
function richPreviewKeyboard() {
  return {inline_keyboard:[
    [{text:"✅ تأیید و ساخت پیام",callback_data:"richv2:publish"}],
    [{text:"↩️ بازگشت به ویرایشگر",callback_data:"richv2:editor"},{text:"↕️ ترتیب آیتم‌ها",callback_data:"richv2:manage"}],
    [{text:"❌ لغو",callback_data:"rich:cancel"}]
  ]};
}
function richStageKeyboard(stage:string) {
  return {inline_keyboard:stage==="title" ? [[{text:"⏭️ بدون عنوان",callback_data:"rich:skip:title"}],[{text:"❌ لغو",callback_data:"rich:cancel"}]] : [[{text:"↩️ بازگشت به ویرایشگر",callback_data:"richv2:editor"},{text:"❌ لغو",callback_data:"rich:cancel"}]]};
}
function richBuilderPrompt(stage:string) {
  const p:any={
    title:"🏷 <b>عنوان پیام</b>\n\nعنوان اصلی پیام را بفرست؛ اگر نمی‌خواهی عنوان داشته باشد، «-» بفرست.",
    table:"📊 <b>ساخت جدول</b>\n\nخط اول نام ستون‌هاست و ستون‌ها را با | جدا کن.\n<code>بازیکن | امتیاز | برد\nعلی | 1250 | 18\nمهدی | 1180 | 16</code>",
    caption:"💬 <b>کپشن جدول</b>\n\nمتن کپشن زیر جدول را بفرست؛ برای رد کردن «-» بفرست.",
    buttons:"🔘 <b>دکمه‌ها</b>\n\nهر دکمه را در یک خط با قالب <code>عنوان | https://example.com</code> بفرست.",
    photo:"🖼 <b>افزودن عکس</b>\n\nلینک مستقیم HTTPS عکس را بفرست؛ در صورت نیاز کپشن را بعد از | اضافه کن.\n<code>https://example.com/photo.jpg | توضیح عکس</code>",
    video:"🎬 <b>افزودن ویدیو</b>\n\nلینک مستقیم HTTPS ویدیو را بفرست؛ در صورت نیاز کپشن را بعد از | اضافه کن.\n<code>https://example.com/video.mp4 | توضیح ویدیو</code>",
    heading:"🏷 <b>افزودن تیتر</b>\n\nمتن تیتر را بفرست.",text:"📝 <b>افزودن متن</b>\n\nمتن را بفرست.",quote:"❝ <b>افزودن نقل‌قول</b>\n\nمتن نقل‌قول را بفرست."
  };
  return p[stage]||"محتوای آیتم را بفرست.";
}
async function startSimpleRichBuilder(env:Env,chat:number,userId:number) {
  await saveSession(env,userId,"rich_title",{kind:"table",advanced:false,richBuilder:true,richTitle:"",richTitleBold:true,richItems:[],headers:[],rows:[],richCaption:"",richCaptionBold:false,richButtons:[],style:"classic",align:"left"});
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
  if(!rich_message.blocks.length) { await edit(env,chat,message,"⚠️ هنوز محتوایی اضافه نشده است. ابتدا آیتم اضافه کن.",richBuilderKeyboard(data)); return; }
  try { await tg(env,"editMessageText",{chat_id:chat,message_id:message,rich_message,reply_markup:richPreviewKeyboard()}); }
  catch(error) {
    await runtimeLog(env,"warn","RICH_SIMPLE_PREVIEW_FALLBACK",{message:error instanceof Error ? error.message : String(error)});
    await edit(env,chat,message,buildRichFallbackHtml(rich_message),richPreviewKeyboard());
  }
}

async function sendSimpleRichPreview(env:Env,chat:number,data:any) {
  const rich_message=buildSimpleRichMessage(data);
  if(!rich_message.blocks.length) {
    await send(env,chat,"⚠️ هنوز هیچ محتوایی برای پیام انتخاب نکردی.",richBuilderKeyboard());
    return;
  }
  try {
    await tg(env,"sendRichMessage",{chat_id:chat,rich_message,reply_markup:richBuilderKeyboard()});
  } catch(error) {
    await runtimeLog(env,"warn","RICH_SIMPLE_PREVIEW_SEND_FALLBACK",{message:error instanceof Error ? error.message : String(error)});
    await send(env,chat,buildRichFallbackHtml(rich_message),richBuilderKeyboard());
  }
}

async function handleUpdate(env:Env,update:any) {
  const message=update.message;
  const cb=update.callback_query;
  const chat=message?.chat?.id ?? cb?.message?.chat?.id;
  const user=message?.from ?? cb?.from;
  if(!chat || !user) return;
  await upsertUser(env,user);
  const lang=await getLang(env,user.id);
  const admin=isAdmin(env,user.id);

  if(cb) {
    const id=cb.id, data=cb.data||"";
    await answer(env,id);
    const session=await getSession(env,user.id);
    if(data==="settings") { await clearSession(env,user.id); await edit(env,chat,cb.message.message_id,tr(lang,"settings"),settingsKeyboard(lang)); return; }
    if(data==="settings:language") { await edit(env,chat,cb.message.message_id,tr(lang,"chooseLanguage"),languageKeyboard(lang)); return; }
    if(data.startsWith("settings:setlang:")) {
      const selected=normalizeLang(data.split(":")[2]); await setLang(env,user.id,selected);
      const next=selected; await edit(env,chat,cb.message.message_id,tr(next,"languageSaved"),mainKeyboard(next,admin)); return;
    }
    if(data==="support:start") { await saveSession(env,user.id,"support_message",{}); await send(env,chat,tr(lang,"supportPrompt"),{inline_keyboard:[[{text:tr(lang,"cancel"),callback_data:"support:cancel"}]]}); return; }
    if(data==="support:cancel") { await clearSession(env,user.id); await edit(env,chat,cb.message.message_id,tr(lang,"supportCancel"),mainKeyboard(lang,admin)); return; }
    if(data==="admin") {
      if(!admin) { await answer(env,id,tr(lang,"adminOnly"),true); return; }
      await edit(env,chat,cb.message.message_id,"🛠 <b>"+tr(lang,"admin").replace(/<[^>]+>/g,"")+"</b>",adminKeyboard(lang)); return;
    }
    if(data==="admin:broadcast") {
      if(!admin) { await answer(env,id,tr(lang,"adminOnly"),true); return; }
      await saveSession(env,user.id,"admin_broadcast",{}); await send(env,chat,tr(lang,"broadcastPrompt"),{inline_keyboard:[[{text:tr(lang,"cancel"),callback_data:"admin:cancel"}]]}); return;
    }
    if(data==="admin:cancel") { if(admin) { await clearSession(env,user.id); await send(env,chat,tr(lang,"cancel"),adminKeyboard(lang)); } return; }

    if(data==="help") { await send(env,chat,tr(lang,"help"),mainKeyboard(lang,admin)); return; }
    if(data.startsWith("style:") && session) {
      const style=data.split(":")[1];
      if(["classic","clean","competition"].includes(style)) {
        const d={...session.data,style};
        await saveSession(env,user.id,"preview",d);
        await showPreview(env,chat,cb.message.message_id,d);
      }
      return;
    }
    if(data.startsWith("richv2:") && session?.data?.richBuilder) {
      const p=data.split(":"); const action=p[1]; const d={...session.data}; const items=Array.isArray(d.richItems)?[...d.richItems]:[];
      if(action==="editor") { await saveSession(env,user.id,"rich_editor",d); await edit(env,chat,cb.message.message_id,"🧩 <b>ویرایشگر پیام سفارشی</b>\n\nبرای افزودن هر بخش، دکمه‌اش را انتخاب کن. آیتم‌ها به ترتیب اضافه‌شدن در پیام قرار می‌گیرند.",richBuilderKeyboard(d)); return; }
      if(action==="title") { await saveSession(env,user.id,"rich_edit_title",d); await send(env,chat,"🏷 <b>عنوان پیام</b>\n\nعنوان جدید را بفرست؛ برای حذف «-» بفرست.",richStageKeyboard("title")); return; }
      if(action==="add" && p[2]) {
        const type=p[2];
        if(type==="divider") { items.push({type:"divider"}); d.richItems=items; await saveSession(env,user.id,"rich_editor",d); await edit(env,chat,cb.message.message_id,"✅ جداکننده اضافه شد.",richBuilderKeyboard(d)); return; }
        if(!["heading","text","table","caption","photo","video","quote","buttons"].includes(type)) return;
        d.richDraftType=type; delete d.richEditIndex;
        await saveSession(env,user.id,type==="table"?"rich_item_table":type==="buttons"?"rich_item_buttons":"rich_item_input",d);
        await send(env,chat,richBuilderPrompt(type),richStageKeyboard(type)); return;
      }
      if(action==="manage") { await edit(env,chat,cb.message.message_id,"↕️ <b>مدیریت ترتیب آیتم‌ها</b>\n\nهر ردیف یک آیتم است. از فلش‌ها برای جابه‌جایی سریع و از منوی آیتم برای انتقال به ابتدا/انتها، ویرایش یا حذف استفاده کن.",richItemsKeyboard(d)); return; }
      if(action==="actions") { const i=Number(p[2]); if(!items[i]) return; await edit(env,chat,cb.message.message_id,"⚙️ <b>عملیات آیتم "+(i+1)+"</b>",richItemActionsKeyboard(i)); return; }
      if(["up","down","top","bottom","delete"].includes(action)) {
        const i=Number(p[2]); if(!Number.isInteger(i)||i<0||i>=items.length) return;
        const [item]=items.splice(i,1);
        if(action==="up") items.splice(Math.max(0,i-1),0,item);
        else if(action==="down") items.splice(Math.min(items.length,i+1),0,item);
        else if(action==="top") items.unshift(item);
        else if(action==="bottom") items.push(item);
        d.richItems=items; await saveSession(env,user.id,"rich_editor",d);
        await edit(env,chat,cb.message.message_id,action==="delete"?"🗑 آیتم حذف شد.":"✅ ترتیب آیتم‌ها به‌روزرسانی شد.",richItemsKeyboard(d)); return;
      }
      if(action==="edit") {
        const i=Number(p[2]); const item=items[i]; if(!item) return;
        d.richDraftType=item.type; d.richEditIndex=i;
        if(item.type==="divider") { await answer(env,id,"برای جداکننده محتوایی وجود ندارد؛ آن را حذف یا جابه‌جا کن.",true); return; }
        await saveSession(env,user.id,item.type==="table"?"rich_item_table":item.type==="buttons"?"rich_item_buttons":"rich_item_input",d);
        await send(env,chat,richBuilderPrompt(item.type),richStageKeyboard(item.type)); return;
      }
      if(action==="preview") { await saveSession(env,user.id,"rich_preview",d); await showSimpleRichPreview(env,chat,cb.message.message_id,d); return; }
      if(action==="publish") {
        const rich=buildSimpleRichMessage(d);
        if(!rich.blocks.length) { await answer(env,id,"حداقل یک آیتم به پیام اضافه کن.",true); return; }
        await clearSession(env,user.id); await sendSimpleRichMessage(env,chat,rich,d); await send(env,chat,"📤 پیام نهایی ساخته شد و آماده فوروارد است.",mainKeyboard(lang,admin)); return;
      }
      return;
    }
    if(data.startsWith("rich:") && session) {
      const p=data.split(":"); const action=p[1];
      if(action==="cancel") { await clearSession(env,user.id); await edit(env,chat,cb.message.message_id,"❌ ساخت پیام لغو شد.",mainKeyboard(lang,admin)); return; }
      if(action==="restart") { await startSimpleRichBuilder(env,chat,user.id); return; }
      if(action==="publish") {
        const d=session.data; const rich=buildSimpleRichMessage(d);
        if(!rich.blocks.length) { await answer(env,id,"حداقل یک بخش از پیام را اضافه کن.",true); return; }
        await clearSession(env,user.id); await sendSimpleRichMessage(env,chat,rich,d); await send(env,chat,"📤 پیام نهایی آماده شد.",mainKeyboard(lang,admin)); return;
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
        if(target==="title") { d.richTitle=""; d.richTitleBold=false; await saveSession(env,user.id,"rich_editor",d); await edit(env,chat,cb.message.message_id,"🧩 <b>ویرایشگر پیام سفارشی</b>",richBuilderKeyboard(d)); }
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
          await clearSession(env,user.id); await sendRichMessage(env,chat,rich,richBuilderButtons(d)); await send(env,chat,"📤 پیام نهایی آماده شد.",mainKeyboard(lang,admin));
        } else {
          const rich_message=buildRichMessage(getMessageLayout(d),d.headers,d.rows,{style:d.style,showIndex:d.showIndex,align:d.align,kind:d.kind});
          await clearSession(env,user.id); await sendRichMessage(env,chat,rich_message); await send(env,chat,"📤 پیام بالا آماده فوروارد است.",mainKeyboard(lang,admin));
        }
            } else if(action==="cancel") { await clearSession(env,user.id); await edit(env,chat,cb.message.message_id,"❌ ساخت پیام لغو شد.",mainKeyboard(lang,admin)); }
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
    if(data==="home") { await edit(env,chat,cb.message.message_id,tr(lang,"home"),mainKeyboard(lang,admin)); return; }
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
    if(message.text==="/start") { await send(env,chat,tr(lang,"welcome"),mainKeyboard(lang,admin)); return; }
    if(session?.state==="support_message") {
      if(message.text && ["لغو","cancel","إلغاء"].includes(message.text.trim().toLowerCase())) { await clearSession(env,user.id); await send(env,chat,tr(lang,"supportCancel"),mainKeyboard(lang,admin)); return; }
      try {
        const info=await send(env,OWNER_ID,
          "🆘 <b>پیام جدید پشتیبانی</b>\n👤 "+esc(message.from?.first_name||"")+" "+(message.from?.username?"@"+esc(message.from.username):"")+
          "\n🆔 <code>"+user.id+"</code>");
        const ownerMessageId=Number(info.result?.message_id||0);
        if(message.message_id) {
          const copied=await tg(env,"copyMessage",{chat_id:OWNER_ID,from_chat_id:chat,message_id:message.message_id});
          const copiedId=Number(copied.result?.message_id||0);
          await env.DB.prepare("INSERT INTO support_messages(user_telegram_id,owner_message_id,user_message_id) VALUES(?,?,?)").bind(user.id,copiedId,message.message_id).run();
        } else {
          await env.DB.prepare("INSERT INTO support_messages(user_telegram_id,owner_message_id,user_message_id) VALUES(?,?,?)").bind(user.id,ownerMessageId,message.message_id??null).run();
        }
        await clearSession(env,user.id); await send(env,chat,tr(lang,"supportSent"),mainKeyboard(lang,admin));
      } catch(error) {
        await runtimeLog(env,"error","SUPPORT_FORWARD_ERROR",{user_id:user.id,message:error instanceof Error?error.message:String(error)});
        await send(env,chat,"⚠️ "+tr(lang,"supportCancel"),mainKeyboard(lang,admin));
      }
      return;
    }
    if(session?.state==="admin_broadcast" && admin && (message.text || message.document || message.photo || message.video || message.audio || message.voice || message.animation)) {
      if(message.text && ["لغو","cancel","إلغاء"].includes(message.text.trim().toLowerCase())) { await clearSession(env,user.id); await send(env,chat,tr(lang,"cancel"),adminKeyboard(lang)); return; }
      const users=(await env.DB.prepare("SELECT telegram_id FROM users WHERE telegram_id<>? ORDER BY telegram_id").bind(OWNER_ID).all<any>()).results||[];
      let sentCount=0, failedCount=0;
      for(let i=0;i<users.length;i+=20) {
        const batch=users.slice(i,i+20);
        const results=await Promise.all(batch.map(async (row:any)=>{
          try {
            await tg(env,"copyMessage",{chat_id:Number(row.telegram_id),from_chat_id:chat,message_id:message.message_id,disable_notification:true});
            return true;
          } catch { return false; }
        }));
        sentCount+=results.filter(Boolean).length; failedCount+=results.length-results.filter(Boolean).length;
        await new Promise(r=>setTimeout(r,700));
      }
      await clearSession(env,user.id);
      await send(env,chat,tr(lang,"broadcastDone")+"\n\n📨 ارسال‌شده: <b>"+sentCount+"</b>\n⚠️ ناموفق: <b>"+failedCount+"</b>",adminKeyboard(lang));
      return;
    }
    if(message.chat?.type==="private" && message.reply_to_message && isAdmin(env,user.id)) {
      const target=await env.DB.prepare("SELECT user_telegram_id FROM support_messages WHERE owner_message_id=? ORDER BY id DESC LIMIT 1").bind(message.reply_to_message.message_id).first<any>();
      if(target?.user_telegram_id) {
        try {
          await tg(env,"copyMessage",{chat_id:Number(target.user_telegram_id),from_chat_id:chat,message_id:message.message_id});
          await send(env,chat,tr(lang,"supportReplySent"),adminKeyboard(lang));
        } catch(error) {
          await send(env,chat,"⚠️ ارسال پاسخ ناموفق بود.",adminKeyboard(lang));
        }
        return;
      }
    }

    if(session?.state==="template_name" && message.text) {
      const name=message.text.trim().slice(0,80);
      if(!name) return send(env,chat,"⚠️ نام قالب نمی‌تواند خالی باشد.");
      const cfg={...session.data,layout:session.data.layout??null};
      await env.DB.prepare("INSERT INTO templates(telegram_id,name,kind,config_json) VALUES(?,?,?,?) ON CONFLICT(telegram_id,name) DO UPDATE SET kind=excluded.kind,config_json=excluded.config_json").bind(user.id,name,cfg.kind??"table",JSON.stringify(cfg)).run();
      await saveSession(env,user.id,"preview",session.data); await send(env,chat,"✅ قالب <b>"+esc(name)+"</b> ذخیره شد.",mainKeyboard(lang,admin)); return;
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
      const value=message.text.trim(); const d={...session.data,richTitle:value==="-"?"":value,richItems:session.data.richItems??[]};
      await saveSession(env,user.id,"rich_editor",d);
      await send(env,chat,"🧩 <b>ویرایشگر پیام سفارشی</b>\n\nعنوان ثبت شد. حالا هر تعداد آیتم می‌خواهی اضافه کن و ترتیبشان را مدیریت کن.",richBuilderKeyboard(d));
      return;
    }
    if(session?.state==="rich_edit_title" && message.text) {
      const value=message.text.trim(); const d={...session.data,richTitle:value==="-"?"":value};
      await saveSession(env,user.id,"rich_editor",d); await send(env,chat,"✅ عنوان پیام به‌روزرسانی شد.",richBuilderKeyboard(d)); return;
    }
    if(session?.state==="rich_item_input" && message.text) {
      const type=String(session.data.richDraftType||"text"); const value=message.text.trim();
      if(!value) { await send(env,chat,"⚠️ محتوا خالی است. دوباره بفرست.",richStageKeyboard(type)); return; }
      let item:any;
      if(type==="photo"||type==="video") {
        const [url,...captionParts]=value.split("|"); const mediaUrl=url.trim();
        if(!/^https?:\/\//i.test(mediaUrl)) { await send(env,chat,"⚠️ لینک رسانه باید با http:// یا https:// شروع شود.",richStageKeyboard(type)); return; }
        item={type,url:mediaUrl,caption:captionParts.join("|").trim()};
      } else if(type==="heading"||type==="text"||type==="caption"||type==="quote") {
        item={type,text:value==="-"?"":value};
        if(!item.text) { await send(env,chat,"⚠️ متن آیتم خالی است.",richStageKeyboard(type)); return; }
      } else { await send(env,chat,"⚠️ نوع آیتم پشتیبانی نمی‌شود."); return; }
      const d={...session.data,richItems:[...(session.data.richItems??[])]};
      if(Number.isInteger(d.richEditIndex)) d.richItems[d.richEditIndex]=item; else d.richItems.push(item);
      delete d.richDraftType; delete d.richEditIndex;
      await saveSession(env,user.id,"rich_editor",d); await send(env,chat,"✅ آیتم به پیام اضافه شد.",richBuilderKeyboard(d)); return;
    }
    if(session?.state==="rich_item_table" && message.text) {
      try {
        const table=parseTable(message.text.trim()); const d={...session.data,richDraftItem:{type:"table",...table}};
        await saveSession(env,user.id,"rich_item_table_caption",d);
        await send(env,chat,richBuilderPrompt("caption"),richStageKeyboard("caption"));
      } catch(e:any) { await send(env,chat,"⚠️ "+esc(e?.message||"ساخت جدول ناموفق بود.")+"\n\nاطلاعات جدول را دوباره بفرست.",richStageKeyboard("table")); }
      return;
    }
    if(session?.state==="rich_item_table_caption" && message.text) {
      const d={...session.data,richItems:[...(session.data.richItems??[])]};
      const item={...(d.richDraftItem??{}),caption:message.text.trim()==="-"?"":message.text.trim()};
      if(Number.isInteger(d.richEditIndex)) d.richItems[d.richEditIndex]=item; else d.richItems.push(item);
      delete d.richDraftItem; delete d.richDraftType; delete d.richEditIndex;
      await saveSession(env,user.id,"rich_editor",d); await send(env,chat,"✅ جدول و کپشن آن ثبت شد.",richBuilderKeyboard(d)); return;
    }
    if(session?.state==="rich_item_buttons" && message.text) {
      const lines=message.text.split(/\r?\n/).map((x:string)=>x.trim()).filter(Boolean);
      const buttons:any[]=[];
      for(const line of lines) {
        const parts=line.split("|"); const text=parts.shift()?.trim()||""; const url=parts.join("|").trim();
        if(!text||!/^https?:\/\//i.test(url)) { await send(env,chat,"⚠️ هر خط باید به شکل <code>عنوان دکمه | https://example.com</code> باشد.",richStageKeyboard("buttons")); return; }
        buttons.push({text:text.slice(0,64),url,style:"primary"});
      }
      if(!buttons.length||buttons.length>8) { await send(env,chat,"⚠️ بین ۱ تا ۸ دکمه وارد کن.",richStageKeyboard("buttons")); return; }
      const d={...session.data,richItems:[...(session.data.richItems??[])]}; const item={type:"buttons",buttons};
      if(Number.isInteger(d.richEditIndex)) d.richItems[d.richEditIndex]=item; else d.richItems.push(item);
      delete d.richDraftType; delete d.richEditIndex;
      await saveSession(env,user.id,"rich_editor",d); await send(env,chat,"✅ دکمه‌ها ثبت شدند.",richBuilderKeyboard(d)); return;
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
      await sendSimpleRichPreview(env,chat,d);
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
      await sendSimpleRichPreview(env,chat,d);
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