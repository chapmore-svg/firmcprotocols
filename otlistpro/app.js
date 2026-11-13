/* OT List Pro
   Turns a Google Calendar day-view printout into the WRHA / hospital theatre list.
   Patient details live only in memory on this device; settings live in localStorage. */
"use strict";

const APP_VERSION = "1.6.5";
const $ = id => document.getElementById(id);
const TICK = "√";

/* ============ settings ============ */
const DEFAULTS = {
  user: "Dr. Longmore",
  head1: "WESTERN REGIONAL HEALTH AUTHORITY",
  head2: "CORNWALL REGIONAL HOSPITAL",
  surgeons: "Drs. Hunter, Longmore  et al  (Firm C)",
  team: "General Surgery Firm C · Cornwall Regional Hospital",
  prefix: "Gen_Sx_C_OT_List",
  sites: "FALMOUTH | FAL OT\nCRH | CRH OT",
  ward: "DC",
  status: "PUBLIC",
  session: "480",
  attachXlsx: "1",
  attachPdf: "1",
};
function loadSettings(){
  let s = {};
  try{ s = JSON.parse(localStorage.getItem("otlp.settings") || "{}") || {}; }catch(e){}
  return Object.assign({}, DEFAULTS, s);
}
function saveSettings(s){ try{ localStorage.setItem("otlp.settings", JSON.stringify(s)); }catch(e){} }
let settings = loadSettings();

function siteList(){
  return settings.sites.split("\n").map(l=>l.trim()).filter(Boolean).map(l=>{
    const [name, ...rest] = l.split("|");
    const key = (rest.join("|") || name).trim();
    return { name: name.trim().toUpperCase(), key };
  }).filter(s=>s.name);
}
const squash = s => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/* ============ list state (memory only) ============ */
let cases = [];       // {name,doc,age,ward,est,dx,proc,ana,status,flags:{}}
let sourceText = "";

/* ============ tactile feedback ============ */
document.addEventListener("pointerdown", e=>{
  const el = e.target.closest(".tap, .btn");
  if(!el || el.disabled) return;
  try{ navigator.vibrate && navigator.vibrate(8); }catch(_){}
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2.2;
  const s = document.createElement("span");
  s.className = "ripple";
  s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size/2}px;top:${e.clientY - r.top - size/2}px`;
  el.appendChild(s);
  s.addEventListener("animationend", ()=>s.remove());
}, {passive:true});

function toast(msg, actionLabel, action, ms=3200){
  const t = $("toast");
  t.innerHTML = "";
  const span = document.createElement("span"); span.textContent = msg; t.appendChild(span);
  if(actionLabel){ const b = document.createElement("button"); b.className="tap"; b.textContent = actionLabel; b.onclick = ()=>{ t.hidden = true; action(); }; t.appendChild(b); }
  t.hidden = false;
  clearTimeout(toast._t);
  if(!actionLabel) toast._t = setTimeout(()=>{ t.hidden = true; }, ms);
}

/* ============ navigation ============ */
const SCREENS = ["home","upload","review","export","settings"];
function go(name, replace){
  if(!SCREENS.includes(name)) name = "home";
  if((name==="review" || name==="export") && !cases.length) name = "upload";
  const url = "#" + name;
  if(location.hash !== url){ replace ? history.replaceState(null,"",url) : history.pushState(null,"",url); }
  show(name);
}
let lastScreen = "home";
function show(name){
  if(name !== "settings") lastScreen = name;
  SCREENS.forEach(s=>{ $("screen-"+s).hidden = (s !== name); });
  const flow = ["upload","review","export"], idx = flow.indexOf(name);
  $("stepper").hidden = idx < 0;
  document.querySelectorAll(".step").forEach((b,i)=>{
    b.classList.toggle("active", i===idx);
    b.classList.toggle("done", i<idx);
    b.disabled = i>0 && !cases.length;
  });
  if(name==="home") renderHome();
  if(name==="upload") renderUpload();
  if(name==="review") renderCases();
  if(name==="export") renderExport();
  if(name==="settings") renderSettings();
  window.scrollTo({top:0, behavior:"instant" in window ? "instant" : "auto"});
}
window.addEventListener("popstate", ()=>{
  let n = location.hash.slice(1);
  if(!SCREENS.includes(n)) n = "home";
  if((n==="review" || n==="export") && !cases.length) n = "upload";
  show(n);
});
document.addEventListener("click", e=>{
  const el = e.target.closest("[data-go]");
  if(el){ e.preventDefault(); go(el.dataset.go); }
});

/* ============ home ============ */
function renderHome(){
  $("home-version").textContent = "Version " + APP_VERSION;
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  $("greeting").textContent = settings.user ? `${part}, ${settings.user}` : part;
  $("hero-team").textContent = settings.team;
}
document.querySelectorAll("[data-start]").forEach(b=>b.addEventListener("click", ()=>{ setMode(b.dataset.start); go("upload"); }));

/* ============ upload: three ways to enter the list ============ */
let inputMode = "pdf";      // "pdf" | "word" | "type"
let fileText = "";          // text read from the chosen PDF / Word file
const MODE_TEXT = {
  pdf:  {title:"Tap to choose the PDF",  accept:"application/pdf,.pdf"},
  word: {title:"Tap to choose the Word document", accept:".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
};
function setMode(m){
  inputMode = m;
  document.querySelectorAll(".mode").forEach(b=>b.setAttribute("aria-selected", String(b.dataset.mode===m)));
  $("panel-file").hidden = (m==="type");
  $("panel-type").hidden = (m!=="type");
  $("help-pdf").hidden = (m!=="pdf");
  $("help-word").hidden = (m!=="word");
  if(m!=="type"){
    $("file").accept = MODE_TEXT[m].accept;
    if(!drop.classList.contains("loaded") || drop.dataset.kind!==m) resetDrop();
  }
  // the format rules matter most when typing or using Word
  $("format-help").open = (m!=="pdf");
  setMsg("");
}
document.querySelectorAll(".mode").forEach(b=>b.addEventListener("click", ()=>{
  setMode(b.dataset.mode);
  if(b.dataset.mode==="type") setTimeout(()=>$("pastebox").focus(), 50);
}));
function resetDrop(){
  drop.classList.remove("loaded"); delete drop.dataset.kind; fileText = "";
  $("drop-title").textContent = MODE_TEXT[inputMode==="word"?"word":"pdf"].title;
  $("drop-sub").textContent = "or drag it here";
}

function renderUpload(){
  const sel = $("site"), cur = sel.value;
  sel.innerHTML = siteList().map(s=>`<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");
  if(cur && [...sel.options].some(o=>o.value===cur)) sel.value = cur;
  if(!$("session").value) $("session").value = settings.session;
  $("pick-help").innerHTML = IS_ANDROID
    ? "Tap the box, then choose the folder where the file is saved. Tap <b>☰</b> (top left) to see <b>Downloads</b>, <b>Drive</b> and your other folders."
    : "Click the box, then browse to the folder where the file is saved: Downloads, Documents, OneDrive, a USB stick or anywhere else.";
  setMode(inputMode);
}
const drop = $("drop"), fileInput = $("file");
drop.addEventListener("click", ()=>fileInput.click());
drop.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); fileInput.click(); } });
["dragover","dragenter"].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add("drag"); }));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove("drag"); }));
drop.addEventListener("drop", e=>{ const f=e.dataTransfer.files[0]; if(f) readFile(f); });
fileInput.addEventListener("change", ()=>{ if(fileInput.files[0]) readFile(fileInput.files[0]); fileInput.value=""; });

function setMsg(text, kind){ const m=$("srcmsg"); m.textContent=text; m.className="msg"+(kind?" "+kind:""); }

async function readFile(f){
  const name = f.name.toLowerCase();
  const isPdf = name.endsWith(".pdf") || f.type==="application/pdf";
  const isDocx = name.endsWith(".docx") || f.type.includes("wordprocessingml");
  if(name.endsWith(".doc")){
    setMsg("That is an older Word file (.doc). Open it in Word, choose Save As → Word Document (.docx), then choose the new file.", "err"); return;
  }
  if(!isPdf && !isDocx){ setMsg("Please choose a PDF (.pdf) or Word (.docx) file.", "err"); return; }
  const kind = isPdf ? "pdf" : "word";
  if(kind !== inputMode) setMode(kind);
  setMsg("Reading "+f.name+" …");
  try{
    const res = isPdf ? await pdfToText(f) : {text: await docxToText(await f.arrayBuffer()), pages:0};
    fileText = res.text.trim();
    if(!fileText) throw new Error("empty");
    drop.classList.add("loaded"); drop.dataset.kind = kind;
    $("drop-title").textContent = f.name;
    $("drop-sub").textContent = (isPdf ? `${res.pages} page${res.pages>1?"s":""} read` : "Document read") + " · tap to choose another";
    detectMeta(fileText);
    setMsg((isPdf?"PDF":"Word document")+" read. Check the date and site, then tap Read cases.", "ok");
  }catch(err){
    fileText = "";
    setMsg(`Couldn't read that ${isPdf?"PDF":"Word document"}. Choose Type instead and paste the list.`, "err");
  }
}

async function pdfToText(f){
  if(!window.pdfjsLib) throw new Error("reader");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
  const pdf = await pdfjsLib.getDocument({data: await f.arrayBuffer()}).promise;
  let text = "";
  for(let p=1; p<=pdf.numPages; p++){
    const tc = await (await pdf.getPage(p)).getTextContent();
    let lastY = null;
    tc.items.forEach(it=>{
      if(lastY!==null && Math.abs(it.transform[5]-lastY) > 3) text += "\n";
      text += it.str + " ";
      lastY = it.transform[5];
    });
    text += "\n";
  }
  return {text, pages:pdf.numPages};
}

// .docx is a zip; the text is in word/document.xml. Uses the browser's built-in decompression.
async function docxToText(buf){
  const u8 = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder();
  let eocd = -1;
  for(let i=u8.length-22; i>=Math.max(0,u8.length-65557); i--){ if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; } }
  if(eocd<0) throw new Error("not a zip");
  const count = dv.getUint16(eocd+10,true);
  let p = dv.getUint32(eocd+16,true);
  for(let k=0; k<count; k++){
    if(dv.getUint32(p,true)!==0x02014b50) break;
    const method=dv.getUint16(p+10,true), csize=dv.getUint32(p+20,true);
    const nlen=dv.getUint16(p+28,true), xlen=dv.getUint16(p+30,true), clen=dv.getUint16(p+32,true), off=dv.getUint32(p+42,true);
    const name = dec.decode(u8.subarray(p+46, p+46+nlen));
    if(name==="word/document.xml"){
      const start = off+30+dv.getUint16(off+26,true)+dv.getUint16(off+28,true);
      const data = u8.subarray(start, start+csize);
      let xml;
      if(method===0) xml = dec.decode(data);
      else if(method===8) xml = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
      else throw new Error("compression");
      return wordXmlToText(xml);
    }
    p += 46+nlen+xlen+clen;
  }
  throw new Error("no document.xml");
}
function wordXmlToText(xml){
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paraText = para=>{
    let line = "";
    const walk = n=>{
      for(const c of n.children){
        const ln = c.localName;
        if(ln==="t") line += c.textContent;
        else if(ln==="tab") line += " ";
        else if(ln==="br" || ln==="cr") line += "\n";
        else if(ln!=="p" && ln!=="instrText" && ln!=="delText") walk(c);
      }
    };
    walk(para);
    return line;
  };
  const lines = [];
  const block = el=>{
    for(const c of el.children){
      if(c.localName==="p") lines.push(paraText(c));
      else if(c.localName==="tbl"){
        // one table row = one line, cells side by side
        for(const tr of c.children){
          if(tr.localName!=="tr") continue;
          const cells = [...tr.children].filter(tc=>tc.localName==="tc")
            .map(tc=>[...tc.getElementsByTagNameNS(W,"p")].map(paraText).join(" ").trim()).filter(Boolean);
          lines.push(cells.join("  "));
        }
      }
      else if(c.localName==="sdt"){ const sc = [...c.children].find(x=>x.localName==="sdtContent"); if(sc) block(sc); }
    }
  };
  block(doc.getElementsByTagNameNS(W,"body")[0] || doc.documentElement);
  return lines.join("\n");
}

/* ============ parser (same rules as the CRH Gen Sx C app, with the Nov 2026 fixes) ============ */
const MONTHS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
const DAYS = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];
function to24(h, ap){ h=+h; ap=ap.toLowerCase(); if(ap==="pm"&&h!==12) h+=12; if(ap==="am"&&h===12) h=0; return h; }

function detectMeta(raw){
  const sq = squash(raw);
  const hit = siteList().find(s=>sq.includes(squash(s.key)));
  if(hit) $("site").value = hit.name;
  const dm = raw.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?,?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i);
  if(dm){
    const mo = MONTHS.findIndex(x=>x.startsWith(dm[1].toUpperCase()))+1;
    $("listdate").value = dm[3]+"-"+String(mo).padStart(2,"0")+"-"+String(+dm[2]).padStart(2,"0");
  }
}

// A time slot: "8am - 9am", "9:30am to 11:30am", "8 – 9am" (start takes the end's am/pm when left out)
const SLOT = String.raw`\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:[–—\-]|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b`;
const HAS_AGE_SEX = /\d{1,3}\s*\/\s*[MF]\b|\d{1,3}\s*[MF]\b/i;
function slotFrom(m, i){
  const eap = m[i+5], e24 = to24(m[i+3], eap), em = +(m[i+4]||0), sm = +(m[i+1]||0);
  let s24 = to24(m[i], m[i+2] || eap);
  if(!m[i+2] && s24*60+sm > e24*60+em) s24 = to24(m[i], eap.toLowerCase()==="pm" ? "am" : "pm");
  let dur = (e24*60+em) - (s24*60+sm);
  if(dur <= 0) dur += 1440;
  return {t:s24*60+sm, est:String(dur)};
}
function parseSource(raw){
  // Layout A (Google Calendar printout): booking text, then its time slot.
  const a = []; let mt;
  const reA = new RegExp(String.raw`([^\n]{6,}?)\s*\n?\s*` + SLOT, "gi");
  while((mt = reA.exec(raw)) !== null){
    const chunk = mt[1].trim();
    if(!HAS_AGE_SEX.test(chunk)) continue;   // must contain age/sex
    a.push({...slotFrom(mt, 2), text:chunk});
  }
  // Layout B (typed / Word tables): time slot at the start of a line, booking after it.
  const b = [];
  const reB = new RegExp(String.raw`(?:^|\n)[ \t]*` + SLOT + String.raw`[ \t]*[,:;|\-–]?[ \t]*\n?[ \t]*([^\n]{6,})`, "gi");
  while((mt = reB.exec(raw)) !== null){
    const chunk = mt[7].trim();
    if(!HAS_AGE_SEX.test(chunk)) continue;
    b.push({...slotFrom(mt, 1), text:chunk});
    reB.lastIndex -= 1;   // let the next slot reuse the newline
  }
  const found = b.length > a.length ? b : a;
  found.sort((x,y)=>x.t-y.t);
  return found.map(f=>parseEntry(f.text, f.est));
}

function parseEntry(text, est){
  const flags = {};
  let t = text.replace(/\s+/g," ").trim();

  const am = t.match(/(.+?)[\.]* *\*{0,4}\s*(\d{1,3})\s*\/?\s*([MF])\b/i);
  let name = "", age = "";
  if(am){ name = am[1].replace(/[*.,\s]+$/,"").trim(); age = am[2]+"/"+am[3].toUpperCase(); t = t.slice(am[0].length); }
  else { name = t; flags.name = true; }
  name = name.replace(/\*+/g,"").trim();

  let doc = "";
  const rm = t.match(/reg\.?\s*#?:?\s*(nyr|\d{4,7})/i);
  if(rm){ doc = /nyr/i.test(rm[1]) ? "NYR" : rm[1]; } else flags.doc = true;

  let ana = "";
  if(/local\s*\+\s*sed|\bla\s*\/\s*sed/i.test(t)) ana = "LA/Sed";
  else if(/sedation/i.test(t) && /\blocal\b/i.test(t)) ana = "LA/Sed";
  else if(/\bGA\b|general\s+an(a)?esth/i.test(t)) ana = "GA";
  else if(/\blocal\b|\bLA\b/i.test(t)) ana = "LA";

  let proc = t;
  const cut = t.search(/reg\.?\s*#?/i);
  if(cut > -1) proc = t.slice(0, cut);
  proc = stripAna(proc).replace(/^\W+|\W+$/g,"").replace(/\s+/g," ").trim();

  const d = deriveDxProc(proc);
  if(!ana){ ana = d.anaDefault || ""; if(ana) flags.ana = true; }
  if(d.inferred) flags.dx = true;

  return {name, doc, age, ward:settings.ward, est:est||"", dx:d.dx, proc:d.proc, ana, status:settings.status, flags};
}

function stripAna(s){
  return s
    .replace(/\b(?:under\s+)?(?:la\s*\/\s*sed(?:ation)?|local\s*\+\s*sed(?:ation)?|local(?:\s+an(?:a)?esthe(?:sia|tic))?(?:\s+(?:with|and|\+)\s+sedation)?|general\s+an(?:a)?esthe(?:sia|tic))\b/gi," ")
    .replace(/\b(?:under\s+)?(?:GA|LA)\b/gi," ")
    .replace(/\s+/g," ").trim();
}

function deriveDxProc(p){
  const L = p.toLowerCase();
  if(/ex\s*\.?\s*bx|excis/i.test(L)){
    let rest = p.replace(/ex\s*\.?\s*bx\.?/i,"").replace(/excisional?\s*(biopsy)?/i,"").replace(/^[\s.,]+/,"").replace(/^\?\s*/,"?").trim();
    if(!rest) rest = p;
    return {dx:rest.charAt(0).toUpperCase()+rest.slice(1), proc:"Excisional Biopsy", anaDefault:"LA", inferred:true};
  }
  if(/chole/.test(L)){
    const uh = /\buh\b/i.test(L);
    return {dx:"Symptomatic Gallstones"+(uh?" + UH":""), proc:"Lap. Cholecystectomy"+(uh?" + UH Repair":""), anaDefault:"GA", inferred:true};
  }
  if(/h(a)?emorrhoid/.test(L)) return {dx:"Haemorrhoids", proc:"Haemorrhoidectomy", anaDefault:"GA", inferred:true};
  if(/\brih\b/.test(L)) return {dx:"RIH", proc:/mesh/.test(L)?"RIH Mesh Repair":"RIH Repair", inferred:true};
  if(/\blih\b/.test(L)) return {dx:"LIH", proc:/mesh/.test(L)?"LIH Mesh Repair":"LIH Repair", inferred:true};
  if(/\bsuh\b/.test(L)) return {dx:"SUH", proc:"SUH Repair", anaDefault:"GA", inferred:true};
  if(/\buh\b/.test(L)){
    const lg = /large/.test(L);
    return {dx:(lg?"Large UH":"UH"), proc:(lg?"Large UH Repair":"UH Repair"), anaDefault:lg?"GA":"", inferred:true};
  }
  return {dx:p, proc:p, inferred:false};
}

$("parsebtn").addEventListener("click", ()=>{
  const raw = inputMode==="type" ? $("pastebox").value : fileText;
  if(!raw.trim()){
    setMsg(inputMode==="type" ? "Type or paste the list into the box first." : inputMode==="word" ? "Choose the Word document first." : "Choose the calendar PDF first.", "err");
    return;
  }
  if(raw !== sourceText) detectMeta(raw);
  sourceText = raw;
  const parsed = parseSource(raw);
  if(!parsed.length){ setMsg("No bookings found. Each booking needs a name, age/sex (e.g. 45/F) and a time slot (e.g. 8am - 9am). See “How each booking must be written” above.", "err"); $("format-help").open = true; return; }
  cases = parsed;
  if(!$("listdate").value){ setMsg(`${cases.length} cases found. Please set the list date.`, "err"); $("listdate").focus(); return; }
  setMsg("");
  go("review");
});
$("session").addEventListener("input", ()=>updateTotals());

/* ============ review ============ */
const ICON = {
  up:'<svg viewBox="0 0 24 24"><path d="M12 19V5m-6 6l6-6 6 6"/></svg>',
  dn:'<svg viewBox="0 0 24 24"><path d="M12 5v14m6-6l-6 6-6-6"/></svg>',
  del:'<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};
function esc(s){ return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function renderCases(){
  const b = dateBits();
  $("review-sub").textContent = `${$("site").value} · ${b ? b.pretty : "no date set"}`;
  const wrap = $("cases");
  if(!cases.length){ wrap.innerHTML = '<div class="empty">No cases. Add one below.</div>'; updateTotals(); return; }
  wrap.innerHTML = cases.map((c,i)=>caseCard(c,i)).join("");
  updateTotals();
}
function fld(c,i,f,label,cls,attrs=""){
  const chk = c.flags && c.flags[f];
  return `<label class="cf ${cls}${chk?" check":""}"><span class="cf-lab">${label}${chk?' <span class="chip chip-check">Check</span>':""}</span>
    <input data-i="${i}" data-f="${f}" value="${esc(c[f])}" ${attrs}></label>`;
}
function caseCard(c,i){
  const anaChk = c.flags && c.flags.ana;
  return `<article class="case" data-i="${i}">
    <div class="case-head">
      <span class="case-no">${i+1}</span>
      <input class="case-name" data-i="${i}" data-f="name" value="${esc(c.name)}" placeholder="Patient name" aria-label="Patient name">
      <div class="case-tools">
        <button class="mini tap" data-a="up" data-i="${i}" aria-label="Move up" ${i===0?"disabled":""}>${ICON.up}</button>
        <button class="mini tap" data-a="dn" data-i="${i}" aria-label="Move down" ${i===cases.length-1?"disabled":""}>${ICON.dn}</button>
        <button class="mini del tap" data-a="del" data-i="${i}" aria-label="Remove case">${ICON.del}</button>
      </div>
    </div>
    <div class="case-body">
      ${fld(c,i,"est","Est (min)","c-est",'inputmode="numeric"')}
      ${fld(c,i,"age","Age/Sex","c-age")}
      ${fld(c,i,"ward","Ward","c-ward")}
      ${fld(c,i,"doc","Reg #","c-doc")}
      <div class="cf c-ana${anaChk?" check":""}"><span class="cf-lab">Anaesthesia${anaChk?' <span class="chip chip-check">Check</span>':""}</span>
        <div class="seg" role="group" aria-label="Anaesthesia">${["LA","GA","LA/Sed"].map(o=>`<button class="tap ${c.ana===o?"on":""}" data-a="ana" data-v="${o}" data-i="${i}">${o}</button>`).join("")}</div></div>
      ${fld(c,i,"dx","Diagnosis","c-dx")}
      ${fld(c,i,"proc","Surgical procedure","c-proc")}
      <div class="cf c-status"><span class="cf-lab">Status</span>
        <div class="seg status" role="group" aria-label="Status">${["PUBLIC","PRIVATE"].map(o=>`<button class="tap ${c.status===o?"on":""}" data-a="st" data-v="${o}" data-i="${i}">${o==="PUBLIC"?"Public":"Private"}</button>`).join("")}</div></div>
    </div>
  </article>`;
}
$("cases").addEventListener("input", e=>{
  const {f,i} = e.target.dataset; if(f===undefined || i===undefined) return;
  cases[i][f] = e.target.value;
  if(cases[i].flags && cases[i].flags[f]){
    delete cases[i].flags[f];
    const lab = e.target.closest(".cf"); if(lab){ lab.classList.remove("check"); lab.querySelector(".chip")?.remove(); }
  }
  if(f==="est") updateTotals();
});
$("cases").addEventListener("click", e=>{
  const b = e.target.closest("[data-a]"); if(!b) return;
  const a = b.dataset.a, i = +b.dataset.i;
  if(a==="up" && i>0){ [cases[i-1],cases[i]] = [cases[i],cases[i-1]]; renderCases(); flash(i-1); }
  if(a==="dn" && i<cases.length-1){ [cases[i+1],cases[i]] = [cases[i],cases[i+1]]; renderCases(); flash(i+1); }
  if(a==="del"){
    const removed = cases.splice(i,1)[0]; renderCases();
    toast(`Removed ${removed.name || "case"}`, "Undo", ()=>{ cases.splice(i,0,removed); renderCases(); });
  }
  if(a==="ana"){ cases[i].ana = cases[i].ana===b.dataset.v ? "" : b.dataset.v; delete cases[i].flags.ana; renderCases(); }
  if(a==="st"){ cases[i].status = b.dataset.v; renderCases(); }
});
function flash(i){ const el = document.querySelector(`.case[data-i="${i}"]`); if(el){ el.scrollIntoView({block:"nearest", behavior:"smooth"}); el.animate([{boxShadow:"0 0 0 3px rgba(14,143,155,.5)"},{boxShadow:"0 0 0 0 rgba(14,143,155,0)"}], {duration:700}); } }
$("addcase").addEventListener("click", ()=>{
  cases.push({name:"",doc:"",age:"",ward:settings.ward,est:"",dx:"",proc:"",ana:"",status:settings.status,flags:{}});
  renderCases();
  const last = document.querySelector(".case:last-child .case-name"); if(last){ last.focus(); last.scrollIntoView({block:"center", behavior:"smooth"}); }
});

function fmtHM(m){ const h=Math.floor(m/60), r=m%60; return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`; }
function updateTotals(){
  const el = $("totals"); if(!el) return;
  const total = cases.reduce((s,c)=>s+(parseInt(c.est,10)||0),0);
  const missing = cases.filter(c=>!(parseInt(c.est,10)>0)).length;
  const sess = parseInt($("session").value,10) || 0;
  const n = cases.length;
  let note = "", pct = 0, over = false;
  if(sess>0){
    pct = Math.min(100, Math.round(total/sess*100)); over = total>sess;
    note = over ? `${fmtHM(total-sess)} over` : total===sess ? "Fills the session exactly" : `${fmtHM(sess-total)} spare`;
  }
  el.innerHTML = `<div><div class="big">${n} case${n===1?"":"s"} · ${fmtHM(total)}</div><div class="lbl">booked${sess?` · ${fmtHM(sess)} session`:""}</div></div>
    ${sess?`<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${sess}" aria-valuenow="${total}"><i style="width:${pct}%"></i></div><div class="note">${note}</div>`:"<div></div><div></div>"}
    ${missing?`<div class="warn">${missing} case${missing===1?" has":"s have"} no estimated minutes</div>`:""}`;
  el.classList.toggle("over", over);
}

/* ============ export ============ */
function dateBits(){
  const v = $("listdate").value; if(!v) return null;
  const d = new Date(v+"T12:00:00");
  const month = MONTHS[d.getMonth()];
  return {day:DAYS[d.getDay()], month, dnum:d.getDate(), year:d.getFullYear(),
          monthTitle:month.charAt(0)+month.slice(1).toLowerCase(),
          pretty:d.toLocaleDateString(undefined,{weekday:"long", day:"numeric", month:"long", year:"numeric"})};
}
function fileName(ext="xlsx"){
  const b = dateBits(); if(!b) return "";
  const pre = (settings.prefix||"OT_List").replace(/[\\/:*?"<>|]+/g,"_");
  return `${pre}_${b.monthTitle}_${b.dnum}_${b.year}_${$("site").value}.${ext}`;
}
function renderExport(){
  const b = dateBits();
  const total = cases.reduce((s,c)=>s+(parseInt(c.est,10)||0),0);
  $("export-sub").textContent = `${cases.length} case${cases.length===1?"":"s"} · ${fmtHM(total)} · ${$("site").value} · ${b?b.pretty:"no date set"}`;
  $("fname").textContent = fileName();
  $("preview").innerHTML = b ? buildListHTML(b) : '<p style="padding:20px">Set the list date on the Upload step first.</p>';
  requestAnimationFrame(fitPreview);
  $("att-xlsx").checked = settings.attachXlsx==="1";
  $("att-pdf").checked = settings.attachPdf==="1";
  const shX = canShareOne(new File([""],"x.xlsx",{type:XLSX_MIME})), shP = canShareOne(new File([""],"x.pdf",{type:"application/pdf"}));
  $("email-help").innerHTML = (shX && shP)
    ? "Tap <b>Share the list</b> and choose <b>Gmail</b>, <b>Outlook</b>, <b>WhatsApp</b>, <b>Drive</b> or another app. The ticked files go with it, and email apps get the subject and message filled in."
    : shP
    ? "Tap <b>Share the list</b> and choose Gmail, Outlook, WhatsApp, Drive or another app. On this device the <b>PDF</b> can be shared but the <b>Excel</b> file can't, so if Excel is ticked the app asks what you'd like to do. Nothing is saved unless you choose to."
    : (IS_ANDROID && !IS_ANDROID_CHROME)
    ? `This app is running in <b>${browserName()}</b>, which can't open the share menu with files. Tap <b>Share the list</b> for the option to open it in <b>Chrome</b>, where sharing works.`
    : "This browser can't open the share menu with files. Tap <b>Share the list</b> to save the files to a folder you choose and send them yourself.";
}
// shrink the full-width hospital list so the whole page is visible in the preview
function fitPreview(){
  const frame = document.querySelector(".preview-frame"), inner = $("preview");
  if(!frame || frame.offsetParent === null) return;
  inner.style.transform = "none";
  const avail = frame.clientWidth - 28, w = inner.scrollWidth;
  const k = Math.min(1, avail / w);
  inner.style.transform = `scale(${k})`;
  frame.style.height = (inner.scrollHeight * k + 28) + "px";
}
window.addEventListener("resize", ()=>fitPreview());
function surgeonsText(){ return (settings.surgeons||"").trim(); }

function buildListHTML(b){
  const site = $("site").value;
  return `<div class="ol">
  <div class="h">${esc(settings.head1)}<br>${esc(settings.head2)}</div>
  <div class="t">SURGERIES TO BE DONE  @ ${esc(site)} SITE</div>
  <div class="l"><span>SURGEONS: ${esc(surgeonsText())}</span><span>DATE: ${b.day}, ${b.month} ${b.dnum}, ${b.year}</span></div>
  <table>
    <tr><th rowspan="2">NAME</th><th rowspan="2">DOC #/DOB</th><th rowspan="2">AGE</th><th rowspan="2">WARD</th>
        <th rowspan="2">DIAGNOSIS</th><th rowspan="2">SURGICAL PROCEDURE</th>
        <th colspan="2">STATUS</th><th colspan="2">OUTCOME</th><th colspan="3">PROCEDURE TIMES</th>
        <th rowspan="2">REASON FOR CANCELLATION</th><th rowspan="2">NAME OF PRIMARY ATTENDING SURGEON /ANAESTHEIST</th></tr>
    <tr><th>PRIVATE</th><th>PUBLIC</th><th>COMPLETED</th><th>CANCELLED</th><th>EST (MIN)</th><th>START</th><th>END</th></tr>
    ${cases.map(cs=>`<tr>
      <td>${esc(cs.name)}</td><td>${esc(cs.doc)}</td><td>${esc(cs.age)}</td><td>${esc(cs.ward)}</td>
      <td>${esc(cs.dx)}</td><td>${esc(cs.proc)}${cs.ana?" ("+esc(cs.ana)+")":""}</td>
      <td>${cs.status==="PRIVATE"?TICK:""}</td><td>${cs.status==="PUBLIC"?TICK:""}</td>
      <td></td><td></td><td>${esc(cs.est)}</td><td></td><td></td><td></td><td></td></tr>`).join("")}
  </table>
  <div class="sig">
    <div><p>DEPARTMENTAL SISTER/DESIGNATE_______________</p><p>CONSULTANT SURGEON_______________</p><p>DEPARTMENTAL SISTER/DESIGNATE_______________</p></div>
    <div><p>ANESTHESIST_______________</p><p>S.M.O. SIGNATURE (PRE)_______________</p><p>S.M.O. SIGNATURE (POST)_______________</p><p>ANESTHESIST _______________</p></div>
  </div></div>`;
}

$("printbtn").addEventListener("click", ()=>{
  const b = dateBits(); if(!b){ toast("Set the list date first."); return; }
  $("printview").innerHTML = buildListHTML(b);
  setTimeout(()=>window.print(), 50);
});

/* ---- xlsx (hand-built Office Open XML; same layout as the CRH Gen Sx C app) ---- */
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
function xmlEsc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function colName(n){ let s=""; while(n>0){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); } return s; }

function buildSheetXml(site, b){
  const rows = [];
  const c = (col,r,style,val)=> val===undefined||val===""
    ? `<c r="${col}${r}" s="${style}"/>`
    : `<c r="${col}${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
  rows.push(`<row r="3" ht="23.25" customHeight="1">${c("A",3,1,"SURGERIES TO BE DONE  @ "+site+" SITE")}</row>`);
  rows.push(`<row r="4" ht="23.25" customHeight="1">${c("A",4,2,"SURGEONS: "+surgeonsText())}${c("J",4,2,"DATE: "+b.day+", "+b.month+" "+b.dnum+", "+b.year)}</row>`);
  const h5={A:"NAME",B:"DOC #/DOB",C:"AGE",D:"WARD",E:"DIAGNOSIS",F:"SURGICAL PROCEDURE",G:"STATUS",I:"OUTCOME ",K:"PROCEDURE TIMES",N:"REASON FOR CANCELLATION",O:"NAME OF  PRIMARY ATTENDING SURGEON /ANAESTHEIST "};
  let r5=""; for(let i=1;i<=15;i++){ const col=colName(i); r5+=c(col,5,3,h5[col]); }
  rows.push(`<row r="5" ht="116.25" customHeight="1">${r5}</row>`);
  const h6={G:"PRIVATE ",H:"PUBLIC",I:"COMPLETED",J:"CANCELLED",K:"EST (MIN)",L:"START ",M:"END"};
  let r6=""; for(let i=1;i<=15;i++){ const col=colName(i); r6+=c(col,6,4,h6[col]); }
  rows.push(`<row r="6" ht="33" customHeight="1">${r6}</row>`);
  cases.forEach((cs,idx)=>{
    const r = 7+idx;
    const proc = cs.proc+(cs.ana?` (${cs.ana})`:"");
    const vals = {A:cs.name,B:cs.doc,C:cs.age,D:cs.ward,E:cs.dx,F:proc,G:cs.status==="PRIVATE"?TICK:"",H:cs.status==="PUBLIC"?TICK:"",K:cs.est,L:"",M:""};
    let rw=""; for(let i=1;i<=15;i++){ const col=colName(i); rw+=c(col,r,3,vals[col]); }
    rows.push(`<row r="${r}" ht="56.25" customHeight="1">${rw}</row>`);
  });
  const sig = 7+cases.length+1;
  [[sig,"E","DEPARTMENTAL SISTER/DESIGNATE_______________________","J","ANESTHESIST_____________________________"],
   [sig+2,"E","CONSULTANT SURGEON_______________________________","J","S.M.O. SIGNATURE  (PRE)____________________"],
   [sig+4,"E","DEPARTMENTAL SISTER/DESIGNATE_______________________","J","S.M.O. SIGNATURE (POST)___________________"],
   [sig+6,null,null,"J","ANAESTHESIST __________________________"]].forEach(([r,c1,t1,c2,t2])=>{
    let rw=""; if(c1) rw+=c(c1,r,5,t1); rw+=c(c2,r,5,t2);
    rows.push(`<row r="${r}">${rw}</row>`);
  });
  const lastRow = sig+6;
  const widths = {A:26,B:13.8,C:8.4,D:11.2,E:23,F:30.2,G:11,H:11,I:15.4,J:14.4,K:10,L:10,M:10,N:22,O:25.7};
  const cols = Object.keys(widths).map((k,i)=>`<col min="${i+1}" max="${i+1}" width="${widths[k]}" customWidth="1"/>`).join("");
  const merges = ["G5:H5","I5:J5","K5:M5","N5:N6","A5:A6","B5:B6","C5:C6","D5:D6","E5:E6","F5:F6","O5:O6"];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:O${lastRow}"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${rows.join("")}</sheetData>
<mergeCells count="${merges.length}">${merges.map(m=>`<mergeCell ref="${m}"/>`).join("")}</mergeCells>
<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="5" orientation="landscape" fitToWidth="1" fitToHeight="1"/>
</worksheet>`;
}
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Aptos Narrow"/></font><font><b/><sz val="18"/><name val="Aptos Narrow"/></font><font><b/><sz val="14"/><name val="Aptos Narrow"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border><border><left/><right/><top/><bottom style="thin"/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="49" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
const WB_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
const WB_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const CRC_TABLE = (()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c>>>0; } return t; })();
function crc32(u8){ let c=0xFFFFFFFF; for(let i=0;i<u8.length;i++) c=CRC_TABLE[(c^u8[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function makeZip(files){
  const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
  files.forEach(f=>{
    const nm = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(12,0x21,true);
    lh.setUint32(14,crc,true); lh.setUint32(18,data.length,true); lh.setUint32(22,data.length,true); lh.setUint16(26,nm.length,true);
    parts.push(new Uint8Array(lh.buffer), nm, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(14,0x21,true);
    ch.setUint32(16,crc,true); ch.setUint32(20,data.length,true); ch.setUint32(24,data.length,true); ch.setUint16(28,nm.length,true);
    ch.setUint32(42,offset,true);
    central.push(new Uint8Array(ch.buffer), nm);
    offset += 30+nm.length+data.length;
  });
  const cdSize = central.reduce((a,p)=>a+p.length,0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true); end.setUint16(8,files.length,true); end.setUint16(10,files.length,true);
  end.setUint32(12,cdSize,true); end.setUint32(16,offset,true);
  return new Blob([...parts,...central,new Uint8Array(end.buffer)],{type:XLSX_MIME});
}
function buildXlsx(){
  const b = dateBits(); if(!b){ toast("Set the list date first."); return null; }
  if(!cases.length){ toast("No cases to export."); return null; }
  return makeZip([
    {name:"[Content_Types].xml", text:CONTENT_TYPES},
    {name:"_rels/.rels", text:ROOT_RELS},
    {name:"xl/workbook.xml", text:WB_XML},
    {name:"xl/_rels/workbook.xml.rels", text:WB_RELS},
    {name:"xl/styles.xml", text:STYLES_XML},
    {name:"xl/worksheets/sheet1.xml", text:buildSheetXml($("site").value, b)},
  ]);
}
function downloadBlob(blob, name){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const ANDROID_SAVE_TIP = "To choose where files go, turn on “Ask where to save files” in Chrome: ⋮ → Settings → Downloads.";
function pickerTypes(name){
  return name.endsWith(".pdf")
    ? [{description:"PDF document", accept:{"application/pdf":[".pdf"]}}]
    : [{description:"Excel workbook", accept:{[XLSX_MIME]:[".xlsx"]}}];
}
// Save one file. Computers (Chrome/Edge): a "Save as" window to choose folder and name.
// Elsewhere (e.g. Android): a normal download, which Chrome can be set to ask about.
async function saveBlob(blob, name){
  if(window.showSaveFilePicker){
    try{
      const h = await window.showSaveFilePicker({suggestedName:name, types:pickerTypes(name), id:"otlp-save", startIn:"documents"});
      const w = await h.createWritable(); await w.write(blob); await w.close();
      return "saved";
    }catch(e){ if(e.name==="AbortError") return "cancelled"; }
  }
  downloadBlob(blob, name);
  return "downloaded";
}
// Save several files: choose one folder for all of them where the browser allows it.
async function saveFiles(files){
  if(files.length===1) return saveBlob(files[0], files[0].name);
  if(window.showDirectoryPicker){
    try{
      const dir = await window.showDirectoryPicker({mode:"readwrite", id:"otlp-save", startIn:"documents"});
      for(const f of files){ const h = await dir.getFileHandle(f.name, {create:true}); const w = await h.createWritable(); await w.write(f); await w.close(); }
      return "saved";
    }catch(e){ if(e.name==="AbortError") return "cancelled"; }
  }
  files.forEach((f,i)=>setTimeout(()=>downloadBlob(f, f.name), i*350));
  return "downloaded";
}
function savedToast(what, how){
  if(how==="saved") toast(`${what} saved`);
  else if(how==="downloaded") toast(`${what} saved to your Downloads folder.` + (IS_ANDROID ? " " + ANDROID_SAVE_TIP : ""), null, null, IS_ANDROID ? 7000 : 3200);
}
$("xlsxbtn").addEventListener("click", async ()=>{
  const blob = buildXlsx(); if(!blob) return;
  savedToast("Excel file", await saveBlob(blob, fileName("xlsx")));
});

/* ---- PDF of the hospital list (jsPDF + AutoTable, bundled for offline use) ---- */
const XLSX_COL_WIDTHS = [26,13.8,8.4,11.2,23,30.2,11,11,15.4,14.4,10,10,10,22,25.7];
function buildPdf(){
  const b = dateBits(); if(!b){ toast("Set the list date first."); return null; }
  if(!cases.length){ toast("No cases to export."); return null; }
  if(!window.jspdf){ toast("The PDF maker didn't load. Reopen the app and try again."); return null; }
  const doc = new window.jspdf.jsPDF({orientation:"landscape", unit:"pt", format:"legal"});
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 22.7;
  const site = $("site").value;
  doc.setFont("helvetica","bold"); doc.setTextColor(0);
  doc.setFontSize(13);
  doc.text(settings.head1 || "", W/2, M+12, {align:"center"});
  doc.text(settings.head2 || "", W/2, M+28, {align:"center"});
  doc.setFontSize(12);
  doc.text(`SURGERIES TO BE DONE  @ ${site} SITE`, M, M+52);
  doc.setFontSize(11.5);
  doc.text(`SURGEONS: ${surgeonsText()}`, M, M+70);
  doc.text(`DATE: ${b.day}, ${b.month} ${b.dnum}, ${b.year}`, W-M, M+70, {align:"right"});
  doc.setLineWidth(0.8); doc.line(M, M+74, W-M, M+74);

  const scale = (W-2*M) / XLSX_COL_WIDTHS.reduce((a,c)=>a+c,0);
  const columnStyles = {}; XLSX_COL_WIDTHS.forEach((w,i)=>{ columnStyles[i] = {cellWidth:w*scale}; });
  const head = [
    [{content:"NAME",rowSpan:2},{content:"DOC #/DOB",rowSpan:2},{content:"AGE",rowSpan:2},{content:"WARD",rowSpan:2},
     {content:"DIAGNOSIS",rowSpan:2},{content:"SURGICAL PROCEDURE",rowSpan:2},
     {content:"STATUS",colSpan:2},{content:"OUTCOME",colSpan:2},{content:"PROCEDURE TIMES",colSpan:3},
     {content:"REASON FOR CANCELLATION",rowSpan:2},{content:"NAME OF PRIMARY ATTENDING SURGEON /ANAESTHEIST",rowSpan:2}],
    ["PRIVATE","PUBLIC","COMPLETED","CANCELLED","EST (MIN)","START","END"],
  ];
  const body = cases.map(cs=>[cs.name, cs.doc, cs.age, cs.ward, cs.dx, cs.proc+(cs.ana?` (${cs.ana})`:""),
    cs.status==="PRIVATE"?"√":"", cs.status==="PUBLIC"?"√":"", "", "", cs.est, "", "", "", ""]);
  doc.autoTable({
    startY: M+84, head, body, theme:"grid", margin:{left:M, right:M, bottom:M},
    styles:{font:"helvetica", fontSize:9, textColor:0, lineColor:0, lineWidth:0.6, halign:"center", valign:"middle", cellPadding:3, overflow:"linebreak"},
    headStyles:{fontStyle:"bold", fillColor:[255,255,255], textColor:0, fontSize:8.5, cellPadding:2.5},
    bodyStyles:{minCellHeight:30, fillColor:[255,255,255]},
    columnStyles,
    // the standard PDF font has no tick symbol, so draw one
    didParseCell: d=>{ if(d.section==="body" && (d.column.index===6 || d.column.index===7) && d.cell.raw==="√"){ d.cell.text = [""]; d.cell.tick = true; } },
    didDrawCell: d=>{
      if(!d.cell.tick) return;
      const cx = d.cell.x + d.cell.width/2, cy = d.cell.y + d.cell.height/2;
      doc.setLineWidth(1.4); doc.line(cx-5, cy, cx-1.5, cy+4); doc.line(cx-1.5, cy+4, cx+6, cy-5);
    },
  });

  let y = doc.lastAutoTable.finalY + 26;
  if(y + 4*22 > H - M){ doc.addPage(); y = M + 20; }
  doc.setFont("helvetica","bold"); doc.setFontSize(9.5);
  const left = ["DEPARTMENTAL SISTER/DESIGNATE_______________________","CONSULTANT SURGEON_______________________________","DEPARTMENTAL SISTER/DESIGNATE_______________________"];
  const right = ["ANESTHESIST_____________________________","S.M.O. SIGNATURE  (PRE)____________________","S.M.O. SIGNATURE (POST)___________________","ANAESTHESIST __________________________"];
  left.forEach((t,i)=>doc.text(t, M+150, y+i*22));
  right.forEach((t,i)=>doc.text(t, W/2+60, y+i*22));
  doc.setProperties({title: fileName("pdf").replace(/\.pdf$/,""), subject:"Operating theatre list", creator:"OT List Pro"});
  return doc.output("blob");
}
$("pdfbtn").addEventListener("click", async ()=>{
  const blob = buildPdf(); if(!blob) return;
  savedToast("PDF", await saveBlob(blob, fileName("pdf")));
});

/* ---- email: hand the chosen files to the device's own email app ---- */
// Browsers only let web apps pass some file types to other apps (PDF usually yes, Excel often no), so check each file.
// Android browsers (Chrome, Edge, Samsung Internet) say Excel files can be shared, then refuse with
// "NotAllowedError: Permission denied". So on Android, and anywhere that has refused it before, treat Excel as not shareable.
function excelRefusedHere(){ try{ return localStorage.getItem("otlp.excelShareRefused")==="1"; }catch(_){ return false; } }
function markExcelRefused(){ try{ localStorage.setItem("otlp.excelShareRefused","1"); }catch(_){} }
function canShareOne(f){
  if(f.name.endsWith(".xlsx") && (IS_ANDROID || excelRefusedHere())) return false;
  try{ return !!(navigator.canShare && navigator.canShare({files:[f]})); }catch(e){ return false; }
}

/* a simple question box */
function choose(title, html, options){
  return new Promise(resolve=>{
    const d = $("dlg"); let done = false;
    const finish = v=>{ if(done) return; done = true; if(d.open) d.close(); resolve(v); };
    $("dlg-title").textContent = title; $("dlg-body").innerHTML = html;
    const box = $("dlg-actions"); box.innerHTML = "";
    options.forEach(o=>{
      const b = document.createElement("button");
      b.className = "btn tap " + (o.primary ? "btn-primary" : o.ghost ? "btn-ghost" : "btn-secondary");
      b.textContent = o.label; b.onclick = ()=>finish(o.value);
      box.appendChild(b);
    });
    // Esc / back button = cancel. (Not the "close" event: it arrives late and would shut the next box.)
    d.oncancel = e=>{ e.preventDefault(); finish(null); };
    d.showModal();
  });
}
function emailSubject(){
  const b = dateBits();
  return `OT List – ${$("site").value} – ${b ? `${b.day.charAt(0)+b.day.slice(1).toLowerCase()} ${b.dnum} ${b.monthTitle} ${b.year}` : ""}`;
}
function emailBody(){
  const b = dateBits();
  const total = cases.reduce((s,c)=>s+(parseInt(c.est,10)||0),0);
  return `Good day,\n\nPlease find attached the operating theatre list for ${$("site").value}, ${b ? b.pretty : ""} `+
         `(${cases.length} case${cases.length===1?"":"s"}, ${fmtHM(total)}).\n\nRegards,\n${settings.user || ""}`.trimEnd();
}
["att-xlsx","att-pdf"].forEach(id=>$(id).addEventListener("change", ()=>{
  settings.attachXlsx = $("att-xlsx").checked ? "1" : "0";
  settings.attachPdf  = $("att-pdf").checked ? "1" : "0";
  saveSettings(settings);
}));
// Remember the last sharing problem so it can be shown in Settings → About this device.
function noteShareProblem(e){
  const msg = `${e && e.name || "Error"}: ${e && e.message || "no details"}`;
  try{ localStorage.setItem("otlp.lastShareError", new Date().toLocaleString()+" · "+msg); }catch(_){}
  return msg;
}
// Try the share menu: first with subject and message, then with the files alone
// (some devices refuse files + text together). Returns "shared", "closed" or the error.
// Some devices refuse a file when the subject/message contain certain characters (long dashes,
// line breaks). Try simpler versions in turn, and remember which one this device accepts.
const SHARE_STYLES = [
  {id:"full",     label:"subject and message",                  make:f=>({files:f, title:emailSubject(), text:emailBody()})},
  {id:"plain",    label:"subject and message (plain hyphens)",  make:f=>({files:f, title:emailSubject().replace(/[–—]/g,"-"), text:emailBody().replace(/[–—]/g,"-")})},
  {id:"oneline",  label:"subject and message (single line)",    make:f=>({files:f, title:emailSubject().replace(/[–—]/g,"-"), text:emailBody().replace(/[–—]/g,"-").replace(/\s*\n+\s*/g," ")})},
  {id:"subject",  label:"subject only",                         make:f=>({files:f, title:emailSubject().replace(/[–—]/g,"-")})},
  {id:"fileonly", label:"file only",                            make:f=>({files:f})},
];
function shareStyleHere(){ try{ return localStorage.getItem("otlp.shareStyle"); }catch(_){ return null; } }
async function tryShare(files){
  const known = shareStyleHere();
  const order = known ? [SHARE_STYLES.find(x=>x.id===known), ...SHARE_STYLES.filter(x=>x.id!==known)].filter(Boolean) : SHARE_STYLES;
  let last;
  for(const st of order){
    try{
      await navigator.share(st.make(files));
      try{ localStorage.setItem("otlp.shareStyle", st.id); }catch(_){}
      return "shared";
    }catch(e){
      if(e.name==="AbortError") return "closed";   // the person closed the menu
      last = e;
    }
  }
  return last;
}
async function shareFiles(files){
  let r = await tryShare(files);
  if(r==="shared" || r==="closed") return true;
  // Refused with an Excel file included: that's the usual cause. Remember it and offer the other choices.
  const xl = files.filter(f=>f.name.endsWith(".xlsx")), rest = files.filter(f=>!f.name.endsWith(".xlsx"));
  if(r && r.name==="NotAllowedError" && xl.length && rest.length){
    noteShareProblem(r); markExcelRefused();
    return partialShare(rest, xl);
  }
  // Often the menu just needs a fresh tap (e.g. after a Save window): ask once.
  const go = await choose("Open the share menu", "<p>Tap <b>Share</b>, then choose Gmail, Outlook, WhatsApp, Drive or another app.</p>",
    [{label:"Share", value:true, primary:true},{label:"Cancel", value:false, ghost:true}]);
  if(!go) return true;
  r = await tryShare(files);
  if(r==="shared" || r==="closed") return true;
  const msg = noteShareProblem(r);
  const next = await choose("The share menu didn't open",
    `<p>This device refused to open the share menu.</p><p class="errline">Reason given: <code>${esc(msg)}</code></p>`+
    `<p>You can save the files instead and send them yourself. Please also tell your app supplier the reason above.</p>`,
    [{label:"Save the files instead", value:"save", primary:true},{label:"Close", value:null, ghost:true}]);
  if(next==="save") savedToast(files.map(kindOf).join(" and ").replace(/^./,c=>c.toUpperCase()), await saveFiles(files));
  return true;
}
const kindOf = f=> f.name.endsWith(".pdf") ? "PDF" : "Excel file";
const UA = navigator.userAgent;
const IS_ANDROID_CHROME = IS_ANDROID && /Chrome\//.test(UA) && !/SamsungBrowser|EdgA|OPR|Firefox|; wv\)/.test(UA);
function browserName(){
  return /SamsungBrowser/.test(UA) ? "Samsung Internet" : /EdgA?\//.test(UA) ? "Microsoft Edge" : /Firefox\//.test(UA) ? "Firefox"
       : /OPR\//.test(UA) ? "Opera" : /; wv\)/.test(UA) ? "an in-app browser" : /Chrome\//.test(UA) ? "Chrome" : /Safari\//.test(UA) ? "Safari" : "this browser";
}
function openInChrome(){
  const url = location.href.split("#")[0];
  location.href = `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

// Some files can be shared and some can't: ask what to do. Each choice is a fresh tap, which the share menu needs.
async function partialShare(ok, blocked){
  const okNames = ok.map(kindOf).join(" and "), blockedNames = blocked.map(kindOf).join(" and ");
  const choice = await choose(`The ${blockedNames} can't be shared from here`,
    `<p>This device lets the app share the <b>${okNames}</b>, but not the <b>${blockedNames}</b>.</p><p>What would you like to do?</p>`,
    [{label:`Share the ${okNames} only`, value:"ok", primary:true},
     {label:`Save the ${blockedNames}, then share`, value:"save"},
     {label:"Cancel", value:null, ghost:true}]);
  if(!choice) return true;
  if(choice==="save"){
    const how = await saveFiles(blocked);
    if(how==="cancelled") return true;
    const go = await choose(`${blockedNames.charAt(0).toUpperCase()+blockedNames.slice(1)} saved`,
      `<p>${how==="downloaded" ? `It's in your <b>Downloads</b> folder.${IS_ANDROID ? " "+ANDROID_SAVE_TIP : ""}` : "It's in the folder you chose."}</p>`+
      `<p>Next, the share menu opens with the <b>${okNames}</b>. If you choose email, add the saved <b>${blockedNames}</b> with the paper-clip button.</p>`,
      [{label:"Share", value:true, primary:true},{label:"Cancel", value:false, ghost:true}]);
    if(!go) return true;
  }
  return shareFiles(ok);
}

$("emailbtn").addEventListener("click", async ()=>{
  const wantX = $("att-xlsx").checked, wantP = $("att-pdf").checked;
  if(!wantX && !wantP){ toast("Tick Excel, PDF or both to include."); return; }
  const files = [];
  if(wantX){ const blob = buildXlsx(); if(!blob) return; files.push(new File([blob], fileName("xlsx"), {type:XLSX_MIME})); }
  if(wantP){ const blob = buildPdf();  if(!blob) return; files.push(new File([blob], fileName("pdf"),  {type:"application/pdf"})); }
  const ok = files.filter(canShareOne), blocked = files.filter(f=>!canShareOne(f));

  // 1. Everything can be shared: open the share menu straight away.
  if(!blocked.length){ await shareFiles(files); return; }

  const blockedNames = blocked.map(kindOf).join(" and ");

  // 2. Some files can be shared (usually the PDF) and some can't (usually Excel): ask.
  if(ok.length){ await partialShare(ok, blocked); return; }

  // 3. This browser can't open the share menu with files at all.
  if(IS_ANDROID && !IS_ANDROID_CHROME){
    const choice = await choose("The share menu isn't available here",
      `<p>OT List Pro is running in <b>${browserName()}</b>, which doesn't let apps share files.</p>`+
      `<p>In <b>Chrome</b> it can share straight to Gmail, Outlook, WhatsApp, Drive and more. Tap <b>Open in Chrome</b>, then install the app from Chrome's ⋮ menu so it always opens there.</p>`,
      [{label:"Open in Chrome", value:"chrome", primary:true},
       {label:`Save the ${blockedNames} instead`, value:"save"},
       {label:"Cancel", value:null, ghost:true}]);
    if(choice==="chrome"){ openInChrome(); return; }
    if(choice==="save") savedToast(blockedNames.charAt(0).toUpperCase()+blockedNames.slice(1), await saveFiles(files));
    return;
  }
  const choice = await choose("The share menu isn't available here",
    `<p>${browserName()==="this browser" ? "This browser" : browserName()} doesn't let apps share files.</p><p>You can save the <b>${blockedNames}</b> to a folder you choose and send ${files.length>1?"them":"it"} yourself.</p>`,
    [{label:`Save the ${blockedNames}`, value:"save", primary:true},
     {label:"Save and open a new email", value:"mail"},
     {label:"Cancel", value:null, ghost:true}]);
  if(!choice) return;
  const how = await saveFiles(files);
  if(how==="cancelled") return;
  if(choice==="mail"){
    location.href = `mailto:?subject=${encodeURIComponent(emailSubject())}&body=${encodeURIComponent(emailBody())}`;
    toast(`Saved. Attach the ${blockedNames} to the new email with the paper-clip button.`, null, null, 7000);
  } else savedToast(blockedNames.charAt(0).toUpperCase()+blockedNames.slice(1), how);
});

/* ============ check for updates ============ */
let swReg = null, applyUpdate = null, updateRequested = false;
async function checkForUpdates(){
  if(!swReg){ toast("Updates can be checked once the app has been opened from its web link."); return; }
  if(!navigator.onLine){ toast("You're offline. Connect to the internet, then check again."); return; }
  const btn = $("updatebtn"); if(btn){ btn.disabled = true; btn.textContent = "Checking…"; }
  try{
    await swReg.update();
    const w = swReg.waiting || swReg.installing;
    if(w){
      toast("A new version was found. Updating…", null, null, 6000);
      if(w.state==="installed") applyUpdate(w, true);   // otherwise the update handler applies it when ready
    } else toast(`You have the latest version (${APP_VERSION}).`);
  }catch(e){ toast("Couldn't check for updates. Try again in a moment."); }
  finally{ if(btn){ btn.disabled = false; btn.textContent = "Check for updates"; } }
}
document.addEventListener("click", e=>{ if(e.target.closest("[data-update]")) checkForUpdates(); });

$("newlist").addEventListener("click", ()=>{
  cases = []; sourceText = ""; $("pastebox").value = ""; $("listdate").value = ""; $("session").value = settings.session;
  resetDrop();
  setMsg(""); go("upload");
});

/* ============ settings ============ */
const SFIELDS = ["user","head1","head2","surgeons","team","prefix","sites","ward","status","session"];
function renderSettings(){
  SFIELDS.forEach(k=>{ $("s-"+k).value = settings[k]; });
  $("version").textContent = "OT List Pro · version "+APP_VERSION;
  // what this device allows: helps when something behaves differently on one phone or computer
  const yes = v=> v ? "Yes" : "No";
  const ua = navigator.userAgent;
  const browser = /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Edg\//.test(ua) ? "Microsoft Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Other";
  const os = /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /iPhone|iPad|Mac OS/.test(ua) ? "Apple" : /Linux/.test(ua) ? "Linux" : "Other";
  const rows = [
    ["App version", APP_VERSION],
    ["Device", `${os} · ${browser}`],
    ["Opened as installed app", yes(matchMedia("(display-mode: standalone)").matches)],
    ["Can attach PDF to email", yes(canShareOne(new File([""],"x.pdf",{type:"application/pdf"})))],
    ["Can attach Excel to email", yes(canShareOne(new File([""],"x.xlsx",{type:XLSX_MIME})))],
    ["“Save as” window for files", yes(!!window.showSaveFilePicker)],
    ["Share menu available", yes(!!navigator.share)],
    ["Sharing works with", (()=>{ const st = SHARE_STYLES.find(x=>x.id===shareStyleHere()); return st ? st.label : "Not shared yet"; })()],
    ["Last share problem", (()=>{ try{ return localStorage.getItem("otlp.lastShareError") || "None"; }catch(_){ return "None"; } })()],
  ];
  $("devinfo").innerHTML = rows.map(([k,v])=>`<div><span>${k}</span><b>${esc(v)}</b></div>`).join("");
}
$("s-save").addEventListener("click", ()=>{
  SFIELDS.forEach(k=>{ settings[k] = $("s-"+k).value.trim(); });
  if(!siteList().length) settings.sites = DEFAULTS.sites;
  if(!(parseInt(settings.session,10)>0)) settings.session = DEFAULTS.session;
  saveSettings(settings);
  $("session").value = settings.session;
  toast("Settings saved");
  go(lastScreen);
});
/* ---- Sharing check: which kinds of file does this device let the app share? ---- */
function testPdf(){
  if(window.jspdf){ const d = new window.jspdf.jsPDF(); d.text("OT List Pro sharing test", 20, 20); return d.output("blob"); }
  return new Blob(["%PDF-1.4\n%%EOF"], {type:"application/pdf"});
}
function testPng(){
  return new Promise(res=>{ const c = document.createElement("canvas"); c.width = c.height = 32;
    const x = c.getContext("2d"); x.fillStyle = "#0E8F9B"; x.fillRect(0,0,32,32); c.toBlob(b=>res(b), "image/png"); });
}
const SHARE_TESTS = {
  pdf:    async ()=>({files:[new File([testPdf()], "OT_List_test.pdf", {type:"application/pdf"})]}),
  pdfmsg: async ()=>({files:[new File([testPdf()], "OT_List_test.pdf", {type:"application/pdf"})], title:"OT List test", text:"Sharing test with a message"}),
  txt:    async ()=>({files:[new File(["OT List Pro sharing test"], "OT_List_test.txt", {type:"text/plain"})]}),
  png:    async ()=>({files:[new File([await testPng()], "OT_List_test.png", {type:"image/png"})]}),
};
const PNG_READY = testPng();   // make the picture in advance, so the tap goes straight to the share menu
document.addEventListener("click", async e=>{
  const b = e.target.closest("[data-sharetest]"); if(!b) return;
  const kind = b.dataset.sharetest, out = b.querySelector(".res");
  let data;
  if(kind==="png") data = {files:[new File([await PNG_READY], "OT_List_test.png", {type:"image/png"})]};
  else data = await SHARE_TESTS[kind]();
  if(!navigator.share){ out.textContent = "No share menu"; out.className = "res bad"; return; }
  try{ await navigator.share(data); out.textContent = "✓ Opened"; out.className = "res good"; }
  catch(err){
    if(err.name==="AbortError"){ out.textContent = "✓ Opened (closed)"; out.className = "res good"; return; }
    out.textContent = "✗ " + err.name + ": " + err.message; out.className = "res bad"; noteShareProblem(err);
  }
});

$("sharetest").addEventListener("click", async ()=>{
  if(!navigator.share){ toast("This browser has no share menu at all.", null, null, 6000); return; }
  try{ await navigator.share({title:"OT List Pro", text:"Share menu test from OT List Pro"}); toast("The share menu works on this device."); }
  catch(e){
    if(e.name==="AbortError"){ toast("The share menu opened. You closed it, which is fine."); return; }
    toast("The share menu didn't open: "+noteShareProblem(e), null, null, 8000); renderSettings();
  }
});
$("s-reset").addEventListener("click", ()=>{
  if(!confirm("Reset all settings to the original Firm C values?")) return;
  settings = Object.assign({}, DEFAULTS); saveSettings(settings); renderSettings(); toast("Settings reset");
});

/* ============ leaving with an unfinished list ============ */
window.addEventListener("beforeunload", e=>{ if(cases.length){ e.preventDefault(); e.returnValue = ""; } });

/* ============ install + offline + updates ============ */
let installEvt = null;
window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); installEvt = e; $("installbtn").hidden = false; });
$("installbtn").addEventListener("click", async ()=>{
  if(!installEvt) return;
  installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("installbtn").hidden = true;
});
window.addEventListener("appinstalled", ()=>{ $("installbtn").hidden = true; toast("OT List Pro installed"); });

if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  navigator.serviceWorker.register("sw.js").then(reg=>{
    // New version found: switch to it straight away, unless a list is being worked on (then ask, so nothing is lost).
    swReg = reg;
    const switchTo = w=>{ updateRequested = true; w.postMessage("skipWaiting"); };
    const offer = applyUpdate = (w, asked) => {
      if(!cases.length){ switchTo(w); return; }
      toast("A new version of OT List Pro is ready. Updating clears the list on screen.", "Update now", ()=>switchTo(w));
    };
    if(reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", ()=>{
      const w = reg.installing;
      w && w.addEventListener("statechange", ()=>{ if(w.state==="installed" && navigator.serviceWorker.controller) offer(w); });
    });
    // look for a new version whenever the app is opened or brought back to the front
    const check = ()=>reg.update().catch(()=>{});
    check();
    document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") check(); });
    setInterval(check, 60*60*1000);
  }).catch(()=>{});
  // Reload only when this app has just switched to a NEW version. On the very first visit the offline
  // worker also "takes over", and reloading then would wipe a list the person has already started.
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", ()=>{
    if(!updateRequested || reloading) return;
    reloading = true; cases = []; location.reload();
  });
}

/* ============ start ============ */
$("session").value = settings.session;
go((location.hash.slice(1)) || "home", true);
