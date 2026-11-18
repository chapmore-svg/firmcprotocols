/* Endo Report Pro — screens, saved reports, settings, PDF saving (incl. the Patient Files folder),
   sharing, install and updates. The report itself (sections, findings, wording, PDF layout) is the
   original endoscopy app's code in app.js. */

const APP_VERSION = "1.1.1";
const $id = id => document.getElementById(id);
const UA = navigator.userAgent;
const IS_ANDROID = /Android/i.test(UA);

/* ============ settings (this device) ============ */
const PRO_DEFAULTS = {
  // No one's identity is built in (the app's web link is public): each doctor enters theirs in Settings.
  name: "", quals: "", title: "Consultant General Surgeon",
  signRole: "Consultant General Surgeon  \u2022  Endoscopist", greet: "",
  facility: "", scopeColo: "", scopeOgd: "", keepDays: "30",
};
function proSet(){ try{ return Object.assign({}, PRO_DEFAULTS, JSON.parse(localStorage.getItem("endo.settings")||"{}")); }catch(e){ return {...PRO_DEFAULTS}; } }
function saveProSet(o){ try{ localStorage.setItem("endo.settings", JSON.stringify(o)); }catch(e){} }
function doctorLine(){ const s = proSet(); return s.quals ? `${s.name}  \u2022  ${s.quals}` : s.name; }
function doctorSignName(){ const s = proSet(); return s.quals ? `${s.name}, ${s.quals}` : s.name; }

/* ============ logo ============ */
let LOGO = null;   // {data: dataURL, fmt, ratio}
function logoForPdf(){ return LOGO; }
function imgInfo(dataUrl){
  return new Promise(res=>{ const i = new Image(); i.onload = ()=>res({data:dataUrl, fmt:/^data:image\/jpe?g/.test(dataUrl)?"JPEG":"PNG", ratio:i.width/i.height}); i.onerror = ()=>res(null); i.src = dataUrl; });
}
async function loadLogo(){
  let custom = null; try{ custom = localStorage.getItem("endo.logo"); }catch(_){}
  LOGO = custom ? await imgInfo(custom) : null;
  document.querySelectorAll("#heroLogo,#logoPreview").forEach(im=>{ im.hidden = !LOGO; if(LOGO) im.src = LOGO.data; });
}
$id("logoIn").addEventListener("change", e=>{
  const f = e.target.files[0]; e.target.value = ""; if(!f) return;
  const fr = new FileReader();
  fr.onload = ()=>{ const img = new Image(); img.onload = ()=>{
      const sc = Math.min(1, 800/Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width*sc); c.height = Math.round(img.height*sc);
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0,c.width,c.height);
      try{ localStorage.setItem("endo.logo", c.toDataURL("image/png")); }catch(_){ toast("That logo is too large. Try a smaller image."); return; }
      loadLogo(); toast("Logo updated ✓");
    }; img.src = fr.result; };
  fr.readAsDataURL(f);
});
$id("logoReset").addEventListener("click", ()=>{ try{ localStorage.removeItem("endo.logo"); }catch(_){} loadLogo(); toast("Logo removed"); });

/* ============ toast ============ */
function toast(msg, ms=3000){ const t = $id("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(()=>{ t.hidden = true; }, ms); }

/* ============ tactile feedback ============ */
document.addEventListener("pointerdown", e=>{
  const el = e.target.closest(".tap, .btn, .chip, .seg-pill, .add-btn"); if(!el || el.disabled) return;
  try{ navigator.vibrate && navigator.vibrate(8); }catch(_){}
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect(), size = Math.max(r.width, r.height)*2.2, s = document.createElement("span");
  s.className = "ripple"; s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-r.left-size/2}px;top:${e.clientY-r.top-size/2}px`;
  el.appendChild(s); s.addEventListener("animationend", ()=>s.remove());
}, {passive:true});

/* ============ saved reports (IndexedDB, this device only) ============ */
const DB = (()=>{
  let p = null;
  const open = ()=> p || (p = new Promise((res, rej)=>{
    const r = indexedDB.open("endopro", 1);
    r.onupgradeneeded = ()=>{ r.result.createObjectStore("reports", {keyPath:"id"}); r.result.createObjectStore("kv"); };
    r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error);
  }));
  const tx = async (store, mode, fn)=>{ const db = await open(); return new Promise((res, rej)=>{ const t = db.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = ()=>res(out instanceof IDBRequest ? out.result : out); /* nothing stored -> undefined */ t.onerror = ()=>rej(t.error); }); };
  return {
    put: rec => tx("reports","readwrite", s=>s.put(rec)),
    get: id => tx("reports","readonly", s=>s.get(id)),
    del: id => tx("reports","readwrite", s=>s.delete(id)),
    all: () => tx("reports","readonly", s=>s.getAll()),
    clear: () => tx("reports","readwrite", s=>s.clear()),
    kvGet: k => tx("kv","readonly", s=>s.get(k)),
    kvSet: (k,v) => tx("kv","readwrite", s=>s.put(v,k)),
    kvDel: k => tx("kv","readwrite", s=>s.delete(k)),
  };
})();
let currentId = null, saveTimer = null;
function scheduleSave(){
  if(!currentId) return;
  $id("savedState").textContent = "Saving…"; $id("savedState").classList.add("busy");
  clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 500);
}
async function saveNow(){
  if(!currentId) return;
  const s = st();
  try{
    const old = await DB.get(currentId);
    await DB.put({id:currentId, proc, s:JSON.parse(JSON.stringify(s)), created:old?old.created:Date.now(), updated:Date.now()});
    $id("savedState").textContent = "Saved on this device ✓"; $id("savedState").classList.remove("busy");
  }catch(e){ $id("savedState").textContent = "Couldn't save on this device"; }
}
function newId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
async function newReport(p){
  S[p] = freshState(p);
  const set = proSet();
  if(set.facility) S[p].pt.facility = set.facility;
  const scope = p==="colo" ? set.scopeColo : set.scopeOgd; if(scope) S[p].pt.instrument = scope;
  collapsed = {}; currentId = newId();
  try{ localStorage.setItem("endo.lastOpen", currentId); }catch(_){}
  setProc(p); await saveNow(); goTab("report");
}
async function openReport(id){
  const rec = await DB.get(id); if(!rec){ toast("That report is no longer saved"); renderRecent(); return; }
  S[rec.proc] = Object.assign(freshState(rec.proc), rec.s);
  collapsed = {}; currentId = rec.id;
  try{ localStorage.setItem("endo.lastOpen", currentId); }catch(_){}
  setProc(rec.proc); goTab("report");
}
async function deleteReport(id){
  const rec = await DB.get(id);
  const who = rec && rec.s.pt.name ? rec.s.pt.name : "this report";
  const ok = await choose("Delete this report?", `<p>Delete the saved report for <b>${esc(who)}</b> from this device? It can't be undone. PDFs you've already saved or shared are not affected.</p>`,
    [{label:"Delete", value:true, danger:true},{label:"Cancel", value:false, ghost:true}]);
  if(!ok) return;
  await DB.del(id); if(id===currentId) currentId = null; renderRecent(); toast("Report deleted");
}
async function deleteAllReports(){
  const ok = await choose("Delete all saved reports?", "<p>Every report saved on this device will be removed. It can't be undone.</p>",
    [{label:"Delete all", value:true, danger:true},{label:"Cancel", value:false, ghost:true}]);
  if(!ok) return;
  await DB.clear(); currentId = null; toast("All saved reports deleted");
}
async function purgeOld(){
  const days = Math.max(1, parseInt(proSet().keepDays,10)||30), cutoff = Date.now() - days*864e5;
  const all = await DB.all().catch(()=>[]);
  for(const r of all) if(r.updated < cutoff && r.id!==currentId) await DB.del(r.id);
}
async function renderRecent(){
  const list = (await DB.all().catch(()=>[])).sort((a,b)=>b.updated-a.updated);
  $id("keepDaysTxt").textContent = proSet().keepDays;
  $id("recentNote").textContent = list.length ? `${list.length} on this device` : "";
  if(!list.length){ $id("recentList").innerHTML = '<p class="empty-note">No saved reports yet. Start one above.</p>'; return; }
  const ago = t=>{ const m = Math.round((Date.now()-t)/60000); return m<1?"just now":m<60?`${m} min ago`:m<1440?`${Math.round(m/60)} h ago`:`${Math.round(m/1440)} d ago`; };
  $id("recentList").innerHTML = list.map(r=>{
    const s = r.s, n = (s.findings ? Object.values(s.findings).reduce((a,x)=>a+x.length,0) : 0);
    return `<div class="rrow">
      <button class="rmain tap" onclick="openReport('${r.id}')">
        <span class="rkind ${r.proc}">${r.proc==="colo"?"COLO":"OGD"}</span>
        <span class="rtext"><b>${esc(s.pt.name||"Unnamed patient")}</b><small>${fmtDate(s.pt.date)||"no date"} · ${n} finding${n===1?"":"s"}${s.photos&&s.photos.length?` · ${s.photos.length} photo${s.photos.length===1?"":"s"}`:""} · edited ${ago(r.updated)}</small></span>
      </button>
      <button class="rdel tap" aria-label="Delete" onclick="deleteReport('${r.id}')"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
    </div>`;
  }).join("");
}

/* report screen: keep the header in step and save after every change */
const _render = render;
render = function(){ _render(); updateReportHead(); scheduleSave(); };
function updateReportHead(){
  const s = st();
  $id("rhKind").textContent = proc==="colo" ? "Colonoscopy report" : "Upper GI endoscopy report";
  $id("rhName").textContent = s.pt.name || "New report";
}
$id("formWrap").addEventListener("input", ()=>{ updateReportHead(); scheduleSave(); });
$id("formWrap").addEventListener("change", ()=>scheduleSave());
const _saveFinding = saveFinding; saveFinding = function(){ _saveFinding(); scheduleSave(); };

/* ============ navigation ============ */
const SCREENS = ["home","report","settings"];
let lastScreen = "home";
function goTab(t, replace){
  if(!SCREENS.includes(t)) t = "home";
  if(t==="report" && !currentId) t = "home";
  const url = "#"+t; if(location.hash!==url){ replace ? history.replaceState(null,"",url) : history.pushState(null,"",url); }
  show(t);
}
function show(t){
  SCREENS.forEach(x=>{ $id("screen-"+x).hidden = x!==t; });
  document.body.classList.toggle("on-report", t==="report");
  if(t!=="settings") lastScreen = t;
  if(t==="home"){ if(previewing) hidePreview(); renderHome(); }
  if(t==="settings") renderSettings();
  window.scrollTo(0,0);
}
window.addEventListener("popstate", ()=>{ let t = location.hash.slice(1); if(!SCREENS.includes(t)) t = "home"; if(t==="report" && !currentId) t = "home"; show(t); });
function renderHome(){
  const s = proSet(), h = new Date().getHours();
  $id("greeting").textContent = (h<12?"Good morning":h<17?"Good afternoon":"Good evening") + (s.greet ? ", "+s.greet : "");
  $id("heroDoc").textContent = doctorLine();
  $id("setup-card").hidden = !!s.name.trim();
  $id("home-version").textContent = "Version " + APP_VERSION;
  renderInstallCard(); renderRecent();
}

/* ============ settings screen ============ */
const SFIELDS = ["name","quals","title","signRole","greet","facility","scopeColo","scopeOgd","keepDays"];
function renderSettings(){
  const s = proSet(); SFIELDS.forEach(k=>{ $id("s-"+k).value = s[k]; });
  if(LOGO) $id("logoPreview").src = LOGO.data;
  $id("version").textContent = "Endo Report Pro · version " + APP_VERSION;
  renderFolderCard(); renderDevInfo();
}
function saveSettingsForm(){
  const s = proSet(); SFIELDS.forEach(k=>{ s[k] = $id("s-"+k).value.trim(); });
  if(!(parseInt(s.keepDays,10)>0)) s.keepDays = PRO_DEFAULTS.keepDays;
  saveProSet(s); toast("Settings saved ✓"); purgeOld(); goTab(lastScreen==="settings"?"home":lastScreen);
}

/* ============ PDF files ============ */
// File name in the patient-filing format: "Firstname Lastname — Colonoscopy Report — Facility — 02 Jul 2026"
const MON3x = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function longDate(d){ if(!d) return ""; const [Y,M,D] = d.split("-"); return `${D} ${MON3x[+M-1]} ${Y}`; }
function reportTitle(){ return proc==="colo" ? "Colonoscopy Report" : "Upper GI Endoscopy Report"; }
function reportFileName(ascii){
  const s = st(), name = (s.pt.name||"Patient").trim().replace(/\s+/g," ");
  const parts = [name, reportTitle()]; if(s.pt.facility) parts.push(s.pt.facility.trim()); parts.push(longDate(s.pt.date));
  let f = parts.filter(Boolean).join(ascii ? " - " : " \u2014 ").replace(/[\\/:*?"<>|]+/g,"-");
  return f + ".pdf";
}
function buildPdfFile(ascii){
  const r = buildPDF(st(), proc==="colo");
  return new File([r.doc.output("blob")], reportFileName(ascii), {type:"application/pdf"});
}
function downloadBlob(blob, name){ const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000); }
async function saveBlob(blob, name){
  if(window.showSaveFilePicker){
    try{ const h = await window.showSaveFilePicker({suggestedName:name, types:[{description:"PDF document", accept:{"application/pdf":[".pdf"]}}], id:"endo-save", startIn:"documents"});
         const w = await h.createWritable(); await w.write(blob); await w.close(); return "saved"; }
    catch(e){ if(e.name==="AbortError") return "cancelled"; }
  }
  // plain downloads: browsers drop file names containing a long dash, so use ordinary hyphens here
  downloadBlob(blob, name.replace(/ \u2014 /g, " - ")); return "downloaded";
}
function checkReady(){
  const s = st();
  if(!s.pt.name.trim()){ toast("Enter the patient's name first (section 1)"); if(collapsed[1]){ collapsed[1] = false; render(); } setTimeout(()=>{ const el = $id("ptName"); el && el.focus(); }, 50); return false; }
  return true;
}
// Save PDF: into the patient's folder when a Patient Files folder is set up, otherwise a Save-as window / Downloads.
async function makePDF(){
  if(!checkReady()) return;
  let file; try{ file = buildPdfFile(false); }catch(e){ toast("PDF error: "+e.message, 5000); return; }
  const dir = await patientFilesDir(false);
  if(dir){ await saveToPatientFolder(file, dir); return; }
  const how = await saveBlob(file, file.name);
  if(how==="saved") toast("PDF saved ✓");
  else if(how==="downloaded") toast(IS_ANDROID ? "PDF saved to Downloads. To put it in a patient's Drive folder, use Share → Drive." : "PDF saved to Downloads", 5000);
}

/* ============ the Patient Files folder (Chrome / Edge on a computer) ============ */
const CAN_PICK_FOLDER = !!window.showDirectoryPicker;
async function patientFilesDir(ask){
  if(!CAN_PICK_FOLDER) return null;
  const h = await DB.kvGet("patientFiles").catch(()=>null);
  if(!h) return null;
  let perm = await h.queryPermission({mode:"readwrite"});
  if(perm!=="granted"){ try{ perm = await h.requestPermission({mode:"readwrite"}); }catch(_){ perm = "denied"; } }
  if(perm!=="granted"){ if(ask!==false) toast("Allow access to your Patient Files folder to save there"); return null; }
  return h;
}
async function choosePatientFilesFolder(){
  try{
    const h = await window.showDirectoryPicker({id:"endo-patientfiles", mode:"readwrite", startIn:"documents"});
    await DB.kvSet("patientFiles", h); toast(`Patient Files folder set: ${h.name} ✓`); renderFolderCard();
  }catch(e){ if(e.name!=="AbortError") toast("Couldn't use that folder: "+e.message, 5000); }
}
async function forgetPatientFilesFolder(){ await DB.kvDel("patientFiles"); renderFolderCard(); toast("Patient Files folder removed"); }
async function renderFolderCard(){
  const el = $id("folderCard"); if(!el) return;
  if(!CAN_PICK_FOLDER){
    el.innerHTML = `<h2>Where reports are saved</h2><p class="fine" style="text-align:left">On this device, <b>Save PDF</b> puts the report in <b>Downloads</b>. To save it straight into a patient's Google Drive folder, tap <b>Share</b> → <b>Drive</b> and choose the folder. The file is already named in your filing format.</p>`;
    return;
  }
  const h = await DB.kvGet("patientFiles").catch(()=>null);
  el.innerHTML = `<h2>Where reports are saved</h2>
    <p class="fine" style="text-align:left">Choose your <b>Patient Files</b> folder once (for example in Google Drive for desktop: <b>G:\\My Drive\\Patient Files</b>). <b>Save PDF</b> then files each report into the patient's own folder, named <i>Firstname Lastname — Colonoscopy Report — Facility — 02 Jul 2026</i>. It never overwrites a file.</p>
    <div class="folder-row"><span class="folder-name">${h ? `📁 ${esc(h.name)}` : "No folder chosen: Save PDF asks where to save each time"}</span>
      <button class="btn primary tap" onclick="choosePatientFilesFolder()">${h?"Change folder":"Choose Patient Files folder"}</button>
      ${h?`<button class="btn ghost tap" onclick="forgetPatientFilesFolder()">Stop using it</button>`:""}</div>`;
}
const normName = s=>String(s||"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
async function saveToPatientFolder(file, root){
  const s = st(), person = normName(s.pt.name);
  const matches = [];
  for await (const [name, h] of root.entries()){ if(h.kind==="directory" && (normName(name)===person || normName(name).startsWith(person+" "))) matches.push(h); }
  let folder = null;
  if(matches.length===1) folder = matches[0];
  else if(matches.length>1){
    const pick = await choose("Which folder?", `<p>More than one folder matches <b>${esc(s.pt.name)}</b>. Choose the right one:</p>`,
      [...matches.map((h,i)=>({label:"📁 "+h.name, value:i})), {label:"Cancel", value:null, ghost:true}]);
    if(pick===null || pick===undefined) return;
    folder = matches[pick];
  } else {
    const d = new Date(), dd = String(d.getDate()).padStart(2,"0")+String(d.getMonth()+1).padStart(2,"0")+String(d.getFullYear()).slice(2);
    const r = await choose("New patient folder", `<p>There's no folder for <b>${esc(s.pt.name)}</b> in <b>${esc(root.name)}</b> yet. Create one in your format?</p>
      <label class="fld"><span>Clinic code</span><input type="text" id="dlgCode" placeholder="e.g. GW, WJO, CRH" autocapitalize="characters"></label>
      <label class="fld"><span>First-visit date (DDMMYY)</span><input type="text" id="dlgDate" value="${dd}" inputmode="numeric"></label>`,
      [{label:"Create folder and save", value:"create", primary:true},{label:"Save somewhere else instead", value:"else"},{label:"Cancel", value:null, ghost:true}]);
    if(r==="else"){ const how = await saveBlob(file, file.name); if(how==="saved"||how==="downloaded") toast("PDF saved ✓"); return; }
    if(r!=="create") return;
    const code = ($id("dlgCode").value||"").trim().toUpperCase(), date = ($id("dlgDate").value||"").trim();
    if(!code){ toast("Enter the clinic code. Nothing was saved."); return; }
    const fname = `${s.pt.name.trim().replace(/\s+/g," ")} ${code} ${date}`.replace(/[\\/:*?"<>|]+/g,"-");
    folder = await root.getDirectoryHandle(fname, {create:true});
  }
  // never overwrite: add (2), (3)… if the name is taken
  let name = file.name, n = 2;
  const exists = async nm=>{ try{ await folder.getFileHandle(nm); return true; }catch(_){ return false; } };
  while(await exists(name)) name = file.name.replace(/\.pdf$/, ` (${n++}).pdf`);
  const fh = await folder.getFileHandle(name, {create:true}); const w = await fh.createWritable(); await w.write(file); await w.close();
  toast(`Saved to ${folder.name} ✓`, 4500);
}

/* ============ question box ============ */
function choose(title, html, options){
  return new Promise(resolve=>{
    const d = $id("dlg"); let done = false;
    const finish = v=>{ if(done) return; done = true; if(d.open) d.close(); resolve(v); };
    $id("dlg-title").textContent = title; $id("dlg-body").innerHTML = html;
    const box = $id("dlg-actions"); box.innerHTML = "";
    options.forEach(o=>{ const b = document.createElement("button");
      b.className = "btn tap " + (o.primary ? "primary" : o.danger ? "danger" : o.ghost ? "plain" : "ghost");
      b.textContent = o.label; b.onclick = ()=>finish(o.value); box.appendChild(b); });
    d.oncancel = e=>{ e.preventDefault(); finish(null); };
    d.showModal();
  });
}

/* ============ sharing ============ */
function canShareFile(f){ try{ return !!(navigator.canShare && navigator.canShare({files:[f]})); }catch(e){ return false; } }
function shareSubject(){ const s = st(); return `${proc==="colo"?"Colonoscopy":"Upper GI Endoscopy"} Report \u2014 ${s.pt.name||"Patient"} \u2014 ${fmtDate(s.pt.date)}`; }
function shareBody(){
  const s = st(), pn = proc==="colo" ? "colonoscopy" : "upper GI endoscopy", set = proSet();
  return `Dear ${s.pt.name||"Patient"},\n\nPlease find attached your ${pn} report from ${fmtDate(s.pt.date)}.\n\nKind regards,\n${set.name}\n${set.title}`;
}
function noteShareProblem(e){ const msg = `${e&&e.name||"Error"}: ${e&&e.message||"no details"}`; try{ localStorage.setItem("endo.lastShareError", new Date().toLocaleString()+" · "+msg); }catch(_){} return msg; }
const SHARE_STYLES = [
  {id:"full", label:"subject and message", make:f=>({files:f, title:shareSubject(), text:shareBody()})},
  {id:"plain", label:"subject and message (plain hyphens)", make:f=>({files:f, title:shareSubject().replace(/[–—]/g,"-"), text:shareBody().replace(/[–—]/g,"-")})},
  {id:"oneline", label:"subject and message (single line)", make:f=>({files:f, title:shareSubject().replace(/[–—]/g,"-"), text:shareBody().replace(/[–—]/g,"-").replace(/\s*\n+\s*/g," ")})},
  {id:"subject", label:"subject only", make:f=>({files:f, title:shareSubject().replace(/[–—]/g,"-")})},
  {id:"fileonly", label:"file only", make:f=>({files:f})},
];
function shareStyleHere(){ try{ return localStorage.getItem("endo.shareStyle"); }catch(_){ return null; } }
async function tryShare(files){
  const known = shareStyleHere();
  const order = known ? [SHARE_STYLES.find(x=>x.id===known), ...SHARE_STYLES.filter(x=>x.id!==known)].filter(Boolean) : SHARE_STYLES;
  let last;
  for(const stl of order){
    try{ await navigator.share(stl.make(files)); try{ localStorage.setItem("endo.shareStyle", stl.id); }catch(_){} return "shared"; }
    catch(e){ if(e.name==="AbortError") return "closed"; last = e; }
  }
  return last;
}
const IS_ANDROID_CHROME = IS_ANDROID && /Chrome\//.test(UA) && !/SamsungBrowser|EdgA|OPR|Firefox|; wv\)/.test(UA);
function browserName(){ return /SamsungBrowser/.test(UA)?"Samsung Internet":/EdgA?\//.test(UA)?"Microsoft Edge":/Firefox\//.test(UA)?"Firefox":/OPR\//.test(UA)?"Opera":/; wv\)/.test(UA)?"an in-app browser":/Chrome\//.test(UA)?"Chrome":/Safari\//.test(UA)?"Safari":"this browser"; }
async function shareReport(){
  if(!checkReady()) return;
  let file; try{ file = buildPdfFile(true); }catch(e){ toast("PDF error: "+e.message, 5000); return; }
  const email = (st().pt.email||"").trim();
  if(await desktopSendChoice([file])) return;
  if(!canShareFile(file)){
    if(IS_ANDROID && !IS_ANDROID_CHROME){
      const c = await choose("The share menu isn't available here", `<p>Endo Report Pro is running in <b>${browserName()}</b>, which doesn't let apps share files. In <b>Chrome</b> it can share to Gmail, WhatsApp, Drive and more.</p>`,
        [{label:"Open in Chrome", value:"chrome", primary:true},{label:"Save the PDF instead", value:"save"},{label:"Cancel", value:null, ghost:true}]);
      if(c==="chrome") openInChromeAndroid(); else if(c==="save") makePDF();
      return;
    }
    const c = await choose("The share menu isn't available here", "<p>This browser doesn't let apps share files. Save the PDF and send it yourself.</p>",
      [{label:"Save the PDF", value:true, primary:true},{label:"Cancel", value:null, ghost:true}]);
    if(c) makePDF(); return;
  }
  // the share menu can't fill in "To", so put the patient's email on the clipboard to paste
  if(email.includes("@")){ try{ await navigator.clipboard.writeText(email); toast(`Patient's email copied: paste it into "To"`, 4500); }catch(_){} }
  let r = await tryShare([file]);
  if(r==="shared" || r==="closed") return;
  const go = await choose("Open the share menu", "<p>Tap <b>Share</b>, then choose Gmail, WhatsApp, Drive or another app.</p>", [{label:"Share", value:true, primary:true},{label:"Cancel", value:false, ghost:true}]);
  if(!go) return;
  r = await tryShare([file]);
  if(r==="shared" || r==="closed") return;
  const msg = noteShareProblem(r);
  const nx = await choose("The share menu didn't open", `<p>This device refused to open the share menu.</p><p class="errline">Reason given: <code>${esc(msg)}</code></p>`,
    [{label:"Save the PDF instead", value:true, primary:true},{label:"Close", value:null, ghost:true}]);
  if(nx) makePDF();
}

/* ============ install card + Gmail on computers ============ */
let installEvt = null;
const IS_IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
const IS_DESKTOP = !/Android|iPhone|iPad|iPod/i.test(UA) && !IS_IOS;
function isInstalled(){ return matchMedia("(display-mode: standalone)").matches || navigator.standalone===true; }
function renderInstallCard(){
  const el = $id("install-card"); if(!el) return;
  let dismissed = 0; try{ dismissed = +localStorage.getItem("endo.installDismissed")||0; }catch(_){}
  if(isInstalled() || Date.now()-dismissed < 7*864e5){ el.hidden = true; return; }
  const android = IS_ANDROID; let steps = "";
  if(installEvt) steps = "";
  else if(android && !IS_ANDROID_CHROME) steps = `This page is open in <b>${browserName()}</b>. Open it in <b>Chrome</b>, then tap <b>⋮</b> → <b>Install app</b>.`;
  else if(android) steps = "In Chrome, tap <b>⋮</b> (top right) → <b>Install app</b>. If you only see <b>Add to Home screen</b>, tap it and choose <b>Install</b>.";
  else if(IS_IOS) steps = "In Safari, tap the <b>Share</b> button → <b>Add to Home Screen</b>.";
  else if(/Edg\//.test(UA)) steps = "In Edge, click <b>⋯</b> (top right) → <b>Apps</b> → <b>Install this site as an app</b>.";
  else steps = "Click the <b>install icon</b> at the right end of the address bar, or <b>⋮</b> → <b>Cast, save and share</b> → <b>Install page as app</b>.";
  const btn = installEvt ? `<button class="btn primary tap" data-install>Install</button>` : (android && !IS_ANDROID_CHROME) ? `<button class="btn primary tap" data-openchrome>Open in Chrome</button>` : "";
  el.innerHTML = `<div class="ic-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 7v7m0 0l-3-3m3 3l3-3M10 18h4"/></svg></div>
    <div class="ic-text"><b>Install Endo Report Pro as an app</b><span>It's open as a web page right now, so you see the browser's address bar and menus. Installed, it gets its own icon and a clean full-screen window, and it works offline.</span>${steps?`<span class="ic-steps">${steps}</span>`:""}</div>
    <div class="ic-actions">${btn}<button class="btn plain tap" data-install-dismiss>Not now</button></div>`;
  el.hidden = false;
}
function openInChromeAndroid(){ location.href = `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(location.href.split("#")[0])};end`; }
document.addEventListener("click", async e=>{
  if(e.target.closest("[data-install]") && installEvt){ installEvt.prompt(); await installEvt.userChoice; installEvt = null; renderInstallCard(); }
  if(e.target.closest("[data-install-dismiss]")){ try{ localStorage.setItem("endo.installDismissed", String(Date.now())); }catch(_){} renderInstallCard(); }
  if(e.target.closest("[data-openchrome]")) openInChromeAndroid();
});
window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); installEvt = e; $id("installbtn").hidden = false; renderInstallCard(); });
$id("installbtn").addEventListener("click", async ()=>{ if(!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $id("installbtn").hidden = true; renderInstallCard(); });
window.addEventListener("appinstalled", ()=>{ $id("installbtn").hidden = true; renderInstallCard(); toast("Endo Report Pro installed ✓"); });

// Computers: Gmail in the browser (with the patient's address filled in), or the system share menu.
function gmailComposeUrl(){
  const to = (st().pt.email||"").trim();
  return "https://mail.google.com/mail/?view=cm&fs=1&tf=1" + (to.includes("@") ? "&to="+encodeURIComponent(to) : "") + "&su=" + encodeURIComponent(shareSubject()) + "&body=" + encodeURIComponent(shareBody());
}
async function desktopSendChoice(files){
  if(!IS_DESKTOP) return false;
  let last = null; try{ last = localStorage.getItem("endo.desktopSend"); }catch(_){}
  const win = /Windows/.test(UA);
  const gm = {label:"Gmail (in your browser)", value:"gmail"}, sys = {label: win ? "Windows share menu (Outlook, Mail…)" : "Share menu (Mail and other apps)", value:"system"};
  const opts = last==="system" ? [{...sys, primary:true}, gm] : [{...gm, primary:true}, sys];
  const c = await choose("How would you like to send it?", `<p><b>Gmail</b> opens in your browser with the patient's address, subject and message filled in, and you attach the saved PDF. The <b>${win?"Windows share menu":"share menu"}</b> offers Outlook, Mail and other installed apps.</p>`,
    [...opts, {label:"Cancel", value:null, ghost:true}]);
  if(!c) return true;
  try{ localStorage.setItem("endo.desktopSend", c); }catch(_){}
  if(c==="system") return !canShareFile(files[0]) ? (toast("This browser has no share menu. Use Gmail instead."), true) : false;
  const pdf = new File([files[0]], reportFileName(false), {type:"application/pdf"});
  const dir = await patientFilesDir(false);
  let where;
  if(dir){ await saveToPatientFolder(pdf, dir); where = "in the patient's folder"; }
  else { const how = await saveBlob(pdf, pdf.name); if(how==="cancelled") return true; where = how==="downloaded" ? "in your <b>Downloads</b> folder" : "where you chose"; }
  const go = await choose("Now attach it in Gmail", `<p>The PDF <b>${esc(pdf.name)}</b> is saved ${where}.</p><p>Gmail opens in a new tab with the address, subject and message filled in. Click the <b>📎 paper-clip</b>, choose the PDF, and send.</p>`,
    [{label:"Open Gmail", value:true, primary:true},{label:"Cancel", value:false, ghost:true}]);
  if(go) window.open(gmailComposeUrl(), "_blank", "noopener");
  return true;
}

/* ============ about this device ============ */
function renderDevInfo(){
  const yes = v=> v ? "Yes" : "No";
  const os = /Android/.test(UA) ? "Android" : /Windows/.test(UA) ? "Windows" : IS_IOS || /Mac OS/.test(UA) ? "Apple" : /Linux/.test(UA) ? "Linux" : "Other";
  const stl = SHARE_STYLES.find(x=>x.id===shareStyleHere());
  const rows = [["App version", APP_VERSION], ["Device", `${os} · ${browserName()}`], ["Opened as installed app", yes(isInstalled())],
    ["Can share a PDF", yes(canShareFile(new File([""],"x.pdf",{type:"application/pdf"})))], ["Can use a Patient Files folder", yes(CAN_PICK_FOLDER)],
    ["Sharing works with", stl ? stl.label : "Not shared yet"], ["Last share problem", (()=>{ try{ return localStorage.getItem("endo.lastShareError")||"None"; }catch(_){ return "None"; } })()]];
  $id("devinfo").innerHTML = rows.map(([k,v])=>`<div><span>${k}</span><b>${esc(v)}</b></div>`).join("");
}

/* ============ offline + updates ============ */
let swReg = null, applyUpdate = null, updateRequested = false;
async function checkForUpdates(){
  if(!swReg){ toast("Updates can be checked once the app is opened from its web link"); return; }
  if(!navigator.onLine){ toast("You're offline. Connect, then check again."); return; }
  const btn = $id("updatebtn"); if(btn){ btn.disabled = true; btn.textContent = "Checking…"; }
  try{ await swReg.update(); const w = swReg.waiting || swReg.installing;
       if(w){ toast("New version found. Updating…"); if(w.state==="installed") applyUpdate(w); } else toast(`You have the latest version (${APP_VERSION})`); }
  catch(e){ toast("Couldn't check for updates. Try again shortly."); }
  finally{ if(btn){ btn.disabled = false; btn.textContent = "Check for updates"; } }
}
document.addEventListener("click", e=>{ if(e.target.closest("[data-update]")) checkForUpdates(); });
if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  navigator.serviceWorker.register("sw.js").then(reg=>{
    swReg = reg;
    // Reports are saved as you type, so switching to a new version never loses work.
    const switchTo = applyUpdate = w=>{ updateRequested = true; saveNow().finally(()=>w.postMessage("skipWaiting")); };
    if(reg.waiting && navigator.serviceWorker.controller) switchTo(reg.waiting);
    reg.addEventListener("updatefound", ()=>{ const w = reg.installing; w && w.addEventListener("statechange", ()=>{ if(w.state==="installed" && navigator.serviceWorker.controller) switchTo(w); }); });
    const check = ()=>reg.update().catch(()=>{}); check();
    document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") check(); });
    setInterval(check, 60*60*1000);
  }).catch(()=>{});
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", ()=>{ if(!updateRequested || reloading) return; reloading = true; location.reload(); });
}
window.addEventListener("pagehide", ()=>{ if(currentId) saveNow(); });

/* ============ start ============ */
(async ()=>{
  const startHash = location.hash.slice(1) || "home";
  proc = "colo"; curSeg = "Rectum";
  await loadLogo();
  await purgeOld();
  let last = null; try{ last = localStorage.getItem("endo.lastOpen"); }catch(_){}
  if(last){
    const rec = await DB.get(last).catch(()=>null);
    if(rec){ S[rec.proc] = Object.assign(freshState(rec.proc), rec.s); currentId = rec.id; proc = rec.proc; document.getElementById("tabColo").classList.toggle("active", proc==="colo"); curSeg = proc==="colo" ? "Rectum" : "Oesophagus"; _render(); updateReportHead(); }
  }
  goTab(startHash==="report" && currentId ? "report" : (SCREENS.includes(startHash) && startHash!=="report" ? startHash : "home"), true);
})();
