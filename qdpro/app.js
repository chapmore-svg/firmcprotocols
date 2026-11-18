// The doctor's details are NOT built in (the app's link is public): pro.js fills these from Settings.
const DR={name:"",creds:"",title:"",mcj:"",loc:"",regLabel:"MCJ Reg. No",logo:"",logoRatio:2};
let docType='';

// start-up (dates, signature pad, drafts) runs from pro.js

function tod(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function fmt(s){if(!s)return"";const p=String(s).split("-");const d=p.length===3?new Date(+p[0],+p[1]-1,+p[2]):new Date(s);return d.toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"});}
function toggleFS(){if(!document.fullscreenElement)document.documentElement.requestFullscreen();else document.exitFullscreen();}
function showTab(n){
  document.querySelectorAll(".tc").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".nb").forEach(b=>b.classList.remove("active"));
  document.getElementById("tab-"+n).classList.add("active");
  ["rx","ref","sl","img","lor","pv"].forEach((t,i)=>{if(t===n)document.querySelectorAll(".nb")[i].classList.add("active");});
}
function calcAge(p){
  const dob=document.getElementById(p+"-dob").value;
  if(!dob||dob.length<10)return;
  const today=new Date();
  const parts=dob.split("-");
  const birth=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  if(isNaN(birth.getTime()))return;
  let age=today.getFullYear()-birth.getFullYear();
  const m=today.getMonth()-birth.getMonth();
  if(m<0||(m===0&&today.getDate()<birth.getDate()))age--;
  if(age>=0&&age<130)document.getElementById(p+"-age").value=age+" yrs";
}

// Android date picker fix — catches all date input changes via event delegation
document.addEventListener("DOMContentLoaded",()=>{
  document.body.addEventListener("change",function(e){
    if(e.target&&e.target.type==="date"&&e.target.id&&e.target.id.endsWith("-dob")){
      const prefix=e.target.id.replace("-dob","");
      calcAge(prefix);
    }
  });
  document.body.addEventListener("input",function(e){
    if(e.target&&e.target.type==="date"&&e.target.id&&e.target.id.endsWith("-dob")){
      const prefix=e.target.id.replace("-dob","");
      calcAge(prefix);
    }
  });
});
function selClinic(el,p,name){
  document.querySelectorAll("#"+p+"-chips .chip").forEach(c=>c.classList.remove("sel"));
  el.classList.add("sel");
  document.getElementById(p+"-clinic").value=name;
}
function addDrug(){
  const list=document.getElementById("rx-list");
  const num=list.querySelectorAll(".rxi").length+1;
  const d=document.createElement("div");d.className="rxi";
  d.innerHTML=`<div class="rxn">Drug ${num}</div><div class="fr"><div class="f"><label>Drug Name</label><input class="dn" placeholder="Drug name"></div><div class="f"><label>Dose</label><input class="dd2" placeholder="Dose"></div></div><div class="fr t"><div class="f"><label>Route</label><input class="dr2" placeholder="Route"></div><div class="f"><label>Frequency</label><input class="df" placeholder="e.g. BD"></div><div class="f"><label>Duration</label><input class="du" placeholder="e.g. 5 days"></div></div><div class="fr"><div class="f"><label>Repeat</label><input class="drp" placeholder="x1/None"></div><div class="f"><label>Notes</label><input class="dnt" placeholder="Instructions"></div></div>`;
  list.appendChild(d);
}
function clr(p){
  document.querySelectorAll(`#tab-${p} input,#tab-${p} select,#tab-${p} textarea`).forEach(el=>{
    if(el.readOnly)return;
    if(el.type==="date"){
      if(el.id&&(el.id.endsWith("-date")||el.id==="sl-from"))el.value=tod();
      else el.value="";
    }else el.value="";
  });
  document.querySelectorAll(`#${p}-chips .chip`).forEach(c=>c.classList.remove("sel"));
  if(p==="rx"){
    const list=document.getElementById("rx-list");
    while(list.children.length>1)list.removeChild(list.lastChild);
    list.querySelectorAll(".dn,.dd2,.dr2,.df,.du,.drp,.dnt").forEach(i=>i.value="");
  }
}

// ── BUILDERS ──────────────────────────────────
function bHdr(clinic){
  return`<div class="dh">${DR.logo?`<img src="${DR.logo}" class="dl" alt="Logo">`:""}<div><div class="dn">${DR.name}</div><div class="dc">${DR.creds} &middot; ${DR.title}</div><div class="di">${clinic} &middot; ${DR.loc}</div></div></div>`;
}
function bPt(name,dob,age,sex,date){
  return`<div class="ds">PATIENT DETAILS</div>
    <div class="dr"><div class="dl2">Patient Name</div><div class="dv">${name||"—"}</div></div>
    ${dob?`<div class="dr"><div class="dl2">Date of Birth</div><div class="dv">${fmt(dob)}${sex?" &middot; "+sex:""}</div></div>`:""}
    ${age?`<div class="dr"><div class="dl2">Age</div><div class="dv">${age}</div></div>`:""}
    <div class="dr"><div class="dl2">Date</div><div class="dv">${fmt(date||tod())}</div></div>`;
}
function bSig(date){
  return`<div class="sig-block"><div class="sig-line"></div><div class="sig-name">${DR.name}</div><div class="sig-det">${DR.creds}<br>${DR.title}${DR.mcj?`<br>${DR.regLabel}: ${DR.mcj}`:""}<br>Date: ${fmt(date||tod())}</div></div>`;
}
function bFtr(clinic,note){
  return`<div class="dfb">${DR.mcj?`${DR.regLabel}: ${DR.mcj} &middot; `:""}${clinic} &middot; ${DR.loc}${note?" &middot; "+note:""}</div>`;
}
function show(html,type){
  docType=type;
  document.getElementById("dp").innerHTML=html;
  document.getElementById("sda").style.display="block";
  showTab("pv");
}

// ── GENERATORS ────────────────────────────────
function gen(type){
  if(type==="rx") genRx();
  else if(type==="ref") genRef();
  else if(type==="sl") genSL();
  else if(type==="img") genImg();
  else if(type==="lor") genLOR();
}

function genRx(){
  const fn=document.getElementById("rx-fn").value.trim();
  const ln=document.getElementById("rx-ln").value.trim();
  const name=`${fn} ${ln}`.trim()||"—";
  const dob=document.getElementById("rx-dob").value;
  const age=document.getElementById("rx-age").value;
  const sex=document.getElementById("rx-sex").value;
  const date=document.getElementById("rx-date").value;
  const clinic=document.getElementById("rx-clinic").value||"Private Practice";
  let drugs="";let num=1;
  document.querySelectorAll("#rx-list .rxi").forEach(row=>{
    const n=row.querySelector(".dn")?.value||"";
    const dose=row.querySelector(".dd2")?.value||"";
    const route=row.querySelector(".dr2")?.value||"";
    const freq=row.querySelector(".df")?.value||"";
    const dur=row.querySelector(".du")?.value||"";
    const rep=row.querySelector(".drp")?.value||"";
    const note=row.querySelector(".dnt")?.value||"";
    if(!n)return;
    const allParts=[n+(dose?" "+dose:""),[route,freq,dur].filter(Boolean).join(" · "),(rep?"Repeat: "+rep:""),(note?note:"")].filter(Boolean);
    drugs+=`<div class="dd"><div class="ddn">${num}. ${allParts.join(" &middot; ")}</div></div>`;
    num++;
  });
  if(!drugs){alert("Please enter at least one drug.");return;}
  show(bHdr(clinic)+bPt(name,dob,age,sex,date)+`<div class="drx">Rx</div><div class="ds">PRESCRIPTION</div>`+drugs+bSig(date)+bFtr(clinic,"Valid 30 days from date of issue"),"rx");
}

function genRef(){
  const fn=document.getElementById("ref-fn").value.trim();
  const ln=document.getElementById("ref-ln").value.trim();
  if(!fn&&!ln){alert("Please enter patient name.");return;}
  const name=`${fn} ${ln}`.trim();
  const dob=document.getElementById("ref-dob").value;
  const age=document.getElementById("ref-age").value;
  const sex=document.getElementById("ref-sex").value;
  const date=document.getElementById("ref-date").value;
  const clinic=document.getElementById("ref-clinic").value||"Private Practice";
  const spec=document.getElementById("ref-spec").value;
  const doc2=document.getElementById("ref-doc").value;
  const fac=document.getElementById("ref-fac").value;
  const urg=document.getElementById("ref-urg").value;
  const dx=document.getElementById("ref-dx").value;
  const hx=document.getElementById("ref-hx").value;
  const inv=document.getElementById("ref-inv").value;
  const mgmt=document.getElementById("ref-mgmt").value;
  const req=document.getElementById("ref-req").value;
  const toLine=[spec,doc2,fac].filter(Boolean).join(" — ");
  const urgBadge=urg==="Urgent"?"&#9888;&#65039; URGENT — ":urg==="Emergency"?"&#128680; EMERGENCY — ":"";
  const body=`
    <div class="ds">REFERRAL DETAILS</div>
    <div class="dr"><div class="dl2">Referring To</div><div class="dv">${toLine||"—"}</div></div>
    <div class="dr"><div class="dl2">Diagnosis</div><div class="dv">${dx||"—"}</div></div>
    <div class="dr"><div class="dl2">Urgency</div><div class="dv">${urgBadge}${urg}</div></div>
    ${hx?`<div class="ds">HISTORY &amp; EXAMINATION</div><div class="db">${hx}</div>`:""}
    ${inv?`<div class="ds">INVESTIGATIONS TO DATE</div><div class="db">${inv}</div>`:""}
    ${mgmt?`<div class="ds">MANAGEMENT SO FAR</div><div class="db">${mgmt}</div>`:""}
    <div class="ds">REQUEST</div>
    <div class="db">${req||"Please assess and advise re: further management of this patient."}</div>
    <p style="margin-top:14px;font-size:.84rem">Thank you for your kind assistance with this patient.</p>`;
  show(bHdr(clinic)+bPt(name,dob,age,sex,date)+body+bSig(date)+bFtr(clinic),"ref");
}

function genSL(){
  const fn=document.getElementById("sl-fn").value.trim();
  const ln=document.getElementById("sl-ln").value.trim();
  if(!fn&&!ln){alert("Please enter patient name.");return;}
  const name=`${fn} ${ln}`.trim();
  const dob=document.getElementById("sl-dob").value;
  const age=document.getElementById("sl-age").value;
  const sex=document.getElementById("sl-sex").value;
  const date=document.getElementById("sl-date").value;
  const clinic=document.getElementById("sl-clinic").value||"Private Practice";
  const from=document.getElementById("sl-from").value;
  const to=document.getElementById("sl-to").value;
  const reason=document.getElementById("sl-reason").value;
  const emp=document.getElementById("sl-emp").value;
  if(!from||!to){alert("Please enter sick leave dates.");return;}
  const body=`<div class="ds">SICK LEAVE CERTIFICATE</div>
    <div class="db">${emp?"To: "+emp+"\n\n":""}This is to certify that <strong>${name}</strong> was examined by the undersigned on <strong>${fmt(date)}</strong> and is medically unfit for work${reason?" due to "+reason:" due to a medical condition"}.

Sick leave is granted from <strong>${fmt(from)}</strong> to <strong>${fmt(to)}</strong> inclusive.

This certificate is issued in good faith based on clinical examination.</div>`;
  show(bHdr(clinic)+bPt(name,dob,age,sex,date)+body+bSig(date)+bFtr(clinic),"sl");
}

function genImg(){
  const fn=document.getElementById("img-fn").value.trim();
  const ln=document.getElementById("img-ln").value.trim();
  if(!fn&&!ln){alert("Please enter patient name.");return;}
  const name=`${fn} ${ln}`.trim();
  const dob=document.getElementById("img-dob").value;
  const age=document.getElementById("img-age").value;
  const sex=document.getElementById("img-sex").value;
  const date=document.getElementById("img-date").value;
  const clinic=document.getElementById("img-clinic").value||"Private Practice";
  const mod=document.getElementById("img-mod").value;
  const region=document.getElementById("img-region").value;
  const contrast=document.getElementById("img-contrast").value;
  const pri=document.getElementById("img-pri").value;
  const ind=document.getElementById("img-ind").value;
  const q=document.getElementById("img-q").value;
  if(!mod){alert("Please select an imaging modality.");return;}
  const body=`
    <div class="ds">EXAMINATION REQUESTED</div>
    <div class="dr"><div class="dl2">Modality</div><div class="dv">${mod}</div></div>
    <div class="dr"><div class="dl2">Region / Area</div><div class="dv">${region||"—"}</div></div>
    ${contrast?`<div class="dr"><div class="dl2">Contrast</div><div class="dv">${contrast}</div></div>`:""}
    <div class="dr"><div class="dl2">Priority</div><div class="dv">${pri}</div></div>
    ${ind?`<div class="ds">CLINICAL INDICATION</div><div class="db">${ind}</div>`:""}
    ${q?`<div class="ds">CLINICAL QUESTION</div><div class="db">${q}</div>`:""}
    ${contrast&&contrast.includes("IV")?`<p style="margin-top:10px;font-size:.78rem;color:var(--muted)">&#9888;&#65039; Please screen for contrast allergy and check eGFR prior to IV contrast administration.</p>`:""}`;
  show(bHdr(clinic)+bPt(name,dob,age,sex,date)+body+bSig(date)+bFtr(clinic),"img");
}

function genLOR(){
  const name=document.getElementById("lor-name").value.trim();
  if(!name){alert("Please enter the subject's name.");return;}
  const to=document.getElementById("lor-to").value.trim()||"To Whom It May Concern";
  const date=document.getElementById("lor-date").value;
  const years=document.getElementById("lor-years").value.trim();
  const capacity=document.getElementById("lor-capacity").value.trim()||"colleague";
  const purpose=document.getElementById("lor-purpose").value.trim()||"general purposes";
  const qualities=document.getElementById("lor-qualities").value.trim();
  const notes=document.getElementById("lor-notes").value.trim();
  const contact=document.getElementById("lor-contact").value.trim();
  const PR={he:{he:"he",his:"his"},she:{he:"she",his:"her"},they:{he:"they",his:"their"}}[document.getElementById("lor-pron").value]||{he:"he",his:"his"};
  const aT=DR.title||"medical practitioner", aTitle=(/^[aeiou]/i.test(aT)?"an ":"a ")+aT;

  const qualList=qualities?qualities.split(/[,;\n]+/).map(q=>q.trim()).filter(Boolean):["integrity","professionalism","good character"];
  const qualStr=qualList.length>1?qualList.slice(0,-1).join(", ")+" and "+qualList[qualList.length-1]:qualList[0]||"integrity and good character";

  const body=`
    <div class="ds">LETTER OF RECOMMENDATION</div>
    <div class="db">${fmt(date)}

${to},

RE: ${name.toUpperCase()}

I am pleased to write this letter of recommendation on behalf of ${name}. I have had the pleasure of knowing ${name} in my capacity as ${aTitle}${years?" for "+years:""}${capacity&&capacity!=="colleague"?", in the capacity of "+capacity:""}.

During this time, I have consistently observed ${name} to be a person of exceptional ${qualStr}. ${name} has demonstrated a commendable level of dedication and conduct that reflects positively on both ${PR.his} personal and professional character.${notes?"\n\n"+notes:""}

It is therefore with great confidence and without reservation that I recommend ${name} for ${purpose}. I am fully persuaded that ${name} will prove to be a worthy and valuable individual in any endeavour ${PR.he} undertake${PR.he==="they"?"":"s"}.

Any courtesies extended to ${name} will be greatly appreciated.

Yours faithfully,${contact?"\n\nFor further information, please feel free to contact me at: "+contact:""}</div>`;

  show(bHdr(document.getElementById("lor-clinic").value.trim()||letterLine())+body+bSig(date)+bFtr(DR.loc),"lor");
}

// ── SIGNATURE ─────────────────────────────────
function initSig(){
  const canvas=document.getElementById("sc");
  const ctx=canvas.getContext("2d");
  let drawing=false;
  function pos(e){
    const r=canvas.getBoundingClientRect();
    const s=e.touches?e.touches[0]:e;
    return{x:(s.clientX-r.left)*(canvas.width/r.width),y:(s.clientY-r.top)*(canvas.height/r.height)};
  }
  function start(e){e.preventDefault();drawing=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);}
  function draw(e){e.preventDefault();if(!drawing)return;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.strokeStyle="#003554";ctx.lineWidth=2;ctx.lineCap="round";ctx.stroke();}
  function stop(){drawing=false;}
  canvas.addEventListener("mousedown",start);canvas.addEventListener("mousemove",draw);canvas.addEventListener("mouseup",stop);
  canvas.addEventListener("touchstart",start,{passive:false});canvas.addEventListener("touchmove",draw,{passive:false});canvas.addEventListener("touchend",stop);
  setTimeout(()=>{canvas.width=canvas.offsetWidth||400;},100);
}
function clrSig(){
  const c=document.getElementById("sc");
  c.getContext("2d").clearRect(0,0,c.width,c.height);
}

// ── PDF (Template — SKY/DARK/LIGHT_BLUE) ────────────────────────────
// Builds the PDF of the document on screen. Returns {doc, name}; saving/sharing is in pro.js.
function buildDocPdf(){
  const preview=document.getElementById("dp");
  if(!preview.querySelector(".dh")){alert("Preview a document first.");return null;}
  if(typeof window.jspdf==="undefined"){alert("The PDF maker didn't load. Reopen the app and try again.");return null;}
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  const W=210, M=18, CW=W-M*2;
  const SKY=[0,150,199], DARK=[0,53,84], LB=[232,244,248], WHITE=[255,255,255], CHARCOAL=[26,42,53], MUTED=[107,138,154];

  // ── HEADER: white background, logo + dark text, slim SKY accent lines ────
  // Top accent line
  doc.setFillColor(...SKY); doc.rect(0,0,W,1.5,"F");
  // White header background
  doc.setFillColor(...WHITE); doc.rect(0,1.5,W,40,"F");
  // Logo
  if(DR.logo){ let lw=38, lh=lw/DR.logoRatio; if(lh>32){ lh=32; lw=lh*DR.logoRatio; } doc.addImage(DR.logo,/^data:image\/jpe?g/.test(DR.logo)?"JPEG":"PNG",M,3+(32-lh)/2,lw,lh); }
  // Doctor name in DARK
  doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(...DARK);
  doc.text(DR.name, M+44, 14);
  // Credentials
  doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text(DR.creds+" · "+DR.title, M+44, 20);
  // Clinic line
  const instEl=preview.querySelector(".di");
  const clinicLine=instEl?instEl.textContent.trim():"";
  doc.setFontSize(8); doc.setTextColor(...SKY);
  doc.text(clinicLine, M+44, 27);
  // MCJ
  doc.setFontSize(7); doc.setTextColor(...MUTED);
  if(DR.mcj) doc.text(DR.regLabel+": "+DR.mcj, M+44, 33);
  // Bottom accent line
  doc.setFillColor(...SKY); doc.rect(0,41.5,W,1.5,"F");

  let y=50; // start below header

  // ── DOCUMENT TITLE (type label) ────────────────────────────────────────────
  const typeLabels={rx:"PRESCRIPTION",ref:"REFERRAL LETTER",sl:"SICK LEAVE CERTIFICATE",img:"IMAGING REQUEST",lor:"LETTER OF RECOMMENDATION"};
  const titleText=typeLabels[docType]||"DOCUMENT";
  doc.setFillColor(...DARK); doc.rect(M,y,CW,8,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(...WHITE);
  doc.text(titleText, W/2, y+5.5, {align:"center"});
  y+=12;

  // ── CONTENT SECTIONS ───────────────────────────────────────────────────────
  preview.querySelectorAll(".ds,.dr,.drx,.dd,.db,.sig-block,.dfb").forEach(el=>{
    if(y>272){doc.addPage();y=20;}

    if(el.classList.contains("ds")){
      // Section bar — SKY background
      doc.setFillColor(...SKY); doc.rect(M,y,CW,6.5,"F");
      doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(...WHITE);
      doc.text(el.textContent.trim(), M+3, y+4.5);
      y+=9;

    }else if(el.classList.contains("dr")){
      // Field row — LIGHT_BLUE label, white value
      const lbl=el.querySelector(".dl2"), val=el.querySelector(".dv");
      if(lbl&&val){
        const ROW_H=7, LBL_W=52;
        doc.setFillColor(...LB); doc.rect(M,y,LBL_W,ROW_H,"F");
        doc.setFillColor(...WHITE); doc.rect(M+LBL_W,y,CW-LBL_W,ROW_H,"F");
        doc.setDrawColor(200,220,232); doc.setLineWidth(0.3);
        doc.rect(M,y,CW,ROW_H,"S");
        doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(...DARK);
        doc.text(lbl.textContent.trim(), M+2, y+4.8);
        doc.setFont("helvetica","normal"); doc.setTextColor(...CHARCOAL);
        // Wrap long values
        const valLines=doc.splitTextToSize(val.textContent.trim(), CW-LBL_W-4);
        if(valLines.length>1){
          valLines.forEach((line,i)=>{
            if(i>0){
              doc.setFillColor(...WHITE); doc.rect(M,y+ROW_H*i,CW,ROW_H,"F");
              doc.setDrawColor(200,220,232); doc.rect(M,y+ROW_H*i,CW,ROW_H,"S");
            }
            doc.text(line, M+LBL_W+2, y+4.8+ROW_H*i);
          });
          y+=ROW_H*valLines.length+1;
        }else{
          doc.text(valLines[0]||"", M+LBL_W+2, y+4.8);
          y+=ROW_H+1;
        }
      }

    }else if(el.classList.contains("drx")){
      // Rx symbol
      y+=2;
      doc.setFont("helvetica","bold"); doc.setFontSize(22); doc.setTextColor(...DARK);
      doc.text("Rx", M, y+10); y+=14;

    }else if(el.classList.contains("dd")){
      // Drug line — single line, indented
      const dn=el.querySelector(".ddn");
      if(dn){
        const lines=doc.splitTextToSize(dn.textContent.trim(), CW-8);
        doc.setFont("helvetica","bold"); doc.setFontSize(9.5); doc.setTextColor(...DARK);
        lines.forEach(line=>{
          if(y>272){doc.addPage();y=20;}
          doc.text(line, M+6, y+3); y+=5.5;   /* +3: the first drug no longer overlaps the section bar */
        });
      }
      y+=2;

    }else if(el.classList.contains("db")){
      // Body text — normal, wrapped
      doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(...CHARCOAL);
      const rawText=el.innerText||el.textContent;
      const paras=rawText.split(/\n+/);
      paras.forEach(para=>{
        if(!para.trim()) return;
        const lines=doc.splitTextToSize(para.trim(), CW);
        lines.forEach(line=>{
          if(y>272){doc.addPage();y=20;}
          doc.text(line, M, y); y+=5.5;
        });
        y+=2;
      });
      y+=2;

    }else if(el.classList.contains("sig-block")){
      y+=10;
      // Embed drawn signature if present
      const canvas=document.getElementById("sc");
      const blank=document.createElement("canvas"); blank.width=canvas.width; blank.height=canvas.height;
      if(canvas.toDataURL()!==blank.toDataURL()){
        doc.addImage(canvas.toDataURL("image/png"),"PNG",M,y-2,55,18);
        y+=20;
      }
      // Sig line
      doc.setDrawColor(...DARK); doc.setLineWidth(0.5); doc.line(M,y,M+60,y); y+=4;
      doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...DARK);
      doc.text(DR.name, M, y); y+=5;
      doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...CHARCOAL);
      doc.text(DR.creds, M, y); y+=4.5;
      doc.text(DR.title, M, y); y+=4.5;
      if(DR.mcj){ doc.text(DR.regLabel+": "+DR.mcj, M, y); y+=4.5; }
      // Date from sig block
      const sigDet=el.querySelector(".sig-det");
      if(sigDet){
        const lines=sigDet.textContent.split("\n").map(l=>l.trim()).filter(Boolean);
        const dateLine=lines.find(l=>l.startsWith("Date:"));
        if(dateLine){doc.text(dateLine, M, y); y+=4.5;}
      }
      y+=4;

    }else if(el.classList.contains("dfb")){
      // Footer bar — SKY line + centred text
      if(y<270) y=Math.max(y,270);
      doc.setFillColor(...SKY); doc.rect(0,y,W,2,"F"); y+=4;
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...MUTED);
      doc.text(el.textContent.trim(), W/2, y, {align:"center"});
    }
  });

  // ── SAVE ──────────────────────────────────────────────────────────────────
  const typeLabel={rx:"Prescription",ref:"Referral",sl:"Sick_Leave",img:"Imaging_Request",lor:"Recommendation_Letter"}[docType]||"Document";
  const pname=(preview.querySelector(".dv")?.textContent||"document").replace(/\s+/g,"_").substring(0,20);
  return {doc, name:`${typeLabel}_${pname}_${tod()}.pdf`};
}
