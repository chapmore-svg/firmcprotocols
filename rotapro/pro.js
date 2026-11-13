/* Rota Pro — screens, team & settings, PDF, sharing, install and updates.
   The rota rules (duty cycle, day-offs, audit, overtime import, Excel) live in app.js, unchanged
   from the Firm C Rota app v5.2.1 apart from the settings hooks noted there. */

const APP_VERSION = "1.0.0";
const $id = id => document.getElementById(id);
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/* ============ settings (this device) ============ */
const PRO_DEFAULTS = {user:"Dr. Longmore", title:"GENERAL SURGERY FIRM C ROTA", hospital:"Cornwall Regional Hospital", prefix:"GenSx_C", attachPdf:"1", attachXlsx:"0"};
function proSettings(){ try{ return Object.assign({}, PRO_DEFAULTS, JSON.parse(localStorage.getItem("rotapro.settings")||"{}")); }catch(e){ return {...PRO_DEFAULTS}; } }
function saveProSettings(o){ try{ localStorage.setItem("rotapro.settings", JSON.stringify(o)); }catch(e){} }
function saveTeam(t){ try{ localStorage.setItem("rotapro.team", JSON.stringify(t)); }catch(e){} }
function teamIsEmpty(){ const t = teamDefaults(); return ALL_EDIT.every(r=>!String(t[r.key]||"").trim()); }

/* ============ tactile feedback ============ */
document.addEventListener("pointerdown", e=>{
  const el = e.target.closest(".tap, .btn"); if(!el || el.disabled) return;
  try{ navigator.vibrate && navigator.vibrate(8); }catch(_){}
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2.2;
  const s = document.createElement("span"); s.className = "ripple";
  s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-r.left-size/2}px;top:${e.clientY-r.top-size/2}px`;
  el.appendChild(s); s.addEventListener("animationend", ()=>s.remove());
}, {passive:true});

/* ============ navigation ============ */
const PANES = ["home","setup","rota","audit","export","settings"];
let lastPane = "home";
function goTab(t, replace){
  if(t==="preview") t = "export";
  if(t==="check") t = "audit";
  if(!PANES.includes(t)) t = "home";
  if((t==="rota"||t==="audit"||t==="export") && !S.built) t = "setup";
  const url = "#"+t;
  if(location.hash !== url){ replace ? history.replaceState(null,"",url) : history.pushState(null,"",url); }
  showPane(t);
}
function showPane(t){
  PANES.forEach(x=>{ const el = $id("pane-"+x); if(el) el.style.display = x===t ? "" : "none"; });
  const flow = ["setup","rota","audit","export"], idx = flow.indexOf(t);
  $id("stepper").hidden = idx < 0;
  flow.forEach((x,i)=>{
    const b = $id(x==="audit" ? "tab-check" : "tab-"+x);
    b.classList.toggle("active", i===idx); b.classList.toggle("done", i<idx);
    b.disabled = i>0 && !S.built;
  });
  if(t!=="settings") lastPane = t;
  if(t==="home") renderHome();
  if(t==="setup") buildNamesForm();
  if(t==="rota") updateRotaTitle();
  if(t==="export") renderExport();
  if(t==="settings") renderSettingsPane();
  window.scrollTo(0,0);
}
window.addEventListener("popstate", ()=>{
  let t = location.hash.slice(1); if(!PANES.includes(t)) t = "home";
  if((t==="rota"||t==="audit"||t==="export") && !S.built) t = "setup";
  showPane(t);
});

/* ============ home ============ */
function renderHome(){
  const st = proSettings(), h = new Date().getHours();
  const part = h<12 ? "Good morning" : h<17 ? "Good afternoon" : "Good evening";
  $id("greeting").textContent = st.user ? `${part}, ${st.user}` : part;
  $id("hero-team").textContent = `${titleCase(rotaTitle())} · ${hospitalName()}`;
  $id("hero-continue-label").textContent = S.built ? `Continue the ${MONTHS[S.month]} ${S.year} rota` : "Start a rota";
  $id("team-alert").hidden = !teamIsEmpty();
  $id("home-version").textContent = "Version " + APP_VERSION;
}
function titleCase(s){ return String(s).toLowerCase().replace(/\b([a-z])/g, c=>c.toUpperCase()).replace(/\bFirm ([a-z])\b/i, (m,c)=>"Firm "+c.toUpperCase()); }
function continueRota(){ goTab(S.built ? "rota" : "setup"); }
function newMonth(){
  if(S.built){
    let m = S.month+1, y = S.year; if(m>11){ m = 0; y++; }
    ensureYear(y); $id("selM").value = m; $id("selY").value = y;
    stateChange();
  }
  goTab("setup");
}
function updateRotaTitle(){ $id("rota-title").textContent = S.built ? `${MONTHS[S.month]} ${S.year} rota` : "Rota"; }

/* ============ years: always a few either side of today (the old list stopped at 2027) ============ */
function fillYears(){
  const sel = $id("selY"), y0 = new Date().getFullYear();
  sel.innerHTML = "";
  for(let y=y0-1; y<=y0+3; y++) sel.add(new Option(String(y), String(y)));
}
function ensureYear(y){ const sel = $id("selY"); if(![...sel.options].some(o=>+o.value===y)){ sel.add(new Option(String(y), String(y))); [...sel.options].sort((a,b)=>a.value-b.value).forEach(o=>sel.add(o)); } }

/* ============ team & settings ============ */
function roleLabel(r){ const suffix = r.key==="mo1a"?" (a)":r.key==="mo1b"?" (b)":r.key==="con1"?" 1":r.key==="con2"?" 2":""; return r.label.replace("CON","Consultant")+suffix; }
function renderSettingsPane(){
  const st = proSettings(), team = teamDefaults();
  $id("s-user").value = st.user; $id("s-title").value = st.title; $id("s-hospital").value = st.hospital; $id("s-prefix").value = st.prefix;
  $id("teamForm").innerHTML = ALL_EDIT.map(r=>`<label class="field"><span class="lbl">${roleLabel(r)}</span>
    <input type="text" id="t-${r.key}" value="${escHtml(team[r.key]||"")}" placeholder="Name, or blank if vacant" autocapitalize="characters"></label>`).join("");
  $id("version").textContent = "Rota Pro · version " + APP_VERSION;
  renderDevInfo();
}
function saveSettingsForm(){
  const st = proSettings();
  ["user","title","hospital","prefix"].forEach(k=>{ st[k] = $id("s-"+k).value.trim(); });
  saveProSettings(st);
  const team = {}; ALL_EDIT.forEach(r=>{ team[r.key] = $id("t-"+r.key).value.trim().toUpperCase(); });
  saveTeam(team);
  if(!S.built){ S.names = teamDefaults(); buildNamesForm(); }
  toast("Saved ✓");
  goTab(lastPane==="settings" ? "home" : lastPane);
}

/* Generate: warn when no names are entered; remember the team the first time. */
const _generate = generate;
generate = async function(){
  ALL_EDIT.forEach(r=>{ const el = $id("n-"+r.key); if(el) S.names[r.key] = el.value.trim(); });
  if(ALL_EDIT.every(r=>!String(S.names[r.key]||"").trim())){
    const go = await choose("No names entered", "<p>Every position is blank, so the rota will show them all as vacant.</p><p>Add your team first?</p>",
      [{label:"Add my team", value:"team", primary:true},{label:"Generate anyway", value:"go"},{label:"Cancel", value:null, ghost:true}]);
    if(go==="team"){ goTab("settings"); return; }
    if(go!=="go") return;
  }
  _generate();
  if(teamIsEmpty()){ const t = {}; ALL_EDIT.forEach(r=>{ t[r.key] = String(S.names[r.key]||"").toUpperCase(); }); saveTeam(t); }
};
const _renderRota = renderRota;
renderRota = function(){ _renderRota(); updateRotaTitle(); };

/* ============ saving files ============ */
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const ANDROID_SAVE_TIP = "To choose where files go, turn on “Ask where to save files” in Chrome: ⋮ → Settings → Downloads.";
function downloadBlob(blob, name){
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}
function pickerTypes(name){
  return name.endsWith(".pdf") ? [{description:"PDF document", accept:{"application/pdf":[".pdf"]}}]
                               : [{description:"Excel workbook", accept:{[XLSX_MIME]:[".xlsx"]}}];
}
async function saveBlob(blob, name){
  if(window.showSaveFilePicker){
    try{
      const h = await window.showSaveFilePicker({suggestedName:name, types:pickerTypes(name), id:"rotapro-save", startIn:"documents"});
      const w = await h.createWritable(); await w.write(blob); await w.close(); return "saved";
    }catch(e){ if(e.name==="AbortError") return "cancelled"; }
  }
  downloadBlob(blob, name); return "downloaded";
}
async function saveFiles(files){
  if(files.length===1) return saveBlob(files[0], files[0].name);
  if(window.showDirectoryPicker){
    try{
      const dir = await window.showDirectoryPicker({mode:"readwrite", id:"rotapro-save", startIn:"documents"});
      for(const f of files){ const h = await dir.getFileHandle(f.name, {create:true}); const w = await h.createWritable(); await w.write(f); await w.close(); }
      return "saved";
    }catch(e){ if(e.name==="AbortError") return "cancelled"; }
  }
  files.forEach((f,i)=>setTimeout(()=>downloadBlob(f, f.name), i*350));
  return "downloaded";
}
function savedToast(what, how){
  if(how==="saved") toast(`${what} saved ✓`);
  else if(how==="downloaded") toast(`${what} saved to Downloads ✓`);
}

/* ============ Excel and PDF files ============ */
function excelFile(){
  const r = makeExcelBook(); if(!r) return null;
  const buf = XLSX.write(r.wb, {bookType:"xlsx", type:"array"});
  return new File([buf], r.fname, {type:XLSX_MIME});
}
async function downloadExcel(){ const f = excelFile(); if(f) savedToast("Excel file", await saveBlob(f, f.name)); }

// one printed row's ten cells, worked out exactly as the preview / print does
function rotaCells(d){
  const isoD = iso(d.date), w = wd(d.date), hol = isHoliday(isoD);
  const out = [{t:`${String(d.date.getDate()).padStart(2,"0")}-${MON3[d.date.getMonth()]}`, b:d.duty}, {t:DAYFULL[w], b:d.duty}];
  ROLES.forEach(r=>{
    const nm = nameOn(isoD, r.key);
    if(!nm){ const {ext,sym} = getE(isoD, r.key); out.push(sym==="$"&&ext ? {t:`${ext} $${hol?" Ⓗ":""}`, b:d.duty} : {t:"", b:false}); return; }
    const {sym,ovt,cover,mark} = getE(isoD, r.key);
    const isLv = ["DOH","DL","VL","SL","EDL"].includes(sym);
    out.push({t:cellText(nm,sym,ovt,cover,mark,d.duty,hol), b:d.duty && (!isLv || !!cover)});
  });
  CONS.forEach(r=>{
    const {sym,mark} = getE(isoD, r.key);
    out.push({t:cellText(S.names[r.key], ["DL","VL","SL","EDL"].includes(sym)?sym:"", "", "", mark, false, hol), b:true});
  });
  return out;
}
function pdfFileName(){ return `${filePrefix()}_${MONTHS[S.month].toUpperCase()}_${S.year}_rota_BW.pdf`; }
function buildPdfFile(){
  if(!S.built){ toast("Generate the rota first"); return null; }
  if(!window.jspdf){ toast("The PDF maker didn't load. Reopen the app and try again."); return null; }
  const pdfText = s => String(s).replace(/Ⓗ/g, "(H)");   // the built-in PDF font has no Ⓗ
  const doc = new window.jspdf.jsPDF({orientation:"landscape", unit:"pt", format:"legal"});
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 18;
  doc.setTextColor(0); doc.setFont("helvetica","bold"); doc.setFontSize(15);
  doc.text(rotaTitle(), W/2, M+12, {align:"center"});
  doc.setFontSize(11); doc.text(`${MONTHS[S.month]} ${S.year}  |  ${hospitalName()}`, W/2, M+27, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(6.6);
  const legend = [
    "BOLD ROW = Emergency Duty (8am–8am next day)  |  Plain row = Regular hours (8am–4pm)",
    "NAME = No overtime  |  NAME+ = Overtime on regular day  |  NAME*+ = Overtime on Day Off 1 (Sat rate)  |  NAME**+ = Overtime on Day Off 2 (Sun rate)",
    "* = Day Off 1 worked (Sat rate)  |  ** = Day Off 2 worked (Sun rate)  |  DOH = Day Off Honoured (stayed home)  |  DL = Dept Leave  |  VL = Vacation Leave  |  SL = Sick Leave  |  EDL = Emergency Dept Leave",
    "(EOR) = End of Rotation  |  (SF) = Switched Firms  |  (AD) = Assumed Duties  |  (ROD) = Resumption of Duties  |  $ = emergency duty session (bracketed grade after a name = covering doctor's actual rank, if different)  |  (H) = Public Holiday worked",
  ];
  let y = M+37; legend.forEach(l=>{ doc.splitTextToSize(l, W-2*M).forEach(part=>{ doc.text(part, M, y); y += 7.4; }); });
  const wch = [11,14,20,20,20,20,20,20,14,16], scale = (W-2*M)/wch.reduce((a,c)=>a+c,0);
  const columnStyles = {}; wch.forEach((w,i)=>{ columnStyles[i] = {cellWidth:w*scale, halign:(i>=2&&i<=7)?"left":"center"}; });
  const body = [];
  S.days.forEach((d,i)=>{
    if(wd(d.date)===0 && i>0) body.push([{content:"", colSpan:10, styles:{fillColor:[153,153,153], fontSize:1, minCellHeight:3, cellPadding:0}}]);
    body.push(rotaCells(d).map(c=>({content:pdfText(c.t), styles:{fontStyle:c.b?"bold":"normal", fillColor:d.duty?[255,253,231]:[255,255,255]}})));
  });
  // Fit the whole rota on one page: 6-week months use the normal size, longer ones shrink a little.
  const weeks = S.days.length/7, rowsNeeded = S.days.length + 1 + (weeks-1)*0.35;
  const avail = (H - M - 22) - (y + 2);
  let fs = 7.4, pad = 1.15;
  if(rowsNeeded*(fs*1.15 + 2*pad) > avail*0.95){ pad = 0.8; fs = Math.max(5.5, ((avail*0.95)/rowsNeeded - 2*pad)/1.15); }
  doc.autoTable({
    startY: y+2, head:[["DATE","DAY","INTERN #1","INTERN #2","SHO","MO1","MO1","MO2","CON","CON"]], body, theme:"grid",
    margin:{left:M, right:M, bottom:M},
    styles:{font:"helvetica", fontSize:fs, textColor:0, lineColor:0, lineWidth:0.5, cellPadding:pad, valign:"middle", overflow:"linebreak"},
    headStyles:{fillColor:[232,232,232], textColor:0, fontStyle:"bold", halign:"center"},
    columnStyles,
  });
  let fy = doc.lastAutoTable.finalY + 14;
  if(fy > H-M){ doc.addPage(); fy = M+20; }
  doc.setFont("helvetica","normal"); doc.setFontSize(8.5);
  doc.text("Prepared by: ___________________________", M, fy);
  doc.text("Date: ____________________", W/2, fy, {align:"center"});
  doc.text("Approved by: ___________________________", W-M, fy, {align:"right"});
  doc.setProperties({title:`${rotaTitle()} – ${MONTHS[S.month]} ${S.year}`, creator:"Rota Pro"});
  return new File([doc.output("blob")], pdfFileName(), {type:"application/pdf"});
}
async function downloadPdf(){ const f = buildPdfFile(); if(f) savedToast("PDF", await saveBlob(f, f.name)); }

/* ============ export screen ============ */
function renderExport(){
  renderPreview();
  if(!S.built) return;
  const issues = runAudit(), duty = S.days.filter(d=>d.duty).length;
  $id("export-sub").textContent = `${MONTHS[S.month]} ${S.year} · ${S.days.length/7} weeks · ${duty} duty days · ${issues.length ? issues.length+" check issue"+(issues.length>1?"s":"") : "all checks pass ✓"}`;
  const st = proSettings();
  $id("att-pdf").checked = st.attachPdf==="1"; $id("att-xlsx").checked = st.attachXlsx==="1";
  const shP = canShareOne(new File([""],"x.pdf",{type:"application/pdf"})), shX = canShareOne(new File([""],"x.xlsx",{type:XLSX_MIME}));
  $id("share-help").innerHTML = (shP && shX)
    ? "Tap <b>Share the rota</b> and choose <b>WhatsApp</b>, <b>Gmail</b>, <b>Outlook</b>, <b>Drive</b> or another app. The ticked files go with it."
    : shP ? "Tap <b>Share the rota</b> and choose WhatsApp, Gmail, Drive or another app. On this device the <b>PDF</b> can be shared but the <b>Excel</b> file can't, so if Excel is ticked the app asks what you'd like to do."
    : "This browser can't open the share menu with files. Tap <b>Share the rota</b> to save the files instead and send them yourself.";
}
["att-pdf","att-xlsx"].forEach(id=>$id(id).addEventListener("change", ()=>{
  const st = proSettings(); st.attachPdf = $id("att-pdf").checked?"1":"0"; st.attachXlsx = $id("att-xlsx").checked?"1":"0"; saveProSettings(st);
}));

/* ============ sharing (same tested approach as OT List Pro) ============ */
function excelRefusedHere(){ try{ return localStorage.getItem("rotapro.excelShareRefused")==="1"; }catch(_){ return false; } }
function markExcelRefused(){ try{ localStorage.setItem("rotapro.excelShareRefused","1"); }catch(_){} }
// Android browsers say Excel can be shared, then refuse it ("Permission denied").
function canShareOne(f){
  if(f.name.endsWith(".xlsx") && (IS_ANDROID || excelRefusedHere())) return false;
  try{ return !!(navigator.canShare && navigator.canShare({files:[f]})); }catch(e){ return false; }
}
function choose(title, html, options){
  return new Promise(resolve=>{
    const d = $id("dlg"); let done = false;
    const finish = v=>{ if(done) return; done = true; if(d.open) d.close(); resolve(v); };
    $id("dlg-title").textContent = title; $id("dlg-body").innerHTML = html;
    const box = $id("dlg-actions"); box.innerHTML = "";
    options.forEach(o=>{
      const b = document.createElement("button");
      b.className = "btn tap " + (o.primary ? "btn-sky" : o.ghost ? "btn-ghost" : "btn-out");
      b.textContent = o.label; b.onclick = ()=>finish(o.value); box.appendChild(b);
    });
    d.oncancel = e=>{ e.preventDefault(); finish(null); };
    d.showModal();
  });
}
function shareSubject(){ return `${titleCase(rotaTitle())} – ${MONTHS[S.month]} ${S.year}`; }
function shareBody(){
  const f = S.days[0].date, l = S.days[S.days.length-1].date, fmt = d=>`${d.getDate()} ${MON3[d.getMonth()]}`;
  return `Good day,\n\nPlease find attached the ${titleCase(rotaTitle())} for ${MONTHS[S.month]} ${S.year} (${fmt(f)} – ${fmt(l)}).\n\nRegards,\n${proSettings().user||""}`.trimEnd();
}
function noteShareProblem(e){
  const msg = `${e && e.name || "Error"}: ${e && e.message || "no details"}`;
  try{ localStorage.setItem("rotapro.lastShareError", new Date().toLocaleString()+" · "+msg); }catch(_){}
  return msg;
}
// Some devices refuse a file when the subject/message has long dashes or line breaks: try simpler versions, remember what works.
const SHARE_STYLES = [
  {id:"full",     label:"subject and message",                 make:f=>({files:f, title:shareSubject(), text:shareBody()})},
  {id:"plain",    label:"subject and message (plain hyphens)", make:f=>({files:f, title:shareSubject().replace(/[–—]/g,"-"), text:shareBody().replace(/[–—]/g,"-")})},
  {id:"oneline",  label:"subject and message (single line)",   make:f=>({files:f, title:shareSubject().replace(/[–—]/g,"-"), text:shareBody().replace(/[–—]/g,"-").replace(/\s*\n+\s*/g," ")})},
  {id:"subject",  label:"subject only",                        make:f=>({files:f, title:shareSubject().replace(/[–—]/g,"-")})},
  {id:"fileonly", label:"file only",                           make:f=>({files:f})},
];
function shareStyleHere(){ try{ return localStorage.getItem("rotapro.shareStyle"); }catch(_){ return null; } }
async function tryShare(files){
  const known = shareStyleHere();
  const order = known ? [SHARE_STYLES.find(x=>x.id===known), ...SHARE_STYLES.filter(x=>x.id!==known)].filter(Boolean) : SHARE_STYLES;
  let last;
  for(const st of order){
    try{ await navigator.share(st.make(files)); try{ localStorage.setItem("rotapro.shareStyle", st.id); }catch(_){} return "shared"; }
    catch(e){ if(e.name==="AbortError") return "closed"; last = e; }
  }
  return last;
}
const kindOf = f=> f.name.endsWith(".pdf") ? "PDF" : "Excel file";
async function shareFiles(files){
  let r = await tryShare(files);
  if(r==="shared" || r==="closed") return;
  const xl = files.filter(f=>f.name.endsWith(".xlsx")), rest = files.filter(f=>!f.name.endsWith(".xlsx"));
  if(r && r.name==="NotAllowedError" && xl.length && rest.length){ noteShareProblem(r); markExcelRefused(); return partialShare(rest, xl); }
  const go = await choose("Open the share menu", "<p>Tap <b>Share</b>, then choose WhatsApp, Gmail, Drive or another app.</p>",
    [{label:"Share", value:true, primary:true},{label:"Cancel", value:false, ghost:true}]);
  if(!go) return;
  r = await tryShare(files);
  if(r==="shared" || r==="closed") return;
  const msg = noteShareProblem(r);
  const next = await choose("The share menu didn't open",
    `<p>This device refused to open the share menu.</p><p class="errline">Reason given: <code>${escHtml(msg)}</code></p><p>You can save the files instead and send them yourself.</p>`,
    [{label:"Save the files instead", value:"save", primary:true},{label:"Close", value:null, ghost:true}]);
  if(next==="save") savedToast("Files", await saveFiles(files));
}
async function partialShare(ok, blocked){
  const okN = ok.map(kindOf).join(" and "), blN = blocked.map(kindOf).join(" and ");
  const choice = await choose(`The ${blN} can't be shared from here`,
    `<p>This device lets the app share the <b>${okN}</b>, but not the <b>${blN}</b>.</p><p>What would you like to do?</p>`,
    [{label:`Share the ${okN} only`, value:"ok", primary:true},{label:`Save the ${blN}, then share`, value:"save"},{label:"Cancel", value:null, ghost:true}]);
  if(!choice) return;
  if(choice==="save"){
    const how = await saveFiles(blocked); if(how==="cancelled") return;
    const go = await choose(`${blN.charAt(0).toUpperCase()+blN.slice(1)} saved`,
      `<p>${how==="downloaded" ? `It's in your <b>Downloads</b> folder.${IS_ANDROID?" "+ANDROID_SAVE_TIP:""}` : "It's in the folder you chose."}</p><p>Next, the share menu opens with the <b>${okN}</b>. If you choose email, add the saved <b>${blN}</b> with the paper-clip button.</p>`,
      [{label:"Share", value:true, primary:true},{label:"Cancel", value:false, ghost:true}]);
    if(!go) return;
  }
  return shareFiles(ok);
}
const UA = navigator.userAgent;
const IS_ANDROID_CHROME = IS_ANDROID && /Chrome\//.test(UA) && !/SamsungBrowser|EdgA|OPR|Firefox|; wv\)/.test(UA);
function browserName(){
  return /SamsungBrowser/.test(UA) ? "Samsung Internet" : /EdgA?\//.test(UA) ? "Microsoft Edge" : /Firefox\//.test(UA) ? "Firefox"
       : /OPR\//.test(UA) ? "Opera" : /; wv\)/.test(UA) ? "an in-app browser" : /Chrome\//.test(UA) ? "Chrome" : /Safari\//.test(UA) ? "Safari" : "this browser";
}
$id("sharebtn").addEventListener("click", async ()=>{
  if(!S.built){ toast("Generate the rota first"); return; }
  const wantP = $id("att-pdf").checked, wantX = $id("att-xlsx").checked;
  if(!wantP && !wantX){ toast("Tick PDF, Excel or both"); return; }
  const files = [];
  if(wantP){ const f = buildPdfFile(); if(!f) return; files.push(f); }
  if(wantX){ const f = excelFile(); if(!f) return; files.push(f); }
  const ok = files.filter(canShareOne), blocked = files.filter(f=>!canShareOne(f));
  if(!blocked.length){ await shareFiles(files); return; }
  if(ok.length){ await partialShare(ok, blocked); return; }
  const blN = blocked.map(kindOf).join(" and ");
  if(IS_ANDROID && !IS_ANDROID_CHROME){
    const c = await choose("The share menu isn't available here",
      `<p>Rota Pro is running in <b>${browserName()}</b>, which doesn't let apps share files. In <b>Chrome</b> it can share to WhatsApp, Gmail, Drive and more.</p>`,
      [{label:"Open in Chrome", value:"chrome", primary:true},{label:`Save the ${blN} instead`, value:"save"},{label:"Cancel", value:null, ghost:true}]);
    if(c==="chrome"){ location.href = `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(location.href.split("#")[0])};end`; return; }
    if(c==="save") savedToast("Files", await saveFiles(files));
    return;
  }
  const c = await choose("The share menu isn't available here",
    `<p>This browser doesn't let apps share files. Save the <b>${blN}</b> to a folder you choose and send ${files.length>1?"them":"it"} yourself.</p>`,
    [{label:`Save the ${blN}`, value:true, primary:true},{label:"Cancel", value:null, ghost:true}]);
  if(c) savedToast("Files", await saveFiles(files));
});

/* ============ about this device ============ */
function renderDevInfo(){
  const yes = v=> v ? "Yes" : "No";
  const os = /Android/.test(UA) ? "Android" : /Windows/.test(UA) ? "Windows" : /iPhone|iPad|Mac OS/.test(UA) ? "Apple" : /Linux/.test(UA) ? "Linux" : "Other";
  const style = SHARE_STYLES.find(x=>x.id===shareStyleHere());
  const rows = [
    ["App version", APP_VERSION], ["Device", `${os} · ${browserName()}`],
    ["Opened as installed app", yes(matchMedia("(display-mode: standalone)").matches)],
    ["Can share a PDF", yes(canShareOne(new File([""],"x.pdf",{type:"application/pdf"})))],
    ["Can share an Excel file", yes(canShareOne(new File([""],"x.xlsx",{type:XLSX_MIME})))],
    ["“Save as” window for files", yes(!!window.showSaveFilePicker)],
    ["Sharing works with", style ? style.label : "Not shared yet"],
    ["Last share problem", (()=>{ try{ return localStorage.getItem("rotapro.lastShareError") || "None"; }catch(_){ return "None"; } })()],
  ];
  $id("devinfo").innerHTML = rows.map(([k,v])=>`<div><span>${k}</span><b>${escHtml(v)}</b></div>`).join("");
}

/* ============ install, offline, updates ============ */
let installEvt = null;
window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); installEvt = e; $id("installbtn").hidden = false; });
$id("installbtn").addEventListener("click", async ()=>{ if(!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $id("installbtn").hidden = true; });
window.addEventListener("appinstalled", ()=>{ $id("installbtn").hidden = true; toast("Rota Pro installed ✓"); });

let swReg = null, applyUpdate = null, updateRequested = false;
async function checkForUpdates(){
  if(!swReg){ toast("Updates can be checked once the app is opened from its web link"); return; }
  if(!navigator.onLine){ toast("You're offline. Connect, then check again."); return; }
  const btn = $id("updatebtn"); if(btn){ btn.disabled = true; btn.textContent = "Checking…"; }
  try{
    await swReg.update();
    const w = swReg.waiting || swReg.installing;
    if(w){ toast("New version found. Updating…"); if(w.state==="installed") applyUpdate(w); }
    else toast(`You have the latest version (${APP_VERSION})`);
  }catch(e){ toast("Couldn't check for updates. Try again shortly."); }
  finally{ if(btn){ btn.disabled = false; btn.textContent = "Check for updates"; } }
}
document.addEventListener("click", e=>{ if(e.target.closest("[data-update]")) checkForUpdates(); });
if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  navigator.serviceWorker.register("sw.js").then(reg=>{
    swReg = reg;
    // The rota is saved on the device after every change, so updating never loses work.
    const switchTo = applyUpdate = w=>{ updateRequested = true; w.postMessage("skipWaiting"); };
    if(reg.waiting && navigator.serviceWorker.controller) switchTo(reg.waiting);
    reg.addEventListener("updatefound", ()=>{
      const w = reg.installing;
      w && w.addEventListener("statechange", ()=>{ if(w.state==="installed" && navigator.serviceWorker.controller) switchTo(w); });
    });
    const check = ()=>reg.update().catch(()=>{});
    check();
    document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") check(); });
    setInterval(check, 60*60*1000);
  }).catch(()=>{});
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", ()=>{ if(!updateRequested || reloading) return; reloading = true; location.reload(); });
}

/* ============ start ============ */
const START_PANE = location.hash.slice(1) || "home";   // read before the auto-resume below moves to the rota
fillYears();
buildNamesForm();
{ const now = new Date(); S.month = now.getMonth(); S.year = now.getFullYear(); }
$id("selM").value = S.month; $id("selY").value = S.year;
checkContinuity();
if(!loadActive(true)) tryLoad();
if(S.built) ensureYear(S.year), $id("selY").value = S.year;
renderAudit();
goTab(START_PANE, true);
