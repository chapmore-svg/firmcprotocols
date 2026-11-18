/* ================= LOGO ================= */

/* ================= STATE ================= */
var proc = 'colo';
var S = {
  colo: freshState('colo'),
  ogd:  freshState('ogd')
};
function freshState(p){
  return {
    pt:{name:'',age:'',sex:'',mrn:'',date:new Date().toISOString().slice(0,10),
        referrer:'',facility:'', instrument:'', email:''},
    indications:[], indOther:'',
    sedation:{}, tolerance:'Good',
    // colonoscopy
    bbps:{R:null,T:null,L:null},
    extent:'Caecum', ileum:false, retro:true, dre:'Normal', withdrawal:'',
    // ogd
    ogdExtent:'Second part of duodenum (D2)', jman:true, clo:'Not taken', cloResult:'',
    findings:{},           // segment -> [findingObj]
    photos:[],             // {data, caption}
    diagnosis:'', recs:[], recOther:'', histology:false,
    complications:'None', compOther:''
  };
}
const st = () => S[proc];

/* ================= DATA ================= */
const COLO_SEGS = ['Terminal ileum','Caecum','Ascending colon','Hepatic flexure','Transverse colon','Splenic flexure','Descending colon','Sigmoid colon','Rectum','Anal canal'];
const OGD_SEGS  = ['Oesophagus','Gastro-oesophageal junction','Fundus','Body','Antrum','Pylorus','Duodenum D1','Duodenum D2'];

const IND_COLO = ['PR bleeding','Iron-deficiency anaemia','Altered bowel habit','CRC screening','Polyp surveillance','Post-CRC surveillance','Abdominal pain','Chronic diarrhoea','Constipation','Weight loss','Family history of CRC','Positive FIT/FOBT'];
const IND_OGD  = ['Dyspepsia','Epigastric pain','GORD symptoms','Dysphagia','Upper GI bleed / melaena','Iron-deficiency anaemia','Weight loss','Persistent vomiting','Ulcer healing check','Barrett\u2019s surveillance','H. pylori follow-up'];

const SEDS = [
  {k:'midaz', n:'Midazolam', u:'mg',  step:0.5, max:10},
  {k:'fent',  n:'Fentanyl',  u:'mcg', step:25,  max:200},
  {k:'peth',  n:'Pethidine', u:'mg',  step:25,  max:100},
  {k:'prop',  n:'Propofol',  u:'mg',  step:10,  max:300},
  {k:'hyos',  n:'Hyoscine butylbromide', u:'mg', step:10, max:40},
  {k:'ligno', n:'Lignocaine throat spray', u:'', step:0, max:0}
];

/* Finding schemas: label + fields (chips / num / check) */
const F_COLO = [
 {t:'Polyp', f:[
   {n:'Size (mm)', k:'size', ty:'num', step:1, def:5},
   {n:'Morphology', k:'morph', ty:'chips', o:['Pedunculated (Ip)','Sessile (Is)','Flat (IIa)']},
   {n:'Number', k:'count', ty:'num', step:1, def:1},
   {n:'Action', k:'act', ty:'chips', o:['Not removed','Biopsied','Cold snare polypectomy','Hot snare polypectomy','Forceps polypectomy']},
   {n:'Retrieved for histology', k:'retr', ty:'check'}]},
 {t:'Diverticulosis', f:[
   {n:'Extent', k:'ext', ty:'chips', o:['Scattered','Moderate','Extensive']},
   {n:'Appearance', k:'app', ty:'chips', o:['Uncomplicated','Inflamed / diverticulitis features']}]},
 {t:'Haemorrhoids', f:[
   {n:'Grade', k:'gr', ty:'chips', o:['Grade I','Grade II','Grade III','Grade IV']}]},
 {t:'Anal fissure', f:[
   {n:'Number', k:'num', ty:'chips', o:['Single','Multiple']},
   {n:'Position', k:'pos', ty:'chips', o:['Posterior midline','Anterior midline','Lateral (atypical)']},
   {n:'Chronicity', k:'chr', ty:'chips', o:['Acute','Chronic \u2014 with sentinel pile / fibrosis']}]},
 {t:'Colitis / inflammation', f:[
   {n:'Appearance', k:'app', ty:'chips', o:['Erythema','Erosions','Ulceration','Pseudopolyps']},
   {n:'Severity', k:'sev', ty:'chips', o:['Mild','Moderate','Severe']},
   {n:'Biopsied', k:'bx', ty:'check'}]},
 {t:'Mass / tumour', f:[
   {n:'Size (cm)', k:'size', ty:'num', step:1, def:3},
   {n:'Circumference', k:'circ', ty:'chips', o:['<\u00bc','\u00bc\u2013\u00bd','\u00bd\u2013\u00be','Circumferential']},
   {n:'Traversable with scope', k:'trav', ty:'chips', o:['Yes','No']},
   {n:'Biopsies taken (n)', k:'bxn', ty:'num', step:1, def:6}]},
 {t:'Angiodysplasia', f:[{n:'Treated (APC/clip)', k:'rx', ty:'check'}]},
 {t:'Stricture', f:[
   {n:'Appearance', k:'app', ty:'chips', o:['Benign-appearing','Malignant-appearing']},
   {n:'Traversable', k:'trav', ty:'chips', o:['Yes','No']},
   {n:'Biopsied', k:'bx', ty:'check'}]},
 {t:'Melanosis coli', f:[]},
 {t:'Blood in lumen', f:[{n:'Character', k:'ch', ty:'chips', o:['Fresh','Altered','Old / melanotic']}]},
 {t:'Biopsy (mucosal)', f:[{n:'Number', k:'n', ty:'num', step:1, def:2},
   {n:'Reason', k:'why', ty:'chips', o:['Random / mapping','Targeted','Chronic diarrhoea workup']}]},
 {t:'Other (free text)', f:[{n:'Describe', k:'txt', ty:'text'}]}
];

const F_OGD = [
 {t:'Oesophagitis', f:[{n:'LA Grade', k:'la', ty:'chips', o:['LA Grade A','LA Grade B','LA Grade C','LA Grade D']}]},
 {t:'Barrett\u2019s oesophagus', f:[
   {n:'Prague C (cm)', k:'c', ty:'num', step:1, def:2},
   {n:'Prague M (cm)', k:'m', ty:'num', step:1, def:3},
   {n:'Biopsied (Seattle protocol)', k:'bx', ty:'check'}]},
 {t:'Oesophageal varices', f:[
   {n:'Grade', k:'gr', ty:'chips', o:['Grade 1 (small)','Grade 2 (medium)','Grade 3 (large)']},
   {n:'Red signs / stigmata', k:'red', ty:'check'},
   {n:'Banded', k:'band', ty:'check'}]},
 {t:'Hiatus hernia', f:[{n:'Size (cm)', k:'size', ty:'num', step:1, def:3}]},
 {t:'Gastritis', f:[
   {n:'Type', k:'ty2', ty:'chips', o:['Erythematous','Erosive','Atrophic','Portal hypertensive']},
   {n:'Severity', k:'sev', ty:'chips', o:['Mild','Moderate','Severe']},
   {n:'Biopsied', k:'bx', ty:'check'}]},
 {t:'Ulcer', f:[
   {n:'Size (mm)', k:'size', ty:'num', step:2, def:10},
   {n:'Forrest class', k:'fo', ty:'chips', o:['Ia (spurting)','Ib (oozing)','IIa (visible vessel)','IIb (adherent clot)','IIc (flat pigmentation)','III (clean base)']},
   {n:'Biopsied (edges)', k:'bx', ty:'check'},
   {n:'Endoscopic therapy', k:'rx', ty:'chips', o:['None','Adrenaline injection','Clips','Adrenaline + clips','Thermal']}]},
 {t:'Polyp', f:[
   {n:'Size (mm)', k:'size', ty:'num', step:1, def:5},
   {n:'Number', k:'count', ty:'num', step:1, def:1},
   {n:'Action', k:'act', ty:'chips', o:['Not removed','Biopsied','Snare polypectomy','Forceps polypectomy']}]},
 {t:'Mass / tumour', f:[
   {n:'Size (cm)', k:'size', ty:'num', step:1, def:3},
   {n:'Appearance', k:'app', ty:'chips', o:['Ulcerated','Fungating','Infiltrative','Polypoid']},
   {n:'Biopsies taken (n)', k:'bxn', ty:'num', step:1, def:6}]},
 {t:'Candidiasis', f:[{n:'Extent', k:'ext', ty:'chips', o:['Patchy','Confluent']}]},
 {t:'Duodenitis', f:[{n:'Severity', k:'sev', ty:'chips', o:['Mild','Moderate','Severe']}]},
 {t:'Blood in lumen', f:[{n:'Character', k:'ch', ty:'chips', o:['Fresh','Coffee-ground','Melaena']}]},
 {t:'Biopsy (mucosal)', f:[{n:'Number', k:'n', ty:'num', step:1, def:2},
   {n:'Reason', k:'why', ty:'chips', o:['H. pylori (CLO)','Coeliac workup','Targeted','Random']}]},
 {t:'Other (free text)', f:[{n:'Describe', k:'txt', ty:'text'}]}
];

const RECS_COLO = ['Await histology and review','High-fibre diet & fluids','Haemorrhoid measures (fibre, sitz baths)','Repeat colonoscopy in 10 years','Repeat colonoscopy in 5\u20137 years','Repeat colonoscopy in 3 years','Repeat colonoscopy in 1 year','Surgical outpatient review','Gastroenterology referral','CT staging & MDT discussion'];
const RECS_OGD  = ['Await histology and review','PPI \u2014 8-week course','H. pylori eradication if CLO positive','Repeat OGD in 8\u201312 weeks (ulcer healing check)','Lifestyle & dietary advice (GORD)','Variceal banding programme / follow-up','Surgical outpatient review','Gastroenterology referral','CT staging & MDT discussion'];

/* ================= RENDER FORM ================= */
var curSeg = null;
function setProc(p){ proc=p;
  document.getElementById('tabColo').classList.toggle('active',p==='colo');
  document.getElementById('tabOgd').classList.toggle('active',p==='ogd');
  curSeg = (p==='colo') ? 'Rectum' : 'Oesophagus';
  hidePreview(); render();
}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

function render(){
  const s = st(), isC = proc==='colo';
  const segs = isC ? COLO_SEGS : OGD_SEGS;
  const inds = isC ? IND_COLO : IND_OGD;
  const recs = isC ? RECS_COLO : RECS_OGD;
  if(!curSeg) curSeg = isC ? 'Rectum' : 'Oesophagus';

  let h = '';
  /* 1 Patient */
  h += card(1,'Patient & procedure',`
    <label class="fl">Patient name</label><input type="text" id="ptName" value="${esc(s.pt.name)}" oninput="st().pt.name=this.value">
    <div class="row3">
      <div><label class="fl">Age</label><input type="text" id="ptAge" value="${esc(s.pt.age)}" oninput="st().pt.age=this.value"></div>
      <div><label class="fl">Sex</label><select onchange="st().pt.sex=this.value">
        <option ${s.pt.sex===''?'selected':''} value=""></option>
        <option ${s.pt.sex==='Male'?'selected':''}>Male</option>
        <option ${s.pt.sex==='Female'?'selected':''}>Female</option></select></div>
      <div><label class="fl">MRN / ID</label><input type="text" value="${esc(s.pt.mrn)}" oninput="st().pt.mrn=this.value"></div>
    </div>
    <div class="row2">
      <div><label class="fl">Date</label><input type="date" value="${esc(s.pt.date)}" onchange="st().pt.date=this.value"></div>
      <div><label class="fl">Facility</label><input type="text" placeholder="e.g. CRH Endoscopy Suite" value="${esc(s.pt.facility)}" oninput="st().pt.facility=this.value"></div>
    </div>
    <div class="row2">
      <div><label class="fl">Referring doctor</label><input type="text" value="${esc(s.pt.referrer)}" oninput="st().pt.referrer=this.value"></div>
      <div><label class="fl">Instrument</label><input type="text" placeholder="e.g. Olympus CF-H190" value="${esc(s.pt.instrument)}" oninput="st().pt.instrument=this.value"></div>
    </div>
    <label class="fl">Patient email (for sending report)</label>
    <input type="text" inputmode="email" placeholder="patient@example.com" value="${esc(s.pt.email)}" oninput="st().pt.email=this.value">`);

  /* 2 Indications */
  h += card(2,'Indications',
    chipset(inds, s.indications, 'toggleInd') +
    `<label class="fl">Other</label><input type="text" value="${esc(s.indOther)}" oninput="st().indOther=this.value">`);

  /* 3 Sedation */
  let sed = SEDS.filter(d=>!isC || d.k!=='ligno').map(d=>{
    if(d.step===0){
      const on = !!s.sedation[d.k];
      return `<div class="sed-row"><div class="sed-name">${d.n}</div>
        <button class="chip small ${on?'on':''}" onclick="st().sedation['${d.k}']=${on?'0':'1'};render()">${on?'Given':'Not given'}</button></div>`;
    }
    const v = s.sedation[d.k]||0;
    return `<div class="sed-row"><div><div class="sed-name">${d.n}</div><div class="sed-unit">${d.u}</div></div>
      <div class="stepper">
        <button onclick="stepSed('${d.k}',-${d.step},${d.max})">\u2212</button>
        <div class="val">${v?v+' '+d.u:'\u2014'}</div>
        <button onclick="stepSed('${d.k}',${d.step},${d.max})">+</button>
      </div></div>`;
  }).join('');
  sed += `<label class="fl">Tolerance</label>` + chipset(['Good','Fair','Poor'], [s.tolerance], 'setTol');
  h += card(3,'Sedation & tolerance', sed + `<p class="hint">Pulse oximetry & supplemental oxygen are added to the report automatically when sedation is given.</p>`);

  /* 4 Procedure detail */
  if(isC){
    h += card(4,'Preparation & extent',`
      <label class="fl">Boston Bowel Prep Score</label>
      <div class="bbps">${bbpsSeg('R','Right colon')}${bbpsSeg('T','Transverse')}${bbpsSeg('L','Left colon')}</div>
      <div class="bbps-total">Total: ${bbpsTotal(s)===null?'\u2014':bbpsTotal(s)+' / 9'}</div>
      <label class="fl">Digital rectal examination</label>
      ${chipset(['Normal','Haemorrhoids','Anal fissure(s)','Mass palpable','Blood on glove','Not performed'],[s.dre],'setDre')}
      <label class="fl">Extent reached</label>
      ${chipset(COLO_SEGS.slice().reverse(),[s.extent],'setExtent')}
      <div class="chips" style="margin-top:10px">
        <button class="chip ${s.ileum?'on':''}" onclick="st().ileum=!st().ileum;render()">Terminal ileum intubated</button>
        <button class="chip ${s.retro?'on':''}" onclick="st().retro=!st().retro;render()">Retroflexion in rectum</button>
      </div>
      <label class="fl">Withdrawal time (min)</label>
      <input type="number" inputmode="numeric" style="max-width:130px" value="${esc(s.withdrawal)}" oninput="st().withdrawal=this.value">`);
  } else {
    h += card(4,'Extent & H. pylori',`
      <label class="fl">Extent reached</label>
      ${chipset(['Second part of duodenum (D2)','First part of duodenum (D1)','Pylorus','Stomach only','Oesophagus only'],[s.ogdExtent],'setOgdExtent')}
      <div class="chips" style="margin-top:10px">
        <button class="chip ${s.jman?'on':''}" onclick="st().jman=!st().jman;render()">Retroflexion in fundus (J-manoeuvre)</button>
      </div>
      <label class="fl">CLO / rapid urease test</label>
      ${chipset(['Not taken','Taken \u2014 result pending','Positive','Negative'],[s.clo],'setClo')}`);
  }

  /* 5 Findings */
  const segHtml = segs.map(g=>{
    const n = (s.findings[g]||[]).length;
    return `<button class="seg-pill ${curSeg===g?'sel':''}" onclick="curSeg='${g}';render()">${g}${n?`<span class="badge">${n}</span>`:''}</button>`;
  }).join('');
  const fl = (s.findings[curSeg]||[]).map((f,i)=>
    `<div class="finding-item"><div class="fx"><b>${esc(f.t)}</b> \u2014 ${esc(findingText(f))}</div>
     <button class="del" onclick="delFinding('${curSeg.replace(/'/g,"\\'")}',${i})">\u00d7</button></div>`).join('') || `<p class="hint">No findings recorded for <b>${curSeg}</b>. Segments without findings are reported as normal automatically.</p>`;
  h += card(5,'Findings',`
    <p class="hint">Tap a segment, then add findings. Anything without findings is reported as normal (to the extent reached).</p>
    <div class="seg-track">${segHtml}</div>
    <div class="finding-list">${fl}</div>
    <button class="add-btn" onclick="openModal()">+ Add finding \u2014 ${curSeg}</button>`);

  /* 6 Photos */
  const pg = s.photos.map((p,i)=>`
    <div class="photo-cell"><img src="${p.data}">
      <input type="text" placeholder="Caption (e.g. Caecum \u2014 polyp)" value="${esc(p.caption)}" oninput="st().photos[${i}].caption=this.value">
      <button class="rm" onclick="st().photos.splice(${i},1);render()">Remove</button></div>`).join('');
  h += card(6,'Images',`
    <input type="file" id="photoIn" accept="image/*" multiple style="display:none" onchange="addPhotos(this.files)">
    <button class="add-btn" onclick="document.getElementById('photoIn').click()">+ Import photos</button>
    <div class="photo-grid">${pg}</div>`);

  /* 7 Conclusion */
  h += card(7,'Diagnosis, complications & plan',`
    <label class="fl">Diagnosis / conclusion</label>
    <textarea oninput="st().diagnosis=this.value" placeholder="Leave blank to auto-generate from findings">${esc(s.diagnosis)}</textarea>
    <button class="chip small" style="margin-top:6px" onclick="st().diagnosis=autoDiagnosis();render()">Auto-fill from findings</button>
    <label class="fl">Complications</label>
    ${chipset(['None','Bleeding \u2014 controlled endoscopically','Perforation','Hypoxia \u2014 recovered','Other'],[s.complications],'setComp')}
    ${s.complications==='Other'?`<input type="text" style="margin-top:8px" placeholder="Describe" value="${esc(s.compOther)}" oninput="st().compOther=this.value">`:''}
    <label class="fl">Recommendations</label>
    ${chipset(recs, s.recs, 'toggleRec')}
    <label class="fl">Additional recommendations</label>
    <input type="text" value="${esc(s.recOther)}" oninput="st().recOther=this.value">`);

  document.getElementById('formWrap').innerHTML = h;
}
var collapsed = {};   // section number -> true when folded away; kept across re-draws
function card(n,t,body){ return `<div class="card ${collapsed[n]?'':'open'}"><div class="card-h" onclick="collapsed[${n}]=!collapsed[${n}];this.parentElement.classList.toggle('open')">
  <span><span class="num">${n}</span><span class="ttl">${t}</span></span><span class="chev">\u25bc</span></div>
  <div class="card-b">${body}</div></div>`; }
function chipset(opts, selArr, fn){
  return `<div class="chips">`+opts.map(o=>{
    const on = selArr.includes(o);
    return `<button class="chip ${on?'on':''}" onclick="${fn}('${o.replace(/'/g,"\\'")}')">${o}</button>`;
  }).join('')+`</div>`;
}
function bbpsSeg(k,nm){ const v = st().bbps[k];
  return `<div class="seg"><div class="nm">${nm}</div><div class="opts">${[0,1,2,3].map(x=>
    `<button class="o ${v===x?'on':''}" onclick="st().bbps['${k}']=${x};render()">${x}</button>`).join('')}</div></div>`; }
function bbpsTotal(s){ const b=s.bbps; return (b.R===null||b.T===null||b.L===null)?null:b.R+b.T+b.L; }

/* toggles */
function toggleInd(v){ tog(st().indications,v); render(); }
function toggleRec(v){ tog(st().recs,v); render(); }
function tog(a,v){ const i=a.indexOf(v); i>=0?a.splice(i,1):a.push(v); }
function setTol(v){ st().tolerance=v; render(); }
function setDre(v){ st().dre=v; render(); }
function setExtent(v){ st().extent=v; render(); }
function setOgdExtent(v){ st().ogdExtent=v; render(); }
function setClo(v){ st().clo=v; render(); }
function setComp(v){ st().complications=v; render(); }
function stepSed(k,d,max){ const s=st(); let v=+(s.sedation[k]||0)+d;
  v=Math.max(0,Math.min(max,Math.round(v*10)/10)); s.sedation[k]=v; render(); }
function delFinding(seg,i){ st().findings[seg].splice(i,1); render(); }

/* ================= FINDING MODAL ================= */
var draft = null;
function openModal(){
  const defs = proc==='colo'?F_COLO:F_OGD;
  draft = {t:null, v:{}};
  const box = document.getElementById('modalBox');
  box.innerHTML = `<h3>Add finding \u2014 ${curSeg}</h3><div class="sub">Choose a finding type</div>
    <div class="chips">${defs.map(d=>`<button class="chip" onclick="pickType('${d.t.replace(/'/g,"\\'")}')">${d.t}</button>`).join('')}</div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`;
  document.getElementById('modalBg').classList.add('show');
}
function pickType(t){
  const defs = proc==='colo'?F_COLO:F_OGD;
  const def = defs.find(d=>d.t===t);
  draft = {t, v:{}};
  def.f.forEach(f=>{ if(f.ty==='num') draft.v[f.k]=f.def; });
  renderModalFields(def);
}
function renderModalFields(def){
  const box = document.getElementById('modalBox');
  let fh = def.f.map(f=>{
    if(f.ty==='chips') return `<label class="fl">${f.n}</label><div class="chips">${f.o.map(o=>
      `<button class="chip small ${draft.v[f.k]===o?'on':''}" onclick="draft.v['${f.k}']='${o.replace(/'/g,"\\'")}';renderModalFields(currentDef())">${o}</button>`).join('')}</div>`;
    if(f.ty==='num') return `<label class="fl">${f.n}</label><div class="stepper">
      <button onclick="draft.v['${f.k}']=Math.max(0,(draft.v['${f.k}']||0)-${f.step});renderModalFields(currentDef())">\u2212</button>
      <div class="val">${draft.v[f.k]||0}</div>
      <button onclick="draft.v['${f.k}']=(draft.v['${f.k}']||0)+${f.step};renderModalFields(currentDef())">+</button></div>`;
    if(f.ty==='check') return `<div class="chips" style="margin-top:12px"><button class="chip ${draft.v[f.k]?'on':''}" onclick="draft.v['${f.k}']=!draft.v['${f.k}'];renderModalFields(currentDef())">${f.n}</button></div>`;
    if(f.ty==='text') return `<label class="fl">${f.n}</label><input type="text" value="${esc(draft.v[f.k]||'')}" oninput="draft.v['${f.k}']=this.value">`;
    return '';
  }).join('');
  box.innerHTML = `<h3>${def.t} \u2014 ${curSeg}</h3>${fh||'<p class="hint">No further detail needed.</p>'}
    <div class="modal-actions">
      <button class="btn ghost" onclick="openModal()">Back</button>
      <button class="btn primary" onclick="saveFinding()">Add finding</button></div>`;
}
function currentDef(){ return (proc==='colo'?F_COLO:F_OGD).find(d=>d.t===draft.t); }
function saveFinding(){
  const s = st();
  (s.findings[curSeg] = s.findings[curSeg]||[]).push(draft);
  closeModal(); render();
}
function closeModal(){ document.getElementById('modalBg').classList.remove('show'); }

/* Compose readable text for a finding */
function findingText(f){
  const def = F_COLO.concat(F_OGD).find(d=>d.t===f.t);
  if(!def) return '';
  const parts = [];
  def.f.forEach(fd=>{
    const v = f.v[fd.k];
    if(fd.ty==='check'){ if(v) parts.push(fd.n.toLowerCase()); return; }
    if(v===undefined||v===''||v===null) return;
    if(fd.ty==='num'){
      const unit = fd.n.includes('(mm)')?' mm':fd.n.includes('(cm)')?' cm':'';
      parts.push(`${fd.n.replace(/ \(.+\)/,'').toLowerCase()} ${v}${unit}`);
    } else parts.push(String(v));
  });
  return parts.join(', ') || 'noted';
}

/* ================= PHOTOS ================= */
function addPhotos(files){
  [...files].forEach(f=>{
    const r = new FileReader();
    r.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        const mx = 1200, sc = Math.min(1, mx/Math.max(img.width,img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width*sc); c.height = Math.round(img.height*sc);
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        st().photos.push({data:c.toDataURL('image/jpeg',0.82), caption:'', w:c.width, h:c.height});
        render();
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(f);
  });
}

/* ================= REPORT COMPOSITION ================= */
function sedationText(s){
  const bits = SEDS.filter(d=>s.sedation[d.k] && (proc==='ogd' || d.k!=='ligno')).map(d=> d.step===0 ? d.n : `${d.n} ${s.sedation[d.k]} ${d.u}`);
  if(!bits.length) return 'None (unsedated procedure). Tolerance: '+s.tolerance.toLowerCase()+'.';
  return bits.join(', ') + '. Continuous pulse oximetry and supplemental oxygen throughout. Tolerance: ' + s.tolerance.toLowerCase() + '.';
}
function findingsLines(s, isC){
  const segs = isC?COLO_SEGS:OGD_SEGS;
  const lines = [];
  segs.forEach(g=>{
    (s.findings[g]||[]).forEach(f=> lines.push({seg:g, t:f.t, txt:findingText(f)}));
  });
  return lines;
}
function autoDiagnosis(){
  const s = st(); const lines = findingsLines(s, proc==='colo');
  if(!lines.length) return proc==='colo' ? 'Normal colonoscopy.' : 'Normal upper GI endoscopy.';
  const seen = [];
  lines.forEach(l=>{
    const d = `${l.t} \u2014 ${l.seg.toLowerCase()}`;
    if(!seen.includes(d)) seen.push(d);
  });
  return seen.map((d,i)=>`${i+1}. ${d}`).join('\n');
}

/* ================= PREVIEW ================= */
var previewing = false;
function togglePreview(){ previewing?hidePreview():showPreview(); }
function hidePreview(){ previewing=false;
  document.getElementById('previewWrap').style.display='none';
  document.getElementById('formWrap').style.display='block';
  document.getElementById('btnPreview').textContent='Preview'; }
function showPreview(){
  previewing=true;
  const s = st(), isC = proc==='colo';
  const lines = findingsLines(s,isC);
  const inds = s.indications.concat(s.indOther?[s.indOther]:[]).join('; ') || '\u2014';
  let extra = '';
  if(isC){
    extra = `<div class="kv">
      <div class="k">Bowel prep (BBPS)</div><div>${bbpsTotal(s)===null?'Not scored':bbpsTotal(s)+' / 9 (R'+s.bbps.R+' T'+s.bbps.T+' L'+s.bbps.L+')'}</div>
      <div class="k">DRE</div><div>${s.dre}</div>
      <div class="k">Extent</div><div>${s.extent}${s.ileum?' (terminal ileum intubated)':''}</div>
      <div class="k">Retroflexion</div><div>${s.retro?'Performed in rectum':'Not performed'}</div>
      <div class="k">Withdrawal time</div><div>${s.withdrawal?s.withdrawal+' min':'\u2014'}</div></div>`;
  } else {
    extra = `<div class="kv">
      <div class="k">Extent</div><div>${s.ogdExtent}</div>
      <div class="k">J-manoeuvre</div><div>${s.jman?'Performed':'Not performed'}</div>
      <div class="k">CLO test</div><div>${s.clo}</div></div>`;
  }
  const fh = lines.length ? lines.map(l=>`<div style="margin-bottom:4px"><b>${l.seg}:</b> ${esc(l.t)} \u2014 ${esc(l.txt)}</div>`).join('')
      + `<div style="color:var(--muted);font-size:12px;margin-top:6px">All other examined segments normal to the extent reached.</div>`
    : '<div>No abnormality detected. Examined mucosa normal throughout.</div>';
  const recsAll = s.recs.concat(s.recOther?[s.recOther]:[]);
  document.getElementById('previewWrap').innerHTML = `<div class="rpt">
    <div style="text-align:center;font-weight:800;color:var(--dark);font-size:15px">${isC?'COLONOSCOPY REPORT':'UPPER GI ENDOSCOPY REPORT'}</div>
    <h4>Patient</h4><div class="kv">
      <div class="k">Name</div><div>${esc(s.pt.name)||'\u2014'}</div>
      <div class="k">Age / Sex</div><div>${esc(s.pt.age)||'\u2014'} / ${esc(s.pt.sex)||'\u2014'}</div>
      <div class="k">Date</div><div>${fmtDate(s.pt.date)}</div>
      <div class="k">Referrer</div><div>${esc(s.pt.referrer)||'\u2014'}</div>
      <div class="k">Email</div><div>${esc(s.pt.email)||'\u2014'}</div></div>
    <h4>Indications</h4><div>${esc(inds)}</div>
    <h4>Sedation</h4><div>${esc(sedationText(s))}</div>
    <h4>Procedure</h4>${extra}
    <h4>Findings</h4>${fh}
    <h4>Diagnosis</h4><div style="white-space:pre-wrap">${esc(s.diagnosis||autoDiagnosis())}</div>
    <h4>Complications</h4><div>${esc(s.complications==='Other'?(s.compOther||'Other'):s.complications)}</div>
    <h4>Recommendations</h4><div>${recsAll.map((r,i)=>`${i+1}. ${esc(r)}`).join('<br>')||'\u2014'}</div>
    ${s.photos.length?`<h4>Images (${s.photos.length})</h4><div class="photo-grid">${s.photos.map(p=>`<div class="photo-cell"><img src="${p.data}"><div style="font-size:11.5px;padding:5px 8px">${esc(p.caption)}</div></div>`).join('')}</div>`:''}
  </div>`;
  document.getElementById('previewWrap').style.display='block';
  document.getElementById('formWrap').style.display='none';
  document.getElementById('btnPreview').textContent='Back to form';
  window.scrollTo(0,0);
}

/* ================= PDF ================= */
const MM = {W:210, H:297, ML:16, MR:16};
const C = {sky:[0,150,199], light:[232,244,248], dark:[0,53,84], grey:[91,122,138]};

/* Email: replaced by Share the report in pro.js */

/* makePDF() — saving the PDF — is in pro.js */
function buildPDF(s, isC){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'mm', format:'a4'});
  const W = MM.W, ML = MM.ML, CW = W - MM.ML - MM.MR;
  let y = 0;

  const title = isC ? 'COLONOSCOPY REPORT' : 'UPPER GI ENDOSCOPY REPORT';

  function header(){
    { const lg = logoForPdf(); if(lg){ const lh = 21.1, lw = Math.min(60, lh*lg.ratio); doc.addImage(lg.data, lg.fmt, ML, 10, lw, lh); } }
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica','bold'); doc.setFontSize(14.5);
    doc.text(title, W-MM.MR, 16, {align:'right'});
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.setTextColor(...C.grey);
    doc.text(doctorLine(), W-MM.MR, 22, {align:'right'});
    doc.text(proSet().title, W-MM.MR, 26.5, {align:'right'});
    doc.setDrawColor(...C.sky); doc.setLineWidth(0.5);
    doc.line(ML, 34, W-MM.MR, 34);
    y = 42;
  }
  function footer(pg, total){
    doc.setDrawColor(...C.sky); doc.setLineWidth(0.3);
    doc.line(ML, 283, W-MM.MR, 283);
    doc.setFontSize(8); doc.setTextColor(...C.grey); doc.setFont('helvetica','normal');
    doc.text((s.pt.name||'')+(s.pt.name?'  \u2022  ':'')+fmtDate(s.pt.date), ML, 288);
    doc.text('Page '+pg+' of '+total, W-MM.MR, 288, {align:'right'});
  }
  function needSpace(h){ if(y+h > 278){ doc.addPage(); header(); } }
  function section(t){
    needSpace(13);
    doc.setFillColor(...C.light);
    doc.rect(ML, y, CW, 6.5, 'F');
    doc.setDrawColor(...C.sky); doc.setLineWidth(0.4);
    doc.line(ML, y+6.5, ML+CW, y+6.5);
    doc.setTextColor(...C.dark); doc.setFont('helvetica','bold'); doc.setFontSize(9.5);
    doc.text(t.toUpperCase(), ML+2.5, y+4.4);
    y += 10;
  }
  function fieldRow(pairs){
    needSpace(9);
    const n = pairs.length, cw = CW/n;
    pairs.forEach((p,i)=>{
      const x = ML + i*cw;
      doc.setFillColor(...C.light);
      doc.rect(x, y, cw*0.38, 7, 'F');
      doc.setDrawColor(207,228,238); doc.rect(x, y, cw, 7);
      doc.setTextColor(...C.dark); doc.setFont('helvetica','bold'); doc.setFontSize(7.6);
      doc.text(String(p[0]).toUpperCase(), x+2, y+4.5, {maxWidth:cw*0.38-3});
      doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(20,44,58);
      doc.text(String(p[1]||'\u2014'), x+cw*0.38+2, y+4.8, {maxWidth:cw*0.62-4});
    });
    y += 7;
  }
  function textBlock(txt, opts={}){
    doc.setFont('helvetica', opts.bold?'bold':'normal');
    doc.setFontSize(opts.size||9.5); doc.setTextColor(...(opts.color||[20,44,58]));
    const lines = doc.splitTextToSize(String(txt), CW - (opts.indent||0));
    lines.forEach(ln=>{
      needSpace(6);
      doc.text(ln, ML+(opts.indent||0), y+3.4);
      y += 4.6;
    });
    y += (opts.gap===undefined?1.5:opts.gap);
  }
  function bulletLine(head, rest){
    doc.setFontSize(9.5);
    doc.setFont('helvetica','bold');
    const headTxt = head+':  ';
    const hw = doc.getTextWidth(headTxt);
    doc.setFont('helvetica','normal');
    const lines = doc.splitTextToSize(rest, CW-6-hw);
    needSpace(lines.length*4.6+2);
    doc.setFillColor(...C.sky); doc.circle(ML+1.6, y+2.2, 0.9, 'F');
    doc.setTextColor(20,44,58);
    doc.setFont('helvetica','bold');
    doc.text(headTxt, ML+5, y+3.4);
    doc.setFont('helvetica','normal');
    lines.forEach((ln,i)=>{
      doc.text(ln, ML+5+(i===0?hw:0), y+3.4);
      y += 4.6;
    });
    y += 0.8;
  }
  function numberLine(i, txt){
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(txt, CW-8);
    needSpace(lines.length*4.6+1);
    doc.setFont('helvetica','bold'); doc.setTextColor(...C.sky);
    doc.text(i+'.', ML+1, y+3.4);
    doc.setFont('helvetica','normal'); doc.setTextColor(20,44,58);
    lines.forEach(ln=>{ doc.text(ln, ML+7, y+3.4); y += 4.6; });
    y += 0.6;
  }

  header();

  section('Patient details');
  fieldRow([['Name', s.pt.name],['MRN / ID', s.pt.mrn]]);
  fieldRow([['Age', s.pt.age],['Sex', s.pt.sex],['Date', fmtDate(s.pt.date)]]);
  fieldRow([['Referrer', s.pt.referrer],['Facility', s.pt.facility]]);
  if(s.pt.instrument) fieldRow([['Instrument', s.pt.instrument]]);
  y += 2;

  section('Indications');
  const inds = s.indications.concat(s.indOther?[s.indOther]:[]);
  textBlock(inds.length?inds.join('; ')+'.':'\u2014');
  y += 1;

  section('Sedation & monitoring');
  textBlock(sedationText(s));
  y += 1;

  section(isC?'Preparation & extent':'Procedure detail');
  if(isC){
    const bt = bbpsTotal(s);
    fieldRow([['BBPS', bt===null?'Not scored':bt+' / 9  (R'+s.bbps.R+'  T'+s.bbps.T+'  L'+s.bbps.L+')'],['DRE', s.dre]]);
    fieldRow([['Extent reached', s.extent + (s.ileum?' + terminal ileum':'')],['Withdrawal', s.withdrawal?s.withdrawal+' min':'\u2014']]);
    fieldRow([['Retroflexion (rectum)', s.retro?'Performed':'Not performed'],['Ileal intubation', s.ileum?'Yes':'No']]);
  } else {
    fieldRow([['Extent reached', s.ogdExtent]]);
    fieldRow([['J-manoeuvre', s.jman?'Performed':'Not performed'],['CLO test', s.clo]]);
  }
  y += 2;

  section('Findings');
  const lines = findingsLines(s,isC);
  if(!lines.length){
    textBlock('No abnormality detected. The examined mucosa was normal throughout to the extent reached.');
  } else {
    lines.forEach(l=> bulletLine(l.seg, l.t + ' \u2014 ' + l.txt));
    textBlock('All other examined segments were normal to the extent reached.', {color:C.grey, size:8.8});
  }
  y += 1;

  section('Diagnosis / Conclusion');
  textBlock(s.diagnosis || autoDiagnosis());
  y += 1;

  section('Complications');
  textBlock((s.complications==='Other'?(s.compOther||'Other'):s.complications)+'.');
  y += 1;

  section('Recommendations');
  const recsAll = s.recs.concat(s.recOther?[s.recOther]:[]);
  if(recsAll.length) recsAll.forEach((r,i)=> numberLine(i+1, r));
  else textBlock('\u2014');

  if(s.photos.length){
    section('Endoscopic images');
    const cellW = (CW-6)/2, cellH = 52;
    for(let i=0;i<s.photos.length;i+=2){
      needSpace(cellH+13);
      for(let j=0;j<2;j++){
        const p = s.photos[i+j]; if(!p) break;
        const x = ML + j*(cellW+6);
        const ar = p.w/p.h;
        let iw = cellW-2, ih = iw/ar;
        if(ih>cellH-2){ ih = cellH-2; iw = ih*ar; }
        doc.setDrawColor(207,228,238); doc.rect(x, y, cellW, cellH+8);
        doc.addImage(p.data,'JPEG', x+(cellW-iw)/2, y+1+(cellH-2-ih)/2, iw, ih);
        doc.setFontSize(8); doc.setTextColor(...C.grey); doc.setFont('helvetica','normal');
        doc.text(p.caption||('Image '+(i+j+1)), x+cellW/2, y+cellH+5, {align:'center', maxWidth:cellW-4});
      }
      y += cellH+13;
    }
  }

  needSpace(36);
  y += 8;
  doc.setDrawColor(...C.dark); doc.setLineWidth(0.4);
  doc.line(ML, y+12, ML+72, y+12);
  doc.setFontSize(9.5); doc.setTextColor(...C.dark); doc.setFont('helvetica','bold');
  doc.text(doctorSignName(), ML, y+17);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...C.grey);
  doc.text(proSet().signRole, ML, y+21.5);

  const total = doc.getNumberOfPages();
  for(let p=1;p<=total;p++){ doc.setPage(p); footer(p,total); }

  const nm = (s.pt.name||'Patient').trim().replace(/\s+/g,'_');
  return {doc, name:`${isC?'Colonoscopy':'OGD'}_${nm}_${(s.pt.date||'').replace(/-/g,'')}.pdf`};
}
function fmtDate(d){
  if(!d) return '';
  const [Y,M,D] = d.split('-');
  return `${D}/${M}/${Y}`;
}

/* ================= FULLSCREEN ================= */
function toggleFullscreen(){
  const el = document.documentElement;
  if(!document.fullscreenElement){
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if(req) req.call(el).catch(()=>{});
  } else {
    const ext = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if(ext) ext.call(document);
  }
}
document.addEventListener('fullscreenchange', syncFsBtn);
document.addEventListener('webkitfullscreenchange', syncFsBtn);
function syncFsBtn(){
  const btn = document.getElementById('fsBtn');
  if(!btn) return;
  const on = !!document.fullscreenElement;
  btn.classList.toggle('on', on);
  btn.innerHTML = on ? '&#x2715;' : '&#x26F6;';
}

/* start-up runs from pro.js */
