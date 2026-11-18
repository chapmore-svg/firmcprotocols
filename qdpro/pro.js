/* Quick Docs Pro — screens, your details (this device), drafts, PDF saving (incl. the Patient Files
   folder), sharing, install and updates. The documents themselves (wording, layout, the PDF) are the
   original Quick Docs code in app.js. */

const APP_VERSION = "1.0.0";
const $id = id => document.getElementById(id);
const UA = navigator.userAgent;
const IS_ANDROID = /Android/i.test(UA);
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const lsGet = k => { try{ return localStorage.getItem(k); }catch(_){ return null; } };
const lsSet = (k,v) => { try{ localStorage.setItem(k,v); return true; }catch(_){ return false; } };
const lsDel = k => { try{ localStorage.removeItem(k); }catch(_){} };

/* ============ your details (this device only) ============ */
// No one's identity is built in (the app's web link is public): each doctor enters theirs in Settings.
const PRO_DEFAULTS = { name:"", creds:"", title:"", regLabel:"MCJ Reg. No", mcj:"", loc:"", greet:"", clinics:"", letter:"", contact:"" };
function proSet(){ try{ return Object.assign({}, PRO_DEFAULTS, JSON.parse(lsGet("qd.settings")||"{}")); }catch(e){ return {...PRO_DEFAULTS}; } }
function saveProSet(o){ lsSet("qd.settings", JSON.stringify(o)); }
function clinicList(){ return proSet().clinics.split(/\n+/).map(x=>x.trim()).filter(Boolean); }
// letterhead line for the letter of recommendation
function letterLine(){ const s = proSet(); return s.letter || clinicList().slice(0,2).join(" | ") || "Private Practice"; }

let LOGO = null; // {data, ratio}
function imgInfo(dataUrl){ return new Promise(res=>{ const i = new Image(); i.onload = ()=>res({data:dataUrl, ratio:i.width/i.height}); i.onerror = ()=>res(null); i.src = dataUrl; }); }
async function refreshDR(){
  const s = proSet();
  DR.name = s.name; DR.creds = s.creds; DR.title = s.title; DR.mcj = s.mcj; DR.loc = s.loc; DR.regLabel = s.regLabel || PRO_DEFAULTS.regLabel;
  const d = lsGet("qd.logo"); LOGO = d ? await imgInfo(d) : null;
  DR.logo = LOGO ? LOGO.data : ""; DR.logoRatio = LOGO ? LOGO.ratio : 2;
  document.querySelectorAll("#heroLogo,#logoPreview").forEach(im=>{ im.hidden = !LOGO; if(LOGO) im.src = LOGO.data; });
  $id("noLogo").hidden = !!LOGO;
  renderChips();
}
function shrinkImage(file, max, cb){
  const fr = new FileReader();
  fr.onload = ()=>{ const img = new Image(); img.onload = ()=>{
    const sc = Math.min(1, max/Math.max(img.width, img.height)), c = document.createElement("canvas");
    c.width = Math.round(img.width*sc); c.height = Math.round(img.height*sc);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0,c.width,c.height);
    cb(c.toDataURL("image/png")); }; img.src = fr.result; };
  fr.readAsDataURL(file);
}
$id("logoIn").addEventListener("change", e=>{
  const f = e.target.files[0]; e.target.value = ""; if(!f) return;
  shrinkImage(f, 800, async data=>{ if(!lsSet("qd.logo", data)){ toast("That logo is too large. Try a smaller image."); return; } await refreshDR(); toast("Logo updated ✓"); });
});
$id("logoRemove").addEventListener("click", async ()=>{ lsDel("qd.logo"); await refreshDR(); toast("Logo removed"); });

/* ============ clinic quick-pick buttons (from Settings) ============ */
const PATIENT_TABS = ["rx","ref","sl","img"];
function renderChips(){
  const list = clinicList();
  PATIENT_TABS.forEach(p=>{
    const box = $id(p+"-chips"); if(!box) return;
    const cur = $id(p+"-clinic").value.trim();
    box.innerHTML = list.length
      ? list.map(c=>`<span class="chip${c===cur?" sel":""}" data-p="${p}" data-clinic="${esc(c)}">${esc(c)}</span>`).join("")
      : `<span class="fine">Add your clinics in <button class="linkbtn" onclick="goTab('settings')">Settings</button> to pick them with one tap.</span>`;
  });
}
document.addEventListener("click", e=>{
  const c = e.target.closest(".chip[data-clinic]"); if(!c) return;
  selClinic(c, c.dataset.p, c.dataset.clinic); scheduleDraft(c.dataset.p);
});

/* ============ toast (also replaces the original pop-up alerts) ============ */
function toast(msg, ms=3000){ const t = $id("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(()=>{ t.hidden = true; }, ms); }
window.alert = m => toast(String(m), 4000);

/* ============ tactile feedback ============ */
document.addEventListener("pointerdown", e=>{
  const el = e.target.closest(".tap, .btn, .chip, .tile, .icon-btn"); if(!el || el.disabled) return;
  try{ navigator.vibrate && navigator.vibrate(8); }catch(_){}
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect(), size = Math.max(r.width, r.height)*2.2, s = document.createElement("span");
  s.className = "ripple"; s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-r.left-size/2}px;top:${e.clientY-r.top-size/2}px`;
  el.appendChild(s); s.addEventListener("animationend", ()=>s.remove());
}, {passive:true});

/* ============ document types ============ */
const KINDS = {
  rx:  {label:"Prescription",          file:"Prescription"},
  ref: {label:"Referral letter",       file:"Referral Letter"},
  sl:  {label:"Sick leave certificate", file:"Sick Leave Certificate"},
  img: {label:"Imaging request",       file:"Imaging Request"},
  lor: {label:"Letter of recommendation", file:"Letter of Recommendation"},
};
const val = id => { const el = $id(id); return el ? el.value.trim() : ""; };
function personName(p){ return p==="lor" ? val("lor-name") : [val(p+"-fn"), val(p+"-ln")].filter(Boolean).join(" "); }

/* ============ drafts (saved as you type, this device only) ============ */
const DRAFT_DAYS = 14;
const fieldsOf = p => [...document.querySelectorAll(`#tab-${p} input[id],#tab-${p} select[id],#tab-${p} textarea[id]`)];
function collectDraft(p){
  const d = {day:tod(), at:Date.now(), f:{}};
  fieldsOf(p).forEach(el=>{ d.f[el.id] = el.value; });
  if(p==="rx") d.drugs = [...document.querySelectorAll("#rx-list .rxi")].map(r=>[".dn",".dd2",".dr2",".df",".du",".drp",".dnt"].map(c=>r.querySelector(c).value));
  return d;
}
function hasContent(d){ return Object.entries(d.f).some(([k,v])=>v && !/-(date|from|age)$/.test(k) && k!=="lor-contact" && k!=="lor-pron") || (d.drugs||[]).some(r=>r.some(Boolean)); }
const draftTimers = {};
function scheduleDraft(p){
  if(!KINDS[p]) return;
  $id("savedState").textContent = "Saving…"; $id("savedState").classList.add("busy");
  clearTimeout(draftTimers[p]); draftTimers[p] = setTimeout(()=>saveDraft(p), 400);
}
function saveDraft(p){
  const d = collectDraft(p);
  if(hasContent(d)) lsSet("qd.draft."+p, JSON.stringify(d)); else lsDel("qd.draft."+p);
  $id("savedState").textContent = "Draft saved on this device ✓"; $id("savedState").classList.remove("busy");
  updateDocHead();
}
function restoreDraft(p){
  let d = null; try{ d = JSON.parse(lsGet("qd.draft."+p)||"null"); }catch(_){}
  if(!d) return;
  if(Date.now()-d.at > DRAFT_DAYS*864e5){ lsDel("qd.draft."+p); return; }
  if(p==="rx" && d.drugs){
    const list = $id("rx-list"); while(list.querySelectorAll(".rxi").length < d.drugs.length) addDrug();
    const rows = list.querySelectorAll(".rxi");
    d.drugs.forEach((vals,i)=>[".dn",".dd2",".dr2",".df",".du",".drp",".dnt"].forEach((c,j)=>{ rows[i].querySelector(c).value = vals[j]||""; }));
  }
  Object.entries(d.f).forEach(([id,v])=>{ const el = $id(id); if(!el) return;
    // a draft from an earlier day gets today's document date
    if(d.day!==tod() && /-date$/.test(id)) return;
    el.value = v; });
}
function applyDefaults(p){
  ["-date"].forEach(sfx=>{ const el = $id(p+sfx); if(el && !el.value) el.value = tod(); });
  if(p==="sl" && !$id("sl-from").value) $id("sl-from").value = tod();
  if(p==="lor" && !$id("lor-contact").value) $id("lor-contact").value = proSet().contact;
}
$id("main").addEventListener("input", e=>{ const t = e.target.closest(".tc"); if(t) scheduleDraft(t.id.slice(4)); });
$id("main").addEventListener("change", e=>{ const t = e.target.closest(".tc"); if(t) scheduleDraft(t.id.slice(4)); });
const _addDrug = addDrug; addDrug = function(){ _addDrug(); scheduleDraft("rx"); };
const _clr = clr;
clr = async function(p){
  const ok = await choose("Clear this form?", `<p>Everything typed on this ${KINDS[p].label.toLowerCase()} will be removed.</p>`,
    [{label:"Clear", value:true, danger:true},{label:"Cancel", value:false, ghost:true}]);
  if(!ok) return;
  _clr(p); applyDefaults(p); lsDel("qd.draft."+p); renderChips(); updateDocHead(); toast("Form cleared");
};
async function clearAllDrafts(){
  const ok = await choose("Clear all drafts?", "<p>Every unfinished document saved on this device will be removed.</p>",
    [{label:"Clear all", value:true, danger:true},{label:"Cancel", value:false, ghost:true}]);
  if(!ok) return;
  Object.keys(KINDS).forEach(p=>{ lsDel("qd.draft."+p); _clr(p); applyDefaults(p); });
  renderChips(); toast("All drafts cleared");
}

/* ============ signature ============ */
const sigCanvas = () => $id("sc");
function sigBlank(){ const c = sigCanvas(), b = document.createElement("canvas"); b.width = c.width; b.height = c.height; return c.toDataURL()===b.toDataURL(); }
function saveMySignature(){
  if(sigBlank()){ toast("Draw your signature in the box first"); return; }
  if(!lsSet("qd.sig", sigCanvas().toDataURL("image/png"))){ toast("Couldn't save the signature on this device"); return; }
  renderSig(); toast("Saved. It will be added to every document on this device ✓", 4000);
}
function drawSavedSig(){
  const data = lsGet("qd.sig"); if(!data) return false;
  const img = new Image();
  img.onload = ()=>{ const c = sigCanvas(), x = c.getContext("2d"); const sc = Math.min(c.width/img.width, c.height/img.height);
    x.drawImage(img, 0, 0, img.width*sc, img.height*sc); };
  img.src = data; return true;
}
function renderSig(){ const d = lsGet("qd.sig"); $id("sigPreview").hidden = !d; if(d) $id("sigPreview").src = d; $id("noSig").hidden = !!d; $id("sigRemove").hidden = !d; }
$id("sigRemove").addEventListener("click", ()=>{ lsDel("qd.sig"); renderSig(); toast("Signature removed"); });
function preparePreviewSig(){
  const c = sigCanvas();
  if(sigBlank()){
    const w = c.offsetWidth; if(w && c.width!==w) c.width = w;   // match the box now it's visible
    if(drawSavedSig()) toast("Your saved signature was added. Tap Clear to sign by hand.", 3500);
  }
}

/* ============ navigation ============ */
const ROUTES = ["home","settings","rx","ref","sl","img","lor","pv"];
let curTab = "rx", lastScreen = "home", meta = null;
function goTab(t, replace){
  if(!ROUTES.includes(t)) t = "home";
  if(t==="pv" && !meta) t = curTab;
  const url = "#"+t; if(location.hash!==url){ replace ? history.replaceState(null,"",url) : history.pushState(null,"",url); }
  route(t);
}
function route(t){
  const doc = !["home","settings"].includes(t);
  $id("screen-home").hidden = t!=="home"; $id("screen-settings").hidden = t!=="settings"; $id("screen-doc").hidden = !doc;
  $id("pvBar").hidden = t!=="pv"; document.body.classList.toggle("on-pv", t==="pv");
  if(doc){
    document.querySelectorAll("#main .tc").forEach(x=>x.classList.toggle("active", x.id==="tab-"+t));
    if(t!=="pv") curTab = t;
    updateDocHead(t);
    if(t==="pv") setTimeout(preparePreviewSig, 30);
  }
  if(t!=="settings") lastScreen = t;
  if(t==="home") renderHome();
  if(t==="settings") renderSettings();
  window.scrollTo(0,0);
}
window.addEventListener("popstate", ()=>{ let t = location.hash.slice(1); if(!ROUTES.includes(t)) t = "home"; if(t==="pv" && !meta) t = curTab; route(t); });
function openDoc(p){ goTab(p); }
function backToForm(){ goTab(meta ? meta.p : curTab); }
// the original app's tab switcher: route it through the new screens
showTab = function(n){ goTab(n); };
// remember what the preview shows, so Save / Share name the file from it
const _show = show;
show = function(html, type){ meta = {p:type, name:personName(type), clinic:type==="lor"?"":val(type+"-clinic"), date:val(type==="lor"?"lor-date":type+"-date")||tod()}; _show(html, type); };
function updateDocHead(t){
  t = t || (location.hash.slice(1)==="pv" ? "pv" : curTab);
  const p = t==="pv" && meta ? meta.p : curTab;
  $id("dhKind").textContent = (t==="pv" ? "Preview · " : "") + KINDS[p].label;
  $id("dhName").textContent = (t==="pv" && meta ? meta.name : personName(p)) || "New document";
  $id("savedState").hidden = t==="pv";
}
function renderHome(){
  const s = proSet(), h = new Date().getHours();
  $id("greeting").textContent = (h<12?"Good morning":h<17?"Good afternoon":"Good evening") + (s.greet ? ", "+s.greet : "");
  $id("heroDoc").textContent = s.creds ? `${s.name} · ${s.creds}` : s.name;
  $id("setup-card").hidden = !!s.name.trim();
  $id("home-version").textContent = "Version " + APP_VERSION;
  renderInstallCard();
}

/* ============ settings screen ============ */
const SFIELDS = {name:"s-name", creds:"s-creds", title:"s-title", regLabel:"s-regLabel", mcj:"s-mcj", loc:"s-loc", greet:"s-greet", clinics:"s-clinics", letter:"s-letter", contact:"s-contact"};
function renderSettings(){
  const s = proSet(); Object.entries(SFIELDS).forEach(([k,id])=>{ $id(id).value = s[k]; });
  $id("version").textContent = "Quick Docs Pro · version " + APP_VERSION;
  renderSig(); renderFolderCard(); renderDevInfo();
}
async function saveSettingsForm(){
  const s = proSet(), oldContact = s.contact;
  Object.entries(SFIELDS).forEach(([k,id])=>{ s[k] = k==="clinics" ? $id(id).value.split("\n").map(x=>x.trim()).filter(Boolean).join("\n") : $id(id).value.trim(); });
  if(!s.regLabel) s.regLabel = PRO_DEFAULTS.regLabel;
  saveProSet(s);
  if(!$id("lor-contact").value || $id("lor-contact").value===oldContact) $id("lor-contact").value = s.contact;
  await refreshDR(); toast("Saved ✓"); goTab(lastScreen==="settings" ? "home" : lastScreen);
}

/* ============ PDF files ============ */
// "Firstname Lastname — Referral Letter — Clinic — 09 Jun 2026.pdf" (the patient-filing format)
const MON3 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function shortDate(d){ const [Y,M,D] = String(d).split("-"); return D ? `${D} ${MON3[+M-1]} ${Y}` : ""; }
function fileName(m){
  const parts = [m.name.replace(/\s+/g," ") || "Patient", KINDS[m.p].file]; if(m.clinic) parts.push(m.clinic); parts.push(shortDate(m.date));
  return parts.filter(Boolean).join(" \u2014 ").replace(/[\\/:*?"<>|]+/g,"-") + ".pdf";
}
function buildFile(){
  if(!meta){ toast("Preview a document first."); return null; }
  let r; try{ r = buildDocPdf(); }catch(e){ toast("PDF error: "+e.message, 5000); return null; }
  if(!r) return null;
  return new File([r.doc.output("blob")], fileName(meta), {type:"application/pdf"});
}
function downloadBlob(blob, name){ const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000); }
async function saveBlob(blob, name){
  if(window.showSaveFilePicker){
    try{ const h = await window.showSaveFilePicker({suggestedName:name, types:[{description:"PDF document", accept:{"application/pdf":[".pdf"]}}], id:"qd-save", startIn:"documents"});
         const w = await h.createWritable(); await w.write(blob); await w.close(); return "saved"; }
    catch(e){ if(e.name==="AbortError") return "cancelled"; }
  }
  // plain downloads: browsers drop file names containing a long dash, so use ordinary hyphens here
  downloadBlob(blob, name.replace(/ \u2014 /g, " - ")); return "downloaded";
}
// Save PDF: patient documents go into the patient's folder when a Patient Files folder is set up;
// otherwise (and for recommendation letters) a Save-as window, or Downloads.
async function dlPDF(){
  const file = buildFile(); if(!file) return;
  if(meta.p!=="lor"){ const dir = await patientFilesDir(false); if(dir){ await saveToPatientFolder(file, dir); return; } }
  const how = await saveBlob(file, file.name);
  if(how==="saved") toast("PDF saved ✓");
  else if(how==="downloaded") toast(IS_ANDROID ? "PDF saved to Downloads. To put it in a patient's Drive folder, use Share → Drive." : "PDF saved to Downloads", 5000);
}

/* ============ the Patient Files folder (Chrome / Edge on a computer) ============ */
const CAN_PICK_FOLDER = !!window.showDirectoryPicker;
const KV = (()=>{
  let p = null;
  const open = ()=> p || (p = new Promise((res, rej)=>{ const r = indexedDB.open("qdpro", 1); r.onupgradeneeded = ()=>r.result.createObjectStore("kv"); r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error); }));
  const tx = async (mode, fn)=>{ const db = await open(); return new Promise((res, rej)=>{ const t = db.transaction("kv", mode); const out = fn(t.objectStore("kv")); t.oncomplete = ()=>res(out instanceof IDBRequest ? out.result : out); t.onerror = ()=>rej(t.error); }); };
  return { get:k=>tx("readonly", s=>s.get(k)), set:(k,v)=>tx("readwrite", s=>s.put(v,k)), del:k=>tx("readwrite", s=>s.delete(k)) };
})();
async function patientFilesDir(ask){
  if(!CAN_PICK_FOLDER) return null;
  const h = await KV.get("patientFiles").catch(()=>null);
  if(!h) return null;
  let perm = await h.queryPermission({mode:"readwrite"});
  if(perm!=="granted"){ try{ perm = await h.requestPermission({mode:"readwrite"}); }catch(_){ perm = "denied"; } }
  if(perm!=="granted"){ if(ask!==false) toast("Allow access to your Patient Files folder to save there"); return null; }
  return h;
}
async function choosePatientFilesFolder(){
  try{ const h = await window.showDirectoryPicker({id:"qd-patientfiles", mode:"readwrite", startIn:"documents"});
       await KV.set("patientFiles", h); toast(`Patient Files folder set: ${h.name} ✓`); renderFolderCard(); }
  catch(e){ if(e.name!=="AbortError") toast("Couldn't use that folder: "+e.message, 5000); }
}
async function forgetPatientFilesFolder(){ await KV.del("patientFiles"); renderFolderCard(); toast("Patient Files folder removed"); }
async function renderFolderCard(){
  const el = $id("folderCard"); if(!el) return;
  if(!CAN_PICK_FOLDER){
    el.innerHTML = `<h2>Where documents are saved</h2><p class="fine" style="text-align:left">On this device, <b>Save PDF</b> puts the document in <b>Downloads</b>. To save it straight into a patient's Google Drive folder, tap <b>Share</b> → <b>Drive</b> and choose the folder. The file is already named in your filing format.</p>`;
    return;
  }
  const h = await KV.get("patientFiles").catch(()=>null);
  el.innerHTML = `<h2>Where documents are saved</h2>
    <p class="fine" style="text-align:left">Choose your <b>Patient Files</b> folder once (for example in Google Drive for desktop: <b>G:\\My Drive\\Patient Files</b>). <b>Save PDF</b> then files each prescription, referral, sick leave and imaging request into the patient's own folder, named <i>Firstname Lastname — Referral Letter — Clinic — 09 Jun 2026</i>. It never overwrites a file. Recommendation letters always ask where to save.</p>
    <div class="folder-row"><span class="folder-name">${h ? `📁 ${esc(h.name)}` : "No folder chosen: Save PDF asks where to save each time"}</span>
      <button class="btn bp tap" onclick="choosePatientFilesFolder()">${h?"Change folder":"Choose Patient Files folder"}</button>
      ${h?`<button class="btn bo tap" onclick="forgetPatientFilesFolder()">Stop using it</button>`:""}</div>`;
}
const normName = s=>String(s||"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
async function saveToPatientFolder(file, root){
  const who = meta.name || "Patient", person = normName(who);
  const matches = [];
  for await (const [name, h] of root.entries()){ if(h.kind==="directory" && (normName(name)===person || normName(name).startsWith(person+" "))) matches.push(h); }
  let folder = null;
  if(matches.length===1) folder = matches[0];
  else if(matches.length>1){
    const pick = await choose("Which folder?", `<p>More than one folder matches <b>${esc(who)}</b>. Choose the right one:</p>`,
      [...matches.map((h,i)=>({label:"📁 "+h.name, value:i})), {label:"Cancel", value:null, ghost:true}]);
    if(pick===null || pick===undefined) return;
    folder = matches[pick];
  } else {
    const d = new Date(), dd = String(d.getDate()).padStart(2,"0")+String(d.getMonth()+1).padStart(2,"0")+String(d.getFullYear()).slice(2);
    const r = await choose("New patient folder", `<p>There's no folder for <b>${esc(who)}</b> in <b>${esc(root.name)}</b> yet. Create one in your format?</p>
      <label class="fld"><span>Clinic code</span><input type="text" id="dlgCode" placeholder="e.g. GW, WJO, CRH" autocapitalize="characters"></label>
      <label class="fld"><span>First-visit date (DDMMYY)</span><input type="text" id="dlgDate" value="${dd}" inputmode="numeric"></label>`,
      [{label:"Create folder and save", value:"create", primary:true},{label:"Save somewhere else instead", value:"else"},{label:"Cancel", value:null, ghost:true}]);
    if(r==="else"){ const how = await saveBlob(file, file.name); if(how==="saved"||how==="downloaded") toast("PDF saved ✓"); return; }
    if(r!=="create") return;
    const code = ($id("dlgCode").value||"").trim().toUpperCase(), date = ($id("dlgDate").value||"").trim();
    if(!code){ toast("Enter the clinic code. Nothing was saved."); return; }
    folder = await root.getDirectoryHandle(`${who.replace(/\s+/g," ")} ${code} ${date}`.replace(/[\\/:*?"<>|]+/g,"-"), {create:true});
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
function shareSubject(){ return `${KINDS[meta.p].file} \u2014 ${meta.name||"Patient"} \u2014 ${fmt(meta.date)}`; }
function shareBody(){
  const s = proSet(), n = meta.name || "Patient", sign = `\n\nKind regards,\n${s.name}${s.title?"\n"+s.title:""}`;
  if(meta.p==="ref") return `Dear Colleague,\n\nPlease find attached my referral letter for ${n}, dated ${fmt(meta.date)}.${sign}`;
  if(meta.p==="lor") return `Please find attached a letter of recommendation for ${n}, dated ${fmt(meta.date)}.${sign}`;
  return `Dear ${n},\n\nPlease find attached your ${KINDS[meta.p].label.toLowerCase()}, dated ${fmt(meta.date)}.${sign}`;
}
function noteShareProblem(e){ const msg = `${e&&e.name||"Error"}: ${e&&e.message||"no details"}`; lsSet("qd.lastShareError", new Date().toLocaleString()+" · "+msg); return msg; }
const SHARE_STYLES = [
  {id:"full", label:"subject and message", make:f=>({files:f, title:shareSubject(), text:shareBody()})},
  {id:"plain", label:"subject and message (plain hyphens)", make:f=>({files:f, title:shareSubject().replace(/[–—]/g,"-"), text:shareBody().replace(/[–—]/g,"-")})},
  {id:"oneline", label:"subject and message (single line)", make:f=>({files:f, title:shareSubject().replace(/[–—]/g,"-"), text:shareBody().replace(/[–—]/g,"-").replace(/\s*\n+\s*/g," ")})},
  {id:"subject", label:"subject only", make:f=>({files:f, title:shareSubject().replace(/[–—]/g,"-")})},
  {id:"fileonly", label:"file only", make:f=>({files:f})},
];
const shareStyleHere = () => lsGet("qd.shareStyle");
async function tryShare(files){
  const known = shareStyleHere();
  const order = known ? [SHARE_STYLES.find(x=>x.id===known), ...SHARE_STYLES.filter(x=>x.id!==known)].filter(Boolean) : SHARE_STYLES;
  let last;
  for(const stl of order){
    try{ await navigator.share(stl.make(files)); lsSet("qd.shareStyle", stl.id); return "shared"; }
    catch(e){ if(e.name==="AbortError") return "closed"; last = e; }
  }
  return last;
}
const IS_ANDROID_CHROME = IS_ANDROID && /Chrome\//.test(UA) && !/SamsungBrowser|EdgA|OPR|Firefox|; wv\)/.test(UA);
function browserName(){ return /SamsungBrowser/.test(UA)?"Samsung Internet":/EdgA?\//.test(UA)?"Microsoft Edge":/Firefox\//.test(UA)?"Firefox":/OPR\//.test(UA)?"Opera":/; wv\)/.test(UA)?"an in-app browser":/Chrome\//.test(UA)?"Chrome":/Safari\//.test(UA)?"Safari":"this browser"; }
async function shareDoc(){
  // shared copies use plain hyphens in the name: some apps drop names with a long dash
  const built = buildFile(); if(!built) return;
  const file = new File([built], built.name.replace(/ \u2014 /g, " - "), {type:"application/pdf"});
  if(await desktopSendChoice(built)) return;
  if(!canShareFile(file)){
    if(IS_ANDROID && !IS_ANDROID_CHROME){
      const c = await choose("The share menu isn't available here", `<p>Quick Docs Pro is running in <b>${browserName()}</b>, which doesn't let apps share files. In <b>Chrome</b> it can share to Gmail, WhatsApp, Drive and more.</p>`,
        [{label:"Open in Chrome", value:"chrome", primary:true},{label:"Save the PDF instead", value:"save"},{label:"Cancel", value:null, ghost:true}]);
      if(c==="chrome") openInChromeAndroid(); else if(c==="save") dlPDF();
      return;
    }
    const c = await choose("The share menu isn't available here", "<p>This browser doesn't let apps share files. Save the PDF and send it yourself.</p>",
      [{label:"Save the PDF", value:true, primary:true},{label:"Cancel", value:null, ghost:true}]);
    if(c) dlPDF(); return;
  }
  let r = await tryShare([file]);
  if(r==="shared" || r==="closed") return;
  const go = await choose("Open the share menu", "<p>Tap <b>Share</b>, then choose Gmail, WhatsApp, Drive or another app.</p>", [{label:"Share", value:true, primary:true},{label:"Cancel", value:false, ghost:true}]);
  if(!go) return;
  r = await tryShare([file]);
  if(r==="shared" || r==="closed") return;
  const msg = noteShareProblem(r);
  const nx = await choose("The share menu didn't open", `<p>This device refused to open the share menu.</p><p class="errline">Reason given: <code>${esc(msg)}</code></p>`,
    [{label:"Save the PDF instead", value:true, primary:true},{label:"Close", value:null, ghost:true}]);
  if(nx) dlPDF();
}

/* ============ install card + Gmail on computers ============ */
let installEvt = null;
const IS_IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
const IS_DESKTOP = !/Android|iPhone|iPad|iPod/i.test(UA) && !IS_IOS;
function isInstalled(){ return matchMedia("(display-mode: standalone)").matches || navigator.standalone===true; }
function renderInstallCard(){
  const el = $id("install-card"); if(!el) return;
  const dismissed = +lsGet("qd.installDismissed")||0;
  if(isInstalled() || Date.now()-dismissed < 7*864e5){ el.hidden = true; return; }
  let steps = "";
  if(installEvt) steps = "";
  else if(IS_ANDROID && !IS_ANDROID_CHROME) steps = `This page is open in <b>${browserName()}</b>. Open it in <b>Chrome</b>, then tap <b>⋮</b> → <b>Install app</b>.`;
  else if(IS_ANDROID) steps = "In Chrome, tap <b>⋮</b> (top right) → <b>Install app</b>. If you only see <b>Add to Home screen</b>, tap it and choose <b>Install</b>.";
  else if(IS_IOS) steps = "In Safari, tap the <b>Share</b> button → <b>Add to Home Screen</b>.";
  else if(/Edg\//.test(UA)) steps = "In Edge, click <b>⋯</b> (top right) → <b>Apps</b> → <b>Install this site as an app</b>.";
  else steps = "Click the <b>install icon</b> at the right end of the address bar, or <b>⋮</b> → <b>Cast, save and share</b> → <b>Install page as app</b>.";
  const btn = installEvt ? `<button class="btn bp tap" data-install>Install</button>` : (IS_ANDROID && !IS_ANDROID_CHROME) ? `<button class="btn bp tap" data-openchrome>Open in Chrome</button>` : "";
  el.innerHTML = `<div class="ic-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 7v7m0 0l-3-3m3 3l3-3M10 18h4"/></svg></div>
    <div class="ic-text"><b>Install Quick Docs Pro as an app</b><span>It's open as a web page right now, so you see the browser's address bar and menus. Installed, it gets its own icon and a clean full-screen window, and it works offline.</span>${steps?`<span class="ic-steps">${steps}</span>`:""}</div>
    <div class="ic-actions">${btn}<button class="btn plain tap" data-install-dismiss>Not now</button></div>`;
  el.hidden = false;
}
function openInChromeAndroid(){ location.href = `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(location.href.split("#")[0])};end`; }
document.addEventListener("click", async e=>{
  if(e.target.closest("[data-install]") && installEvt){ installEvt.prompt(); await installEvt.userChoice; installEvt = null; renderInstallCard(); }
  if(e.target.closest("[data-install-dismiss]")){ lsSet("qd.installDismissed", String(Date.now())); renderInstallCard(); }
  if(e.target.closest("[data-openchrome]")) openInChromeAndroid();
});
window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); installEvt = e; $id("installbtn").hidden = false; renderInstallCard(); });
$id("installbtn").addEventListener("click", async ()=>{ if(!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $id("installbtn").hidden = true; renderInstallCard(); });
window.addEventListener("appinstalled", ()=>{ $id("installbtn").hidden = true; renderInstallCard(); toast("Quick Docs Pro installed ✓"); });

// Computers: Gmail in the browser (subject and message filled in), or the system share menu.
function gmailComposeUrl(){ return "https://mail.google.com/mail/?view=cm&fs=1&tf=1&su=" + encodeURIComponent(shareSubject()) + "&body=" + encodeURIComponent(shareBody()); }
async function desktopSendChoice(file){
  if(!IS_DESKTOP) return false;
  const last = lsGet("qd.desktopSend"), win = /Windows/.test(UA);
  const gm = {label:"Gmail (in your browser)", value:"gmail"}, sys = {label: win ? "Windows share menu (Outlook, Mail…)" : "Share menu (Mail and other apps)", value:"system"};
  const opts = last==="system" ? [{...sys, primary:true}, gm] : [{...gm, primary:true}, sys];
  const c = await choose("How would you like to send it?", `<p><b>Gmail</b> opens in your browser with the subject and message filled in, and you attach the saved PDF. The <b>${win?"Windows share menu":"share menu"}</b> offers Outlook, Mail and other installed apps.</p>`,
    [...opts, {label:"Cancel", value:null, ghost:true}]);
  if(!c) return true;
  lsSet("qd.desktopSend", c);
  if(c==="system") return !canShareFile(file) ? (toast("This browser has no share menu. Use Gmail instead."), true) : false;
  const dir = meta.p!=="lor" ? await patientFilesDir(false) : null;
  let where;
  if(dir){ await saveToPatientFolder(file, dir); where = "in the patient's folder"; }
  else { const how = await saveBlob(file, file.name); if(how==="cancelled") return true; where = how==="downloaded" ? "in your <b>Downloads</b> folder" : "where you chose"; }
  const go = await choose("Now attach it in Gmail", `<p>The PDF <b>${esc(file.name)}</b> is saved ${where}.</p><p>Gmail opens in a new tab with the subject and message filled in. Add the address, click the <b>📎 paper-clip</b>, choose the PDF, and send.</p>`,
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
    ["Sharing works with", stl ? stl.label : "Not shared yet"], ["Last share problem", lsGet("qd.lastShareError")||"None"]];
  $id("devinfo").innerHTML = rows.map(([k,v])=>`<div><span>${k}</span><b>${esc(v)}</b></div>`).join("");
}

/* ============ offline + updates ============ */
let swReg = null, applyUpdate = null, updateRequested = false;
function saveAllDrafts(){ Object.keys(draftTimers).forEach(p=>{ clearTimeout(draftTimers[p]); saveDraft(p); }); }
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
    // Drafts are saved as you type, so switching to a new version never loses work.
    // While a preview is open, wait until you leave it.
    const switchTo = applyUpdate = w=>{
      const go = ()=>{ updateRequested = true; saveAllDrafts(); w.postMessage("skipWaiting"); };
      if(location.hash!=="#pv") go(); else { const t = setInterval(()=>{ if(location.hash!=="#pv"){ clearInterval(t); go(); } }, 2000); }
    };
    if(reg.waiting && navigator.serviceWorker.controller) switchTo(reg.waiting);
    reg.addEventListener("updatefound", ()=>{ const w = reg.installing; w && w.addEventListener("statechange", ()=>{ if(w.state==="installed" && navigator.serviceWorker.controller) switchTo(w); }); });
    const check = ()=>reg.update().catch(()=>{}); check();
    document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") check(); });
    setInterval(check, 60*60*1000);
  }).catch(()=>{});
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", ()=>{ if(!updateRequested || reloading) return; reloading = true; location.reload(); });
}
window.addEventListener("pagehide", saveAllDrafts);

/* ============ start ============ */
(async ()=>{
  const start = location.hash.slice(1) || "home";
  await refreshDR();
  Object.keys(KINDS).forEach(p=>{ restoreDraft(p); applyDefaults(p); });
  renderChips(); renderSig();
  initSig();
  goTab(start==="pv" ? "home" : (ROUTES.includes(start) ? start : "home"), true);
})();
