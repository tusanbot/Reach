import * as XLSX from "xlsx";

interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
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

function renderLayout(layout:Block[],headers:string[],rows:string[][],opts:any={}) {
  const parts:string[]=[];
  for(const b of normalizeLayout(layout,opts.kind)){
    if(b.type==="header"){
      if(b.title) parts.push("🏷 <b>"+esc(b.title)+"</b>");
      if(b.subtitle) parts.push(esc(b.subtitle));
    } else if(b.type==="text"){
      if(b.text?.trim()) parts.push(esc(b.text));
    } else if(b.type==="table"){
      parts.push(renderTable(headers,rows,opts.style,opts.showIndex,opts.align));
    } else if(b.type==="stats"){
      const lines=["📈 <b>آمار</b>"];
      for(const item of b.items ?? []) {
        const value=String(item.value??"").replaceAll("{{count}}",String(rows.length));
        if(item.label || value) lines.push("• <b>"+esc(item.label)+"</b>: "+esc(value));
      }
      if(lines.length>1) parts.push(lines.join("\n"));
    } else if(b.type==="highlight"){
      if(b.title || b.text) parts.push("⭐ <b>"+esc(b.title||"")+"</b>"+(b.text?"\n"+esc(b.text):""));
    } else if(b.type==="separator") parts.push("────────────");
    else if(b.type==="footer" && b.text?.trim()) parts.push("📌 "+esc(b.text));
  }
  let result=parts.filter(Boolean).join("\n\n");
  if(result.length>3900) result=result.slice(0,3880)+"\n…";
  return result;
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
  const r=await fetch(API(env)+"/"+method,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  return r.json();
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
  const text=data.advanced
    ? renderLayout(data.layout,data.headers,data.rows,{style:data.style,showIndex:data.showIndex,align:data.align,kind:data.kind})
    : renderLayout([{type:"header",title:data.title,subtitle:data.subtitle},{type:"table"},{type:"footer",text:data.footer}],data.headers,data.rows,{style:data.style,showIndex:data.showIndex,align:data.align,kind:data.kind});
  await edit(env,chat,message,text,previewKeyboard(Boolean(data.advanced)));
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
    if(data.startsWith("builder:")) {
      const action=data.split(":")[1];
      if(["table","ranking","stats","custom"].includes(action)) {
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
        const d=session.data; const text=d.advanced?renderLayout(d.layout,d.headers,d.rows,{style:d.style,showIndex:d.showIndex,align:d.align,kind:d.kind}):renderLayout([{type:"header",title:d.title,subtitle:d.subtitle},{type:"table"},{type:"footer",text:d.footer}],d.headers,d.rows,{style:d.style,showIndex:d.showIndex,align:d.align,kind:d.kind});
        await clearSession(env,user.id); await send(env,chat,text); await send(env,chat,"📤 پیام بالا آماده فوروارد است.",mainKeyboard());
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
      await saveSession(env,user.id,"waiting_data",{...config,templateId:id,advanced:Boolean(config.advanced||config.layout)});
      await send(env,chat,"🚀 قالب <b>"+esc(t.name)+"</b> آماده است. داده‌های جدید را بفرست.");
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
        await saveSession(env,user.id,"preview",d); await send(env,chat,renderLayout(d.layout,d.headers,d.rows,{style:d.style,showIndex:d.showIndex,align:d.align,kind:d.kind}),previewKeyboard(Boolean(d.advanced)));
      } catch(e:any) { await send(env,chat,"⚠️ فایل قابل پردازش نیست. "+esc(e?.message||"خطای ناشناخته")); }
      return;
    }
    if(session?.state==="waiting_data" && message.text) {
      try {
        const table=parseTable(message.text);
        const template=session.data;
        const d={...template,...table,style:template.style??"classic",showIndex:template.showIndex??(template.kind==="ranking"),align:template.align??"left",title:template.title??TITLES[template.kind??"table"],subtitle:template.subtitle??"",footer:template.footer??"",layout:template.layout?legacyLayout(template,template.kind):defaultLayout(template.kind)};
        await saveSession(env,user.id,"preview",d); await send(env,chat,renderLayout(d.layout,d.headers,d.rows,{style:d.style,showIndex:d.showIndex,align:d.align,kind:d.kind}),previewKeyboard(Boolean(d.advanced)));
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
    if(request.method==="GET" && url.pathname==="/health") {
      let dbOk=false;
      try {
        await env.DB.prepare("SELECT 1 AS ok").first();
        dbOk=true;
      } catch (error) {
        console.error("health database check failed", error);
      }
      return Response.json({
        ok: dbOk && Boolean(env.BOT_TOKEN) && Boolean(env.WEBHOOK_SECRET),
        service:"reach",
        runtime:"cloudflare-workers",
        config:{
          botToken:Boolean(env.BOT_TOKEN),
          webhookSecret:Boolean(env.WEBHOOK_SECRET),
          database:dbOk
        }
      });
    }
    if(request.method==="POST" && url.pathname==="/webhook") {
      const secret=request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if(!secret || secret!==env.WEBHOOK_SECRET) return new Response("Unauthorized",{status:401});
      try {
        const update=await request.json();
        console.log("telegram update received", {
          update_id:update?.update_id,
          type:update?.message ? "message" : update?.callback_query ? "callback_query" : "other"
        });
        await handleUpdate(env,update);
      } catch (error) {
        console.error("telegram webhook handler failed", error);
      }
      return new Response("ok");
    }
    return new Response("Reach Worker");
  }
};
