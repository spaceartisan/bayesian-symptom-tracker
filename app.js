const APP_VERSION = '0.5.0';
const STATE_SCHEMA_VERSION = 4;
const DB_NAME = 'BayesianSymptomTracker';
const DB_VERSION = 1;
const STORE = 'kv';
let knowledge;
let state;
let currentView = 'dashboard';
let editingObservationId = null;
let editingClinicalId = null;
let editingDietId = null;
let editingDiagnosisId = null;

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const nowLocalInput = () => {
  const d = new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,16);
};
const escapeHtml = s => String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDateTime = iso => new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(iso));
const fmtDate = iso => new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'}).format(new Date(iso));
const hoursBetween = (a,b) => Math.max(0,(new Date(b)-new Date(a))/36e5);

function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
async function dbGet(key){ const db=await openDb(); return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}); }
async function dbSet(key,val){ const db=await openDb(); return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(val,key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);}); }

function makePet(seed={}){
  return {
    id:seed.id||uid(), name:seed.name||'My cat', species:'cat', sex:seed.sex||'unknown',
    birthDate:seed.birthDate||'', weight:seed.weight||'', breed:seed.breed||'', neuterStatus:seed.neuterStatus||'unknown', bodyConditionScore:seed.bodyConditionScore||'', vetName:seed.vetName||'', vetPhone:seed.vetPhone||''
  };
}
function makeEpisode(petId,title='Current episode',start=new Date().toISOString()){
  return {id:uid(),petId,title,start,end:null,status:'open',linkedEpisodeIds:[]};
}
function defaultState(){
  const pet=makePet();
  const episode=makeEpisode(pet.id);
  return {
    schemaVersion:STATE_SCHEMA_VERSION, pets:[pet], episodes:[episode], observations:[], clinicalMeasurements:[], diets:[], diagnoses:[],
    settings:{activePetId:pet.id,activeEpisodeId:episode.id,modelPack:'cat-practical-differentials-v0.5',reportModel:true,reportUrgency:true,reportNotes:true,reportClinical:true,reportDiet:true},
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
}
function migrateState(raw){
  const s=raw && typeof raw==='object' ? raw : defaultState();
  s.settings={reportModel:true,reportUrgency:true,reportNotes:true,reportClinical:true,reportDiet:true,reportHistory:true,...(s.settings||{})}; s.episodes ||= []; s.observations ||= []; s.clinicalMeasurements ||= []; s.diets ||= []; s.diagnoses ||= [];
  if(!Array.isArray(s.pets) || !s.pets.length){
    const legacy=s.profile||{}; const pet=makePet(legacy); s.pets=[pet];
    s.episodes.forEach(e=>{ if(!e.petId) e.petId=pet.id; });
    s.settings.activePetId=pet.id; delete s.profile;
  }
  s.pets=s.pets.map(p=>makePet(p));
  if(!s.pets.some(p=>p.id===s.settings.activePetId)) s.settings.activePetId=s.pets[0].id;
  s.episodes.forEach(e=>{ if(!e.petId) e.petId=s.settings.activePetId; if(!Array.isArray(e.linkedEpisodeIds)) e.linkedEpisodeIds=[]; });
  const petId=s.settings.activePetId;
  let petEps=s.episodes.filter(e=>e.petId===petId).sort((a,b)=>new Date(b.start)-new Date(a.start));
  if(!petEps.length){ const ep=makeEpisode(petId); s.episodes.push(ep); petEps=[ep]; }
  if(!petEps.some(e=>e.id===s.settings.activeEpisodeId)) s.settings.activeEpisodeId=(petEps.find(e=>e.status==='open')||petEps[0]).id;
  s.observations.forEach(o=>{ if(!o.confidence) o.confidence='high'; });
  s.clinicalMeasurements.forEach(m=>{ if(!m.petId) m.petId=s.settings.activePetId; if(!m.confidence) m.confidence='high'; if(m.useInModel===undefined) m.useInModel=true; });
  s.diets.forEach(d=>{ if(!d.petId) d.petId=s.settings.activePetId; });
  s.diagnoses.forEach(d=>{ if(!d.petId) d.petId=s.settings.activePetId; if(d.useInModel===undefined) d.useInModel=(d.status==='confirmed_active'||d.status==='probable_active'); });
  s.schemaVersion=STATE_SCHEMA_VERSION;
  return s;
}
async function save(){ state.updatedAt=new Date().toISOString(); await dbSet('state',state); }
function activePet(){ return state.pets.find(p=>p.id===state.settings.activePetId) || state.pets[0]; }
function petEpisodes(petId=state.settings.activePetId){ return state.episodes.filter(e=>e.petId===petId).sort((a,b)=>new Date(b.start)-new Date(a.start)); }
function activeEpisode(){ return petEpisodes().find(e=>e.id===state.settings.activeEpisodeId) || petEpisodes()[0]; }
function episodeObservations(id=state.settings.activeEpisodeId){ return state.observations.filter(o=>o.episodeId===id).sort((a,b)=>new Date(a.time)-new Date(b.time)); }
function petClinicalMeasurements(petId=state.settings.activePetId){ return state.clinicalMeasurements.filter(m=>m.petId===petId).sort((a,b)=>new Date(a.time)-new Date(b.time)); }
function episodeClinicalMeasurements(id=state.settings.activeEpisodeId){ return state.clinicalMeasurements.filter(m=>m.episodeId===id).sort((a,b)=>new Date(a.time)-new Date(b.time)); }
function petDiets(petId=state.settings.activePetId){ return state.diets.filter(d=>d.petId===petId).sort((a,b)=>new Date(b.startDate||0)-new Date(a.startDate||0)); }
function petDiagnoses(petId=state.settings.activePetId){ return state.diagnoses.filter(d=>d.petId===petId).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)); }
function linkedEpisodes(ep=activeEpisode()){ if(!ep) return []; const ids=new Set(ep.linkedEpisodeIds||[]); return petEpisodes(ep.petId).filter(e=>ids.has(e.id)); }
function episodeDiets(ep=activeEpisode()){
  if(!ep) return [];
  const start=new Date(ep.start).getTime(), end=new Date(ep.end||new Date().toISOString()).getTime();
  return petDiets().filter(d=>{ const ds=d.startDate?new Date(d.startDate+'T00:00:00').getTime():-Infinity; const de=d.endDate?new Date(d.endDate+'T23:59:59').getTime():Infinity; return ds<=end && de>=start; });
}
async function switchPet(petId){
  if(!state.pets.some(p=>p.id===petId)) return;
  state.settings.activePetId=petId;
  let eps=petEpisodes(petId);
  if(!eps.length){ const ep=makeEpisode(petId); state.episodes.push(ep); eps=[ep]; }
  state.settings.activeEpisodeId=(eps.find(e=>e.status==='open')||eps[0]).id;
  await save(); updateContextButtons(); render();
}
function finding(id){ return knowledge.findings.find(f=>f.id===id); }
function hypothesis(id){ return knowledge.hypotheses.find(h=>h.id===id); }
function measurementTemplate(id){ return (knowledge.measurementTemplates||[]).find(t=>t.id===id); }
function clinicalFindingFor(m){ const t=measurementTemplate(m.templateId); return t?.modelMap?.[m.interpretation] || null; }
function confidenceWeight(level){ return level==='low'?0.45:level==='medium'?0.75:1; }
function severityWeight(level){ return level==='high'?1.12:level==='low'?0.90:1; }
function ageYearsAt(iso,pet=activePet()){
  if(!pet?.birthDate||!iso) return null;
  const b=new Date(pet.birthDate+'T12:00:00'), d=new Date(iso);
  if(!Number.isFinite(b.getTime())||!Number.isFinite(d.getTime())) return null;
  return Math.max(0,(d-b)/(365.2425*864e5));
}
function mean(arr){ return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0; }
function distinctDayCount(records){ return new Set(records.map(r=>new Date(r.time).toISOString().slice(0,10))).size; }
function temporalMode(fid){ return finding(fid)?.temporalMode || (finding(fid)?.stateGroup?'state':'event'); }
function deriveOwnerEvidence(episodeId=state.settings.activeEpisodeId,sourceWeight=1,scope='current'){
  const obs=episodeObservations(episodeId);
  const cfg=knowledge.inferenceConfig||{};
  const groups=new Map();
  obs.forEach(o=>{ if(!groups.has(o.findingId)) groups.set(o.findingId,[]); groups.get(o.findingId).push(o); });
  const latestStateByGroup=new Map();
  obs.filter(o=>o.present!==false && finding(o.findingId)?.stateGroup).forEach(o=>{
    const g=finding(o.findingId).stateGroup, prev=latestStateByGroup.get(g);
    if(!prev||new Date(o.time)>new Date(prev.time)) latestStateByGroup.set(g,o);
  });
  const out=[];
  for(const [fid,records] of groups){
    const f=finding(fid); if(!f) continue;
    const pos=records.filter(r=>r.present!==false).sort((a,b)=>new Date(a.time)-new Date(b.time));
    const neg=records.filter(r=>r.present===false).sort((a,b)=>new Date(a.time)-new Date(b.time));
    if(pos.length){
      const first=pos[0], last=pos[pos.length-1], days=distinctDayCount(pos), span=Math.max(0,(new Date(last.time)-new Date(first.time))/864e5);
      const persistence=Math.min(cfg.maxTemporalWeight||1.65,1 + 0.18*Math.log2(Math.max(1,days)) + 0.10*Math.log2(1+span/7));
      const sev=mean(pos.map(r=>severityWeight(r.severity)));
      const conf=mean(pos.map(r=>confidenceWeight(r.confidence||'high')));
      let historical=1;
      if(f.stateGroup){ const latest=latestStateByGroup.get(f.stateGroup); if(latest && latest.findingId!==fid) historical=cfg.historicalStateWeight||0.28; }
      const w=sourceWeight*persistence*sev*conf*historical;
      out.push({id:`owner:${episodeId}:${fid}:present`,findingId:fid,present:true,time:last.time,severity:last.severity||'medium',confidence:last.confidence||'high',notes:last.notes||'',evidenceType:scope==='current'?'owner':'linked_owner',sourceEpisodeId:episodeId,sourceScope:scope,weight:w,rawCount:pos.length,distinctDays:days,spanDays:span,summary:pos.length===1?'observed once':`${pos.length} observations across ${days} day${days===1?'':'s'}${span>=1?`, spanning ${span.toFixed(span<10?1:0)} d`:''}${historical<1?' · historical state':''}`});
    }
    if(neg.length){
      const lastNeg=neg[neg.length-1], lastPos=pos[pos.length-1];
      // A later explicit negative is useful evidence of non-persistence/resolution. Earlier negatives do not erase later positive events.
      if(!lastPos || new Date(lastNeg.time)>new Date(lastPos.time)){
        const days=distinctDayCount(neg), monitoring=1+Math.min(.35,.12*Math.log2(Math.max(1,days)));
        const conf=mean(neg.map(r=>confidenceWeight(r.confidence||'high')));
        const w=sourceWeight*(cfg.negativeCheckBaseWeight||.60)*monitoring*conf;
        out.push({id:`owner:${episodeId}:${fid}:absent`,findingId:fid,present:false,time:lastNeg.time,severity:'medium',confidence:lastNeg.confidence||'high',notes:lastNeg.notes||'',evidenceType:scope==='current'?'owner':'linked_owner',sourceEpisodeId:episodeId,sourceScope:scope,weight:w,rawCount:neg.length,distinctDays:days,spanDays:0,summary:`explicitly not observed${days>1?` on ${days} monitored days`:''}`});
      }
    }
  }
  return out;
}
function clinicalMagnitudeFactor(m,t){
  if(!t || t.kind!=='numeric') return 1.10;
  const x=parseFloat(m.value); if(!Number.isFinite(x)) return 1;
  let deviation=0;
  const lo=parseFloat(m.refLow), hi=parseFloat(m.refHigh);
  if(m.interpretation==='high' && Number.isFinite(hi) && x>hi){
    const span=Number.isFinite(lo)&&hi>lo ? hi-lo : Math.max(Math.abs(hi)*.25,1e-6);
    deviation=(x-hi)/span;
  } else if(m.interpretation==='low' && Number.isFinite(lo) && x<lo){
    const span=Number.isFinite(hi)&&hi>lo ? hi-lo : Math.max(Math.abs(lo)*.25,1e-6);
    deviation=(lo-x)/span;
  } else if(t.quantitativeAnchor && t.quantitativeAnchor.direction===m.interpretation){
    const a=parseFloat(t.quantitativeAnchor.value);
    if(Number.isFinite(a)&&a>0){
      if(m.interpretation==='high'&&x>a) deviation=Math.log2(x/a);
      if(m.interpretation==='low'&&x>0&&x<a) deviation=Math.log2(a/x);
    }
  }
  return Math.min(1.38,1+0.22*Math.log2(1+Math.max(0,deviation)*3));
}
function clinicalEvidence(measurements=episodeClinicalMeasurements(),sourceWeight=1,scope='current'){
  const cfg=knowledge.inferenceConfig||{}, groups=new Map();
  for(const m of measurements){
    if(!m.useInModel) continue;
    const fid=clinicalFindingFor(m); if(!fid) continue;
    const key=fid; if(!groups.has(key))groups.set(key,[]); groups.get(key).push(m);
  }
  const out=[];
  for(const [fid,records0] of groups){
    const records=[...records0].sort((a,b)=>new Date(a.time)-new Date(b.time));
    const weighted=records.map(m=>{const t=measurementTemplate(m.templateId),mag=clinicalMagnitudeFactor(m,t),conf=confidenceWeight(m.confidence||'high');return {m,mag,w:Math.min(cfg.maxClinicalMagnitudeWeight||1.85,(cfg.clinicalEvidenceBaseWeight||1.35)*mag)*conf};});
    const latest=weighted[weighted.length-1], days=distinctDayCount(records), span=Math.max(0,(new Date(records[records.length-1].time)-new Date(records[0].time))/864e5);
    const persistence=1+0.12*Math.log2(Math.max(1,days))+0.06*Math.log2(1+span/7);
    const base=Math.max(...weighted.map(x=>x.w));
    const weight=Math.min(cfg.maxSerialClinicalWeight||2.30,base*persistence)*sourceWeight;
    const m=latest.m;
    out.push({id:`clinical:${scope}:${m.episodeId||'none'}:${fid}`,findingId:fid,present:true,time:m.time,severity:'medium',confidence:m.confidence||'high',notes:m.notes||'',evidenceType:scope==='current'?'clinical':'linked_clinical',sourceRecordId:m.id,sourceEpisodeId:m.episodeId,sourceScope:scope,weight,magnitudeFactor:latest.mag,rawCount:records.length,distinctDays:days,spanDays:span,summary:records.length===1?`${m.interpretation||'mapped'} clinical result · evidence weight ${weight.toFixed(2)}×`:`${records.length} mapped clinical results across ${days} day${days===1?'':'s'}${span>=1?`, spanning ${span.toFixed(span<10?1:0)} d`:''} · serial weight ${weight.toFixed(2)}×`});
  }
  return out;
}
function modelEvidence(){
  const current=[...deriveOwnerEvidence(),...clinicalEvidence()];
  const w=knowledge.inferenceConfig?.linkedHistoryWeight||.38;
  const history=linkedEpisodes().flatMap(ep=>[...deriveOwnerEvidence(ep.id,w,'linked'),...clinicalEvidence(episodeClinicalMeasurements(ep.id),w,'linked')]);
  return [...current,...history];
}
function demographicAdjustments(ep=activeEpisode(),pet=activePet()){
  const age=ageYearsAt(ep?.start,pet); const out={};
  for(const h of knowledge.hypotheses){
    let factor=1, reasons=[];
    for(const r of knowledge.riskModifiers?.[h.id]||[]){
      let match=false;
      if(r.kind==='age_years' && age!=null){ if(r.op==='gte') match=age>=r.value; if(r.op==='lt') match=age<r.value; }
      if(r.kind==='sex'){ if(r.op==='eq') match=pet?.sex===r.value; }
      if(match){ factor*=r.factor; reasons.push(r.note); }
    }
    out[h.id]={factor,reasons,age};
  }
  return out;
}
function diagnosisAdjustments(petId=state.settings.activePetId){
  const cfg=knowledge.inferenceConfig?.diagnosisModifiers||{}; const out={};
  knowledge.hypotheses.forEach(h=>out[h.id]={factor:1,reasons:[]});
  for(const d of petDiagnoses(petId)){
    if(!d.useInModel || !d.conditionId || !out[d.conditionId]) continue;
    const base=cfg[d.status]||1;
    const credibility=d.source==='owner-entered'?.55:d.source==='other'?.75:1;
    const factor=base>=1 ? 1+(base-1)*credibility : 1-(1-base)*credibility;
    out[d.conditionId].factor*=factor;
    out[d.conditionId].reasons.push(`${d.status.replaceAll('_',' ')} diagnosis${d.date?` (${d.date})`:''}${d.source?` · ${d.source}`:''}`);
  }
  return out;
}
function effectiveEvidenceWeight(obs){ return Number.isFinite(obs.weight)?obs.weight:(knowledge.inferenceConfig?.ownerEvidenceBaseWeight||1)*severityWeight(obs.severity)*confidenceWeight(obs.confidence||'high'); }
function infer(observations=modelEvidence()){
  const logs={}; const demo=demographicAdjustments(), dx=diagnosisAdjustments();
  knowledge.hypotheses.forEach(h=>{
    const adjusted=Math.max(1e-9,h.prior*(demo[h.id]?.factor||1)*(dx[h.id]?.factor||1));
    logs[h.id]=Math.log(adjusted);
  });
  observations.forEach(obs=>{
    const weight=effectiveEvidenceWeight(obs);
    knowledge.hypotheses.forEach(h=>{
      const p=Math.min(.97,Math.max(.03,knowledge.likelihoods[h.id]?.[obs.findingId] ?? .5));
      logs[h.id]+=weight*Math.log(obs.present===false ? (1-p) : p);
    });
  });
  const max=Math.max(...Object.values(logs));
  const exp=Object.fromEntries(Object.entries(logs).map(([k,v])=>[k,Math.exp(v-max)]));
  const total=Object.values(exp).reduce((a,b)=>a+b,0)||1;
  return knowledge.hypotheses.map(h=>({ ...h, score:exp[h.id]/total, log:logs[h.id], demographic:demo[h.id], diagnosis:dx[h.id]})).sort((a,b)=>b.score-a.score);
}
function familyScores(model=infer()){
  const totals=new Map();
  model.forEach(h=>totals.set(h.family||'Other',(totals.get(h.family||'Other')||0)+h.score));
  return [...totals.entries()].map(([label,score])=>({label,score})).sort((a,b)=>b.score-a.score);
}
function entropy(dist){ return -dist.reduce((s,x)=>s+(x.score>0?x.score*Math.log2(x.score):0),0); }
function distributionAfterVirtual(baseObs,fid,present){
  return infer([...baseObs,{findingId:fid,present,severity:'medium',confidence:'high',time:new Date().toISOString(),episodeId:state.settings.activeEpisodeId,id:'virtual'}]);
}
function nextBestQuestion(){
  const obs=episodeObservations();
  const used=new Set(obs.map(o=>o.findingId));
  const usedStateGroups=new Set(obs.map(o=>finding(o.findingId)?.stateGroup).filter(Boolean));
  const baseEvidence=modelEvidence();
  const base=infer(baseEvidence); const h0=entropy(base);
  let best=null;
  for(const f of knowledge.findings){
    if(f.sourceType==='clinical') continue;
    // State-group members are mutually exclusive at a point in time. Once a state
    // has been recorded, don't ask a contradictory sibling as the next-best prompt.
    // Users can still manually log a later state change from the observation form.
    if(used.has(f.id) || (f.stateGroup && usedStateGroups.has(f.stateGroup))) continue;
    const py=base.reduce((s,h)=>s+h.score*(knowledge.likelihoods[h.id]?.[f.id] ?? .5),0);
    const y=distributionAfterVirtual(baseEvidence,f.id,true), n=distributionAfterVirtual(baseEvidence,f.id,false);
    const expected=py*entropy(y)+(1-py)*entropy(n);
    const gain=h0-expected;
    if(!best || gain>best.gain) best={finding:f,gain,py};
  }
  return best;
}
function evidenceImpact(evidence,targetHypothesisId){
  const all=modelEvidence(); const full=infer(all).find(x=>x.id===targetHypothesisId)?.score||0;
  const without=infer(all.filter(x=>x.id!==evidence.id)).find(x=>x.id===targetHypothesisId)?.score||0;
  return full-without;
}
function evidenceLabel(e){
  const f=finding(e.findingId);
  if(e.evidenceType==='clinical'||e.evidenceType==='linked_clinical'){
    const m=state.clinicalMeasurements.find(x=>x.id===e.sourceRecordId);
    const t=measurementTemplate(m?.templateId);
    return `${e.sourceScope==='linked'?'Linked history · ':''}${t?.label||m?.label||f?.label||e.findingId}: ${m?.value||''}${m?.unit?' '+m.unit:''}`.trim();
  }
  const prefix=e.sourceScope==='linked'?'Linked history · ':'';
  return `${prefix}${e.present===false?'Absence of ':''}${f?.label||e.findingId}`;
}
function latestFindingState(){
  const map=new Map();
  episodeObservations().forEach(o=>map.set(o.findingId,o));
  return map;
}
function urgencyAlerts(){
  const latest=latestFindingState();
  return knowledge.urgencyRules.filter(r=>{
    const vals=r.findings.map(id=>latest.get(id)?.present===true);
    return r.match==='all'?vals.every(Boolean):vals.some(Boolean);
  }).sort((a,b)=> (a.level==='emergency'?-1:1)-(b.level==='emergency'?-1:1));
}
function latestEpisodeEvidenceTime(){ const xs=[...episodeObservations().map(o=>o.time),...episodeClinicalMeasurements().map(m=>m.time)].map(x=>new Date(x).getTime()).filter(Number.isFinite); return xs.length?Math.max(...xs):null; }
function urgencyIsHistorical(){ const ep=activeEpisode(), t=latestEpisodeEvidenceTime(); if(!ep||!t) return false; return ep.status==='closed' || (Date.now()-t)>72*36e5; }
function urgencyStatus(){ const a=urgencyAlerts(); if(!a.length)return 'No episode flags'; const hist=urgencyIsHistorical(); if(hist)return a.some(x=>x.level==='emergency')?'Historical emergency flag':'Historical urgent flag'; return a.some(x=>x.level==='emergency')?'Emergency flag':'Urgent flag'; }

function setView(view){
  currentView=view;
  $$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const meta={
    dashboard:['Dashboard','Track observations, episodes, and how the evidence shifts.'],
    log:['Log observation','Add a timestamped finding or explicitly record that a finding was absent.'],
    timeline:['Timeline','Review and edit the episode as it unfolded.'],
    context:['Clinical & diet','Record lab/clinical measurements and food composition context.'],
    history:['History','Prior diagnoses, linked episodes, and longitudinal patient context.'],
    model:['Bayesian model','Inspect relative pattern-consistency scores and the evidence behind them.'],
    reports:['Reports','Create a printable, vet-friendly episode summary.'],
    settings:['Settings','Pets, episodes, backup, provenance, and model information.']
  }[view];
  $('#viewTitle').textContent=meta[0]; $('#viewSubtitle').textContent=meta[1];
  render();
  document.querySelector('.sidebar')?.classList.remove('open');
}

function render(){
  const root=$('#appContent');
  if(currentView==='dashboard') root.innerHTML=renderDashboard();
  if(currentView==='log'){ root.innerHTML=renderLogPage(); bindLogForm($('#inlineLogForm')); }
  if(currentView==='timeline') root.innerHTML=renderTimelinePage();
  if(currentView==='context') root.innerHTML=renderContextPage();
  if(currentView==='history') root.innerHTML=renderHistoryPage();
  if(currentView==='model') root.innerHTML=renderModelPage();
  if(currentView==='reports') root.innerHTML=renderReportsPage();
  if(currentView==='settings') root.innerHTML=renderSettingsPage();
  bindRenderedActions();
}

function renderDashboard(){
  const obs=episodeObservations(); const clinical=episodeClinicalMeasurements(); const evidence=modelEvidence(); const model=infer(evidence); const alerts=urgencyAlerts(); const ep=activeEpisode(); const next=nextBestQuestion(); const timeline=episodeTimelineItems();
  const today=new Date().toDateString(); const todayCount=obs.filter(o=>new Date(o.time).toDateString()===today).length;
  const duration=ep ? hoursBetween(ep.start,ep.end||new Date().toISOString()) : 0;
  return `
    ${alerts.length?renderUrgency(alerts):`<div class="notice"><strong>No active deterministic urgency flags.</strong> This does not rule out illness or replace veterinary judgment.</div>`}
    <div class="grid three section-gap">
      <div class="card kpi"><div class="kpi-label">OBSERVATIONS TODAY</div><div class="kpi-value">${todayCount}</div><div class="kpi-foot">${obs.length} in this episode</div></div>
      <div class="card kpi"><div class="kpi-label">EPISODE DURATION</div><div class="kpi-value">${duration<24?duration.toFixed(1)+' h':(duration/24).toFixed(1)+' d'}</div><div class="kpi-foot">Started ${fmtDateTime(ep.start)}</div></div>
      <div class="card kpi"><div class="kpi-label">URGENCY RULES</div><div class="kpi-value" style="font-size:22px">${escapeHtml(urgencyStatus())}</div><div class="kpi-foot">Independent of Bayesian model</div></div>
    </div>
    <div class="grid two section-gap">
      <div class="card">
        <div class="card-head"><div><span class="eyebrow">RELATIVE PATTERN CONSISTENCY</span><h2>Current condition matches</h2></div><button class="mini" data-viewgo="model">Inspect model</button></div>
        <div class="score-list">${evidence.length?renderScores(model.slice(0,8)):`<div class="empty">No condition ranking yet. Add observations or mapped clinical evidence to begin.</div>`}</div>
      </div>
      <div class="card">
        <div class="card-head"><div><span class="eyebrow">INFORMATION VALUE</span><h2>Useful next observation</h2></div></div>
        ${next?`<div class="question-card"><h3>${escapeHtml(next.finding.question)}</h3><p>Of the unrecorded findings, this question is estimated to reduce the model's uncertainty the most right now. It is not a medical recommendation.</p><div class="chips"><span class="chip accent">Expected information gain ${next.gain.toFixed(3)} bits</span></div><div class="question-actions section-gap"><button class="primary" data-quick-answer="yes" data-finding="${next.finding.id}">Yes</button><button class="ghost" data-quick-answer="no" data-finding="${next.finding.id}">No</button><button class="ghost" data-log-finding="${next.finding.id}">Add details</button></div></div>`:`<div class="empty">Add observations to generate a next-best question.</div>`}
      </div>
    </div>
    <div class="grid two section-gap">
      <div class="card"><div class="card-head"><div><span class="eyebrow">EPISODE</span><h2>Recent timeline</h2></div><button class="mini" data-viewgo="timeline">View all</button></div>${renderTimeline(timeline.slice(-6).reverse())}</div>
      <div class="card"><div class="card-head"><div><span class="eyebrow">MODEL NOTICE</span><h2>What the percentages mean</h2></div></div><div class="card-pad"><p style="margin-top:0">The percentages are normalized Bayesian <strong>pattern-consistency scores</strong> across the condition library. They are not estimates of the probability that your cat has a disease.</p><p>The model is intentionally transparent: observations, priors and likelihood assumptions are inspectable, and urgency warnings are calculated separately.</p><div class="notice warning">The current feline differential pack is <strong>not clinically validated</strong>. It includes an explicit Other / unmodeled reserve because even a large library cannot rule out diseases it does not represent.</div></div></div>
    </div>
    <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">CONTEXT</span><h2>Clinical & diet</h2></div><button class="mini" data-viewgo="context">Open context</button></div><div class="card-pad context-summary"><div><strong>${clinical.length}</strong><span>clinical result${clinical.length===1?'':'s'} attached to this episode</span></div><div><strong>${episodeDiets().length}</strong><span>food record${episodeDiets().length===1?'':'s'} overlapping this episode</span></div><p>Mapped abnormal clinical results can optionally influence the Bayesian model. Diet composition is stored as context only.</p></div></div>`;
}
function renderUrgency(alerts){
  const top=alerts[0], historical=urgencyIsHistorical(), cls=top.level==='emergency'?'danger':'warning';
  const label=historical?(top.level==='emergency'?'Historical emergency flag':'Historical urgent flag'):(top.level==='emergency'?'Emergency flag':'Urgent flag');
  const qualifier=historical?' This flag comes from dated/closed episode evidence and does not imply the emergency is occurring now.':'';
  return `<div class="notice ${cls}"><strong>${label}: ${escapeHtml(top.title)}</strong> ${escapeHtml(top.message)}${qualifier}${alerts.length>1?` <span class="muted">(${alerts.length-1} additional rule${alerts.length>2?'s':''} present in this episode.)</span>`:''}</div>`;
}
function renderScores(model){
  return model.map((h,i)=>`<div class="score-row"><div class="score-label"><strong>${escapeHtml(h.label)}</strong><small>${h.family?escapeHtml(h.family)+' · ':''}${i===0?'highest current score':'relative score'}</small></div><div class="bar"><span style="width:${Math.max(1,h.score*100)}%"></span></div><div class="score-number">${(h.score*100).toFixed(1)}%</div></div>`).join('');
}
function renderFamilyScores(families){
  return families.map((f,i)=>`<div class="score-row"><div class="score-label"><strong>${escapeHtml(f.label)}</strong><small>${i===0?'highest current family':'family aggregate'}</small></div><div class="bar"><span style="width:${Math.max(1,f.score*100)}%"></span></div><div class="score-number">${(f.score*100).toFixed(1)}%</div></div>`).join('');
}
function episodeTimelineItems(){
  return [
    ...episodeObservations().map(o=>({kind:'observation',time:o.time,record:o})),
    ...episodeClinicalMeasurements().map(m=>({kind:'clinical',time:m.time,record:m}))
  ].sort((a,b)=>new Date(a.time)-new Date(b.time));
}
function renderTimeline(items){
  if(!items.length) return `<div class="empty"><div class="big">∅</div>No observations or clinical results logged yet.</div>`;
  return `<div class="timeline">${items.map(item=>{
    if(item.kind==='clinical'){
      const m=item.record,t=measurementTemplate(m.templateId),fid=clinicalFindingFor(m);
      return `<div class="event"><div class="event-time">${fmtDateTime(m.time)}</div><div class="dot clinical-dot"></div><div class="event-body"><strong>${escapeHtml(t?.label||m.label||'Clinical measurement')}: ${escapeHtml(m.value||'—')}${m.unit?` ${escapeHtml(m.unit)}`:''}</strong>${m.notes?`<p>${escapeHtml(m.notes)}</p>`:''}<div class="event-actions"><span class="chip">Clinical · ${escapeHtml(m.interpretation||'unspecified')}</span>${fid&&m.useInModel?'<span class="chip accent">Used in model</span>':''}<button class="mini" data-edit-clinical="${m.id}">Edit</button></div></div></div>`;
    }
    const o=item.record,f=finding(o.findingId);return `<div class="event"><div class="event-time">${fmtDateTime(o.time)}</div><div class="dot" style="background:${o.present===false?'#8090a5':'var(--accent)'}"></div><div class="event-body"><strong>${o.present===false?'Not observed: ':''}${escapeHtml(f?.label||o.findingId)}</strong>${o.notes?`<p>${escapeHtml(o.notes)}</p>`:''}<div class="event-actions"><span class="chip">Intensity: ${escapeHtml(o.severity||'medium')}</span><span class="chip">Confidence: ${escapeHtml(o.confidence||'high')}</span><button class="mini" data-edit-obs="${o.id}">Edit</button></div></div></div>`;
  }).join('')}</div>`;
}
function logFormHtml(obs=null,formId='observationForm'){
  const ownerFindings=knowledge.findings.filter(f=>f.sourceType!=='clinical');
  const categories=[...new Set(ownerFindings.map(f=>f.category))];
  const selected=obs?.findingId || ownerFindings[0].id;
  return `<form id="${formId}">
    <div class="form-row">
      <div class="field"><label>Finding</label><select name="findingId">${categories.map(cat=>`<optgroup label="${escapeHtml(cat)}">${ownerFindings.filter(f=>f.category===cat).map(f=>`<option value="${f.id}" ${selected===f.id?'selected':''}>${escapeHtml(f.label)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="field"><label>Outcome</label><select name="present"><option value="true" ${obs?.present!==false?'selected':''}>Observed / present</option><option value="false" ${obs?.present===false?'selected':''}>Checked and not observed</option></select></div>
    </div>
    <div class="form-row three">
      <div class="field"><label>Date & time</label><input type="datetime-local" name="time" value="${obs?toInputDate(obs.time):nowLocalInput()}" required></div>
      <div class="field"><label>Intensity</label><select name="severity"><option value="low" ${obs?.severity==='low'?'selected':''}>Low / mild</option><option value="medium" ${!obs||obs?.severity==='medium'?'selected':''}>Medium</option><option value="high" ${obs?.severity==='high'?'selected':''}>High / marked</option></select></div>
      <div class="field"><label>Observation confidence</label><select name="confidence"><option value="low" ${obs?.confidence==='low'?'selected':''}>Low — uncertain</option><option value="medium" ${obs?.confidence==='medium'?'selected':''}>Medium — fairly sure</option><option value="high" ${!obs||!obs?.confidence||obs?.confidence==='high'?'selected':''}>High — directly observed / measured</option></select></div>
    </div>
    <div class="field"><label>Notes</label><textarea name="notes" placeholder="What happened? Add quantity, color, contents, behavior, timing, context, etc.">${escapeHtml(obs?.notes||'')}</textarea><span class="helper">Confidence changes how strongly this observation influences the Bayesian model. Keep raw observations factual when possible.</span></div>
    <div class="form-actions">${obs?`<button type="button" class="danger" data-delete-obs="${obs.id}">Delete</button>`:''}<button type="submit" class="primary">${obs?'Save changes':'Add observation'}</button></div>
  </form>`;
}
function toInputDate(iso){ const d=new Date(iso);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16); }
function renderLogPage(){ return `<div class="grid two"><div class="card"><div class="card-head"><div><span class="eyebrow">NEW EVIDENCE</span><h2>Record an observation</h2></div></div><div class="card-pad">${logFormHtml(null,'inlineLogForm')}</div></div><div class="card"><div class="card-head"><div><span class="eyebrow">GUIDANCE</span><h2>Good observations are specific</h2></div></div><div class="card-pad"><p>Record what you actually saw and when. Time, frequency, amount, duration and context can matter more than a vague symptom label.</p><div class="notice"><strong>Example:</strong> “Vomited clear foam at 2:15 AM; third episode in 90 minutes; no food visible.”</div><p>You can also record that a finding was explicitly checked and <em>not</em> observed. Negative evidence can shift the model too.</p></div></div></div>`; }
function renderTimelinePage(){
  const eps=petEpisodes(); const items=[...episodeTimelineItems()].reverse(); const pet=activePet();
  return `<div class="card"><div class="card-head"><div><span class="eyebrow">${escapeHtml(pet.name.toUpperCase())} · EPISODES</span><h2>${escapeHtml(activeEpisode().title)}</h2></div><div class="button-row"><button class="ghost" data-edit-episode>Edit episode</button><button class="primary" data-new-episode>＋ New episode</button></div></div><div class="card-pad"><div class="episode-strip">${eps.map(e=>`<button class="episode-pill ${e.id===state.settings.activeEpisodeId?'active':''}" data-episode="${e.id}">${escapeHtml(e.title)} · ${fmtDate(e.start)}</button>`).join('')}</div></div>${renderTimeline(items)}</div>`;
}

function renderContextPage(){
  const clinical=[...petClinicalMeasurements()].reverse(), diets=petDiets(), ep=activeEpisode();
  return `<div class="notice"><strong>Clinical results retain their raw values.</strong> Mapped abnormal results can contribute to the model, and numeric magnitude can modestly strengthen evidence when a lab reference interval or source-backed anchor is available. Normal/negative results remain context unless a validated negative-evidence mapping exists. Diet records remain contextual only.</div>
  <div class="grid two section-gap context-grid">
    <div class="card"><div class="card-head"><div><span class="eyebrow">CLINICAL</span><h2>Measurements & test results</h2></div><button class="primary" data-add-clinical>＋ Add result</button></div><div class="card-pad"><p>Use the reference interval printed by the lab or supplied by the veterinarian. The app does not impose a universal numeric reference range.</p>${renderClinicalList(clinical)}</div></div>
    <div class="card"><div class="card-head"><div><span class="eyebrow">DIET CONTEXT</span><h2>Foods & nutrient profile</h2></div><button class="primary" data-add-diet>＋ Add food</button></div><div class="card-pad"><p>Track food form and nutrient composition over time. Protein, fat, fiber and carbohydrate values are stored as percentages on the selected basis; phosphorus can also be recorded as mg/100 kcal.</p>${renderDietList(diets)}</div></div>
  </div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">CURRENT EPISODE</span><h2>${escapeHtml(ep.title)} context</h2></div></div><div class="card-pad"><p>${episodeClinicalMeasurements().length} clinical result${episodeClinicalMeasurements().length===1?'':'s'} attached · ${episodeDiets().length} food record${episodeDiets().length===1?'':'s'} overlapping the episode.</p></div></div>`;
}
function renderClinicalList(items){
  if(!items.length) return '<div class="empty compact">No clinical measurements saved for this pet.</div>';
  return `<div class="context-list">${items.map(m=>{const t=measurementTemplate(m.templateId),fid=clinicalFindingFor(m);const ref=(m.refLow||m.refHigh)?`Ref ${escapeHtml(m.refLow||'—')}–${escapeHtml(m.refHigh||'—')} ${escapeHtml(m.unit||'')}`:'';return `<div class="context-item"><div><strong>${escapeHtml(t?.label||m.label||'Measurement')}</strong><span class="context-value">${escapeHtml(m.value||'—')}${m.unit?` ${escapeHtml(m.unit)}`:''}</span><small>${fmtDateTime(m.time)} · ${escapeHtml(m.interpretation||'unspecified')}${ref?' · '+ref:''}${m.episodeId===state.settings.activeEpisodeId?' · current episode':''}</small>${m.notes?`<p>${escapeHtml(m.notes)}</p>`:''}</div><div class="context-actions">${fid&&m.useInModel?`<span class="chip accent">Model evidence · ${(clinicalEvidence([m])[0]?.weight||0).toFixed(2)}×</span>`:'<span class="chip">Context</span>'}<button class="mini" data-edit-clinical="${m.id}">Edit</button></div></div>`}).join('')}</div>`;
}
function nutrientDisplay(d,key){
  const raw=parseFloat(d[key]); if(!Number.isFinite(raw)) return '—';
  const basis=d.nutrientBasis==='dry_matter'?'DM':'AF';
  let text=`${raw.toFixed(raw<10?2:1)}% ${basis}`;
  const moisture=parseFloat(d.moisture);
  if(d.nutrientBasis==='as_fed' && Number.isFinite(moisture) && moisture>=0 && moisture<100){ const dm=raw/(100-moisture)*100; text+=` · ${dm.toFixed(dm<10?2:1)}% DM`; }
  return text;
}
function phosphorusDisplay(d){ const v=parseFloat(d.phosphorus); if(!Number.isFinite(v)) return '—'; if(d.phosphorusUnit==='mg100kcal') return `${v} mg/100 kcal`; let text=`${v}% ${d.nutrientBasis==='dry_matter'?'DM':'AF'}`; const m=parseFloat(d.moisture); if(d.nutrientBasis==='as_fed'&&Number.isFinite(m)&&m>=0&&m<100) text+=` · ${(v/(100-m)*100).toFixed(2)}% DM`; return text; }
function renderDietList(items){
  if(!items.length) return '<div class="empty compact">No food records saved for this pet.</div>';
  return `<div class="context-list">${items.map(d=>`<div class="context-item diet-item"><div><strong>${escapeHtml([d.brand,d.product].filter(Boolean).join(' · ')||'Food record')}</strong><small>${escapeHtml(d.form||'unspecified')} · ${escapeHtml(d.startDate||'start unknown')}${d.endDate?' → '+escapeHtml(d.endDate):' → current'}</small><div class="nutrient-chips"><span class="chip">Protein ${escapeHtml(nutrientDisplay(d,'protein'))}</span><span class="chip">Fiber ${escapeHtml(nutrientDisplay(d,'fiber'))}</span><span class="chip">Carb ${escapeHtml(nutrientDisplay(d,'carbs'))}</span><span class="chip">Phos ${escapeHtml(phosphorusDisplay(d))}</span></div>${d.notes?`<p>${escapeHtml(d.notes)}</p>`:''}</div><div class="context-actions"><span class="chip">Context only</span><button class="mini" data-edit-diet="${d.id}">Edit</button></div></div>`).join('')}</div>`;
}

function diagnosisStatusLabel(status){
  return ({confirmed_active:'Confirmed · active',probable_active:'Probable · active',suspected_active:'Suspected · active',confirmed_resolved:'Confirmed · resolved/historical',ruled_out:'Ruled out'})[status]||status;
}
function diagnosisLabel(d){ return hypothesis(d.conditionId)?.label || d.customLabel || 'Custom diagnosis'; }
function episodeEvidenceBounds(ep=activeEpisode()){
  if(!ep) return null;
  const times=[...episodeObservations(ep.id).map(o=>o.time),...episodeClinicalMeasurements(ep.id).map(m=>m.time)].map(x=>new Date(x).getTime()).filter(Number.isFinite);
  if(!times.length) return null;
  return {first:new Date(Math.min(...times)).toISOString(),last:new Date(Math.max(...times)).toISOString()};
}
function renderHistoryPage(){
  const pet=activePet(), ep=activeEpisode(), dx=petDiagnoses(), prior=petEpisodes().filter(e=>e.id!==ep.id), linked=new Set(ep.linkedEpisodeIds||[]), bounds=episodeEvidenceBounds(ep);
  const age=ageYearsAt(ep.start,pet);
  return `<div class="notice"><strong>History is explicit, not automatic.</strong> Episodes remain analytically separate unless you link them. Confirmed or suspected diagnoses can be retained as patient history and optionally used as prior context. Linked episode evidence is down-weighted and shown separately in the model audit.</div>
  <div class="grid two section-gap history-grid">
    <div class="card"><div class="card-head"><div><span class="eyebrow">PRIOR DIAGNOSES</span><h2>${escapeHtml(pet.name)}'s diagnosis history</h2></div><button class="primary" data-add-diagnosis>＋ Add diagnosis</button></div><div class="card-pad">${dx.length?`<div class="context-list">${dx.map(d=>`<div class="context-item"><div><strong>${escapeHtml(diagnosisLabel(d))}</strong><small>${escapeHtml(diagnosisStatusLabel(d.status))}${d.date?' · '+escapeHtml(d.date):''}${d.source?' · '+escapeHtml(d.source):''}${d.stage?' · '+escapeHtml(d.stage):''}</small>${d.notes?`<p>${escapeHtml(d.notes)}</p>`:''}</div><div class="context-actions">${d.useInModel&&d.conditionId?'<span class="chip accent">Prior context</span>':'<span class="chip">Record only</span>'}<button class="mini" data-edit-diagnosis="${d.id}">Edit</button></div></div>`).join('')}</div>`:'<div class="empty compact">No prior diagnoses saved for this pet.</div>'}</div></div>
    <div class="card"><div class="card-head"><div><span class="eyebrow">CURRENT EPISODE</span><h2>Episode definition</h2></div><button class="secondary" data-edit-episode>Edit episode</button></div><div class="card-pad"><p><strong>${escapeHtml(ep.title)}</strong></p><div class="history-facts"><div><span>Episode start</span><strong>${fmtDateTime(ep.start)}</strong></div><div><span>Status</span><strong>${escapeHtml(ep.status)}</strong></div><div><span>Age at episode start</span><strong>${age==null?'—':age.toFixed(1)+' y'}</strong></div><div><span>Linked prior episodes</span><strong>${linked.size}</strong></div></div>${bounds?`<div class="notice ${new Date(ep.start)>new Date(bounds.first)?'warning':''} section-gap"><strong>Evidence range:</strong> ${fmtDateTime(bounds.first)} → ${fmtDateTime(bounds.last)}.${new Date(ep.start)>new Date(bounds.first)?' The episode starts after its earliest evidence.':''}</div><div class="button-row"><button class="ghost" data-align-episode>Align episode start to earliest evidence</button></div>`:''}</div></div>
  </div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">LINKED HISTORY</span><h2>Select prior episodes for this analysis</h2></div><span class="chip">${linked.size} linked</span></div><div class="card-pad"><p>Linked episodes remain separate records. Their derived evidence enters the current model at a reduced historical weight; raw rows are never merged into this episode.</p>${prior.length?`<div class="link-episode-list">${prior.map(e=>`<label class="link-episode-row"><input type="checkbox" data-link-episode="${e.id}" ${linked.has(e.id)?'checked':''}><span><strong>${escapeHtml(e.title)}</strong><small>${fmtDate(e.start)}${e.end?' → '+fmtDate(e.end):' · open'} · ${episodeObservations(e.id).length} observations · ${episodeClinicalMeasurements(e.id).length} clinical results</small></span></label>`).join('')}</div>`:'<div class="empty compact">No other episodes are available to link.</div>'}</div></div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">LONGITUDINAL RECORD</span><h2>Patient data inventory</h2></div></div><div class="card-pad context-summary"><div><strong>${petEpisodes().length}</strong><span>episodes</span></div><div><strong>${state.observations.filter(o=>petEpisodes().some(e=>e.id===o.episodeId)).length}</strong><span>raw observations</span></div><div><strong>${petClinicalMeasurements().length}</strong><span>clinical results</span></div><div><strong>${petDiets().length}</strong><span>diet records</span></div><div><strong>${dx.length}</strong><span>diagnoses</span></div></div></div>`;
}
function renderModelPage(){
  const evidence=[...modelEvidence()].reverse(); const model=infer(); const top=model[0]; const families=familyScores(model); const ep=activeEpisode();
  const byFamily=new Map(); model.forEach(h=>{const fam=h.family||'Other'; if(!byFamily.has(fam)) byFamily.set(fam,[]); byFamily.get(fam).push(h);});
  const familySections=families.map(f=>`<details class="model-family"><summary><strong>${escapeHtml(f.label)}</strong><span>${(f.score*100).toFixed(1)}% family aggregate</span></summary><div class="score-list">${renderScores(byFamily.get(f.label)||[])}</div></details>`).join('');
  const priorNotes=[...(top.demographic?.reasons||[]),...(top.diagnosis?.reasons||[])];
  const currentEvidence=evidence.filter(e=>e.sourceScope!=='linked'), historicalEvidence=evidence.filter(e=>e.sourceScope==='linked');
  return `<div class="notice warning"><strong>Experimental longitudinal model.</strong> Scores are relative pattern-consistency values from a non-validated knowledge pack. They are not disease probabilities, diagnoses, or rule-outs.</div>
  <div class="grid two section-gap"><div class="card"><div class="card-head"><div><span class="eyebrow">TOP CONDITION MATCHES</span><h2>Current differential pattern</h2></div></div><div class="score-list">${renderScores(model.slice(0,15))}</div></div>
  <div class="card"><div class="card-head"><div><span class="eyebrow">SYSTEM-LEVEL VIEW</span><h2>Condition-family aggregates</h2></div></div><div class="score-list">${renderFamilyScores(families)}</div></div></div>
  ${evidence.length?`<div class="card section-gap"><div class="card-head"><div><span class="eyebrow">TOP CURRENT MATCH</span><h2>${escapeHtml(top.label)}</h2><small>${escapeHtml(top.family||'')}</small></div><span class="chip accent">${(top.score*100).toFixed(1)}%</span></div><div class="card-pad"><p>${escapeHtml(top.description)}</p>${priorNotes.length?`<div class="notice"><strong>Prior/context adjustments for this condition:</strong> ${escapeHtml(priorNotes.join(' · '))}</div>`:''}<div class="divider"></div><h3>Derived evidence contribution</h3><p class="helper">Raw observations are retained in the timeline. Repeated observations are summarized into persistence/recurrence evidence before inference, avoiding naïve duplicate multiplication.</p></div><div class="evidence-list">${evidence.map(e=>{const imp=evidenceImpact(e,top.id);return `<div class="evidence-item"><div><strong>${escapeHtml(evidenceLabel(e))}</strong><small>${fmtDateTime(e.time)} · ${e.evidenceType.replace('_',' ')} · weight ${effectiveEvidenceWeight(e).toFixed(2)}×${e.summary?' · '+escapeHtml(e.summary):''}</small></div><div class="impact ${imp>=0?'up':'down'}">${imp>=0?'▲':'▼'} ${Math.abs(imp*100).toFixed(1)} pt</div></div>`}).join('')}</div></div>`:`<div class="notice section-gap"><strong>No observations yet.</strong> The condition scores below are only baseline model weights until evidence is logged.</div>`}
  <div class="grid two section-gap"><div class="card"><div class="card-head"><div><span class="eyebrow">CURRENT EPISODE EVIDENCE</span><h2>${currentEvidence.length} derived evidence item${currentEvidence.length===1?'':'s'}</h2></div></div><div class="card-pad"><p>${episodeObservations().length} raw owner observations and ${episodeClinicalMeasurements().length} clinical result${episodeClinicalMeasurements().length===1?'':'s'} are summarized for ${escapeHtml(ep.title)}.</p></div></div><div class="card"><div class="card-head"><div><span class="eyebrow">LINKED HISTORY</span><h2>${historicalEvidence.length} historical evidence item${historicalEvidence.length===1?'':'s'}</h2></div></div><div class="card-pad"><p>${linkedEpisodes().length} prior episode${linkedEpisodes().length===1?' is':'s are'} explicitly linked. Historical evidence is down-weighted rather than merged with the current episode.</p><button class="ghost" data-viewgo="history">Manage linked history</button></div></div></div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">CONDITION LIBRARY</span><h2>Browse all ${knowledge.hypotheses.length} hypotheses</h2></div><span class="chip">${knowledge.coverage?.namedConditionCount||knowledge.hypotheses.length} named</span></div><div class="card-pad"><p>${escapeHtml(knowledge.coverage?.scope||'')}</p>${familySections}</div></div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">TRANSPARENCY</span><h2>Inference architecture</h2></div></div><div class="card-pad"><p><strong>Raw observations → temporal summaries → clinical/history context → Bayesian pattern scores.</strong> Repeated observations contribute persistence or recurrence information rather than being treated as independent duplicate tests.</p><p>Numeric clinical results retain their actual value. When a lab reference interval or a source-backed measurement anchor is available, the degree of abnormality modestly changes evidence strength. A single result is never silently converted into a diagnosis.</p><p>Known diagnoses and demographics adjust priors transparently. Previous episodes affect the current analysis only when explicitly linked.</p><p>${escapeHtml(knowledge.coverage?.priorPolicy||'')}</p><p>The explicit <strong>Other / unmodeled condition</strong> hypothesis reserves model mass for conditions outside this library.</p><button class="ghost" data-viewgo="settings">View coverage & provenance</button></div></div>`;
}
function renderReportsPage(){
  const opts=state.settings;
  return `<div class="card no-print"><div class="card-head"><div><span class="eyebrow">REPORT OPTIONS</span><h2>Vet-friendly episode report</h2></div></div><div class="card-pad"><div class="report-options"><label class="checkbox"><input type="checkbox" data-report-opt="reportModel" ${opts.reportModel?'checked':''}> Include Bayesian model</label><label class="checkbox"><input type="checkbox" data-report-opt="reportUrgency" ${opts.reportUrgency?'checked':''}> Include urgency-rule history</label><label class="checkbox"><input type="checkbox" data-report-opt="reportNotes" ${opts.reportNotes?'checked':''}> Include observation notes</label><label class="checkbox"><input type="checkbox" data-report-opt="reportClinical" ${opts.reportClinical?'checked':''}> Include clinical measurements</label><label class="checkbox"><input type="checkbox" data-report-opt="reportDiet" ${opts.reportDiet?'checked':''}> Include diet context</label><label class="checkbox"><input type="checkbox" data-report-opt="reportHistory" ${opts.reportHistory?'checked':''}> Include diagnoses & linked history</label></div><div class="report-actions"><button class="primary" data-print>Print / Save PDF</button></div></div></div><div class="section-gap print-target">${reportHtml()}</div>`;
}
function reportHtml(){
  const ep=activeEpisode(),pet=activePet(),obs=episodeObservations(),clinical=episodeClinicalMeasurements(),diets=episodeDiets(),model=infer(),alerts=urgencyAlerts(),dx=petDiagnoses(),linked=linkedEpisodes();
  return `<article class="report-paper"><h2>Bayesian Symptom Tracker — Episode Report</h2><p class="report-muted">Generated ${fmtDateTime(new Date().toISOString())} · App v${APP_VERSION} · Knowledge pack ${escapeHtml(knowledge.packId)}</p><table><tr><th>Patient</th><td>${escapeHtml(pet.name)}</td><th>Species</th><td>Cat</td></tr><tr><th>Sex</th><td>${escapeHtml(pet.sex)}</td><th>Weight</th><td>${escapeHtml(pet.weight||'—')}</td></tr><tr><th>Episode</th><td>${escapeHtml(ep.title)}</td><th>Started</th><td>${fmtDateTime(ep.start)}</td></tr></table>
  <h3>Observation timeline</h3><table><thead><tr><th>Time</th><th>Finding</th><th>Intensity</th><th>Confidence</th>${state.settings.reportNotes?'<th>Notes</th>':''}</tr></thead><tbody>${obs.map(o=>`<tr><td>${fmtDateTime(o.time)}</td><td>${o.present===false?'Not observed: ':''}${escapeHtml(finding(o.findingId)?.label||o.findingId)}</td><td>${escapeHtml(o.severity||'medium')}</td><td>${escapeHtml(o.confidence||'high')}</td>${state.settings.reportNotes?`<td>${escapeHtml(o.notes||'')}</td>`:''}</tr>`).join('')||'<tr><td colspan="5">No observations</td></tr>'}</tbody></table>
  ${state.settings.reportClinical?`<h3>Clinical measurements / test results</h3><table><thead><tr><th>Time</th><th>Test</th><th>Result</th><th>Reference</th><th>Interpretation</th><th>Model</th></tr></thead><tbody>${clinical.map(m=>{const t=measurementTemplate(m.templateId);return `<tr><td>${fmtDateTime(m.time)}</td><td>${escapeHtml(t?.label||m.label||m.templateId)}</td><td>${escapeHtml(m.value||'—')} ${escapeHtml(m.unit||'')}</td><td>${escapeHtml(m.refLow||'—')}–${escapeHtml(m.refHigh||'—')} ${escapeHtml(m.unit||'')}</td><td>${escapeHtml(m.interpretation||'unspecified')}</td><td>${clinicalFindingFor(m)&&m.useInModel?'mapped evidence':'context only'}</td></tr>`}).join('')||'<tr><td colspan="6">No clinical measurements attached to this episode</td></tr>'}</tbody></table>`:''}
  ${state.settings.reportDiet?`<h3>Diet context overlapping episode</h3><table><thead><tr><th>Food</th><th>Form</th><th>Dates</th><th>Protein</th><th>Fiber</th><th>Carbohydrate</th><th>Phosphorus</th></tr></thead><tbody>${diets.map(d=>`<tr><td>${escapeHtml([d.brand,d.product].filter(Boolean).join(' · ')||'Food record')}</td><td>${escapeHtml(d.form||'')}</td><td>${escapeHtml(d.startDate||'—')} → ${escapeHtml(d.endDate||'current')}</td><td>${escapeHtml(nutrientDisplay(d,'protein'))}</td><td>${escapeHtml(nutrientDisplay(d,'fiber'))}</td><td>${escapeHtml(nutrientDisplay(d,'carbs'))}</td><td>${escapeHtml(phosphorusDisplay(d))}</td></tr>`).join('')||'<tr><td colspan="7">No diet context overlaps this episode</td></tr>'}</tbody></table><p class="report-muted">Diet composition is reported as context and does not alter Bayesian scores in this release.</p>`:''}
  ${state.settings.reportHistory?`<h3>Diagnosis & linked-history context</h3>${dx.length?`<table><thead><tr><th>Condition</th><th>Status</th><th>Date</th><th>Source</th><th>Prior context</th></tr></thead><tbody>${dx.map(d=>`<tr><td>${escapeHtml(diagnosisLabel(d))}</td><td>${escapeHtml(diagnosisStatusLabel(d.status))}</td><td>${escapeHtml(d.date||'—')}</td><td>${escapeHtml(d.source||'—')}</td><td>${d.useInModel?'enabled':'record only'}</td></tr>`).join('')}</tbody></table>`:'<p>No diagnoses recorded.</p>'}<p><strong>Linked prior episodes:</strong> ${linked.length?linked.map(e=>escapeHtml(e.title)+' ('+fmtDate(e.start)+')').join(', '):'None'}</p>`:''}
  ${state.settings.reportUrgency?`<h3>Current deterministic urgency flags</h3>${alerts.length?`<ul>${alerts.map(a=>`<li><strong>${escapeHtml(a.title)}:</strong> ${escapeHtml(a.message)}</li>`).join('')}</ul>`:'<p>No active urgency rules at report generation time.</p>'}`:''}
  ${state.settings.reportModel?`<h3>Top relative condition-pattern scores</h3><table><thead><tr><th>Condition pattern</th><th>Family</th><th>Score</th></tr></thead><tbody>${model.slice(0,15).map(h=>`<tr><td>${escapeHtml(h.label)}</td><td>${escapeHtml(h.family||'')}</td><td>${(h.score*100).toFixed(1)}%</td></tr>`).join('')}</tbody></table><p><strong>Important:</strong> These normalized Bayesian scores are generated by a non-validated heuristic model and are not disease probabilities, diagnoses, or rule-outs. The library includes an Other / unmodeled condition reserve.</p>`:''}
  <p class="report-muted">This report is an owner-generated record intended to help communicate observations. It does not replace veterinary examination, diagnosis, or treatment.</p></article>`;
}
function renderSettingsPage(){
  const pet=activePet();
  return `<div class="grid two settings-grid"><div class="card"><div class="card-head"><div><span class="eyebrow">PETS</span><h2>${escapeHtml(pet.name)}'s profile</h2></div><button class="secondary" data-add-pet>＋ Add pet</button></div><div class="card-pad"><div class="pet-strip">${state.pets.map(p=>`<button class="pet-pill ${p.id===pet.id?'active':''}" data-pet="${p.id}">${escapeHtml(p.name)}</button>`).join('')}</div><form id="profileForm" class="section-gap"><div class="form-row"><div class="field"><label>Name</label><input name="name" value="${escapeHtml(pet.name)}" required></div><div class="field"><label>Sex</label><select name="sex"><option value="unknown" ${pet.sex==='unknown'?'selected':''}>Unknown / not set</option><option value="female" ${pet.sex==='female'?'selected':''}>Female</option><option value="male" ${pet.sex==='male'?'selected':''}>Male</option></select></div></div><div class="form-row three"><div class="field"><label>Birth date</label><input type="date" name="birthDate" value="${escapeHtml(pet.birthDate||'')}"></div><div class="field"><label>Breed</label><input name="breed" value="${escapeHtml(pet.breed||'')}" placeholder="optional"></div><div class="field"><label>Neuter status</label><select name="neuterStatus"><option value="unknown" ${pet.neuterStatus==='unknown'?'selected':''}>Unknown</option><option value="intact" ${pet.neuterStatus==='intact'?'selected':''}>Intact</option><option value="neutered" ${pet.neuterStatus==='neutered'?'selected':''}>Spayed / neutered</option></select></div></div><div class="form-row"><div class="field"><label>Current weight</label><input name="weight" placeholder="e.g., 10.4 lb" value="${escapeHtml(pet.weight||'')}"></div><div class="field"><label>Body condition score</label><input name="bodyConditionScore" placeholder="e.g., 5/9" value="${escapeHtml(pet.bodyConditionScore||'')}"></div></div><div class="form-row"><div class="field"><label>Veterinarian</label><input name="vetName" value="${escapeHtml(pet.vetName||'')}"></div><div class="field"><label>Vet phone</label><input name="vetPhone" value="${escapeHtml(pet.vetPhone||'')}"></div></div><div class="form-actions split-actions">${state.pets.length>1?'<button type="button" class="danger" data-remove-pet>Remove pet</button>':'<span></span>'}<button class="primary">Save profile</button></div></form></div></div>
  <div class="card"><div class="card-head"><div><span class="eyebrow">DATA</span><h2>Backup & portability</h2></div></div><div class="card-pad"><p>All pets, episodes, raw observations, diagnoses, clinical measurements, diet records, and episode links are stored in IndexedDB in this browser. Export backups regularly.</p><div class="button-row"><button class="ghost" data-export>Export JSON</button><label class="button-like ghost-like" for="importFile">Import JSON</label><input type="file" id="importFile" accept="application/json" hidden><button class="secondary" data-demo>Load demo episode</button></div><div class="divider"></div><button class="danger" data-reset>Reset all local data</button></div></div></div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">KNOWLEDGE PACK</span><h2>${escapeHtml(knowledge.packId)}</h2></div><span class="chip">${escapeHtml(knowledge.modelStatus)}</span></div><div class="card-pad"><p>${escapeHtml(knowledge.modelNotice)}</p><h3>Coverage</h3><p><strong>${knowledge.coverage?.namedConditionCount||knowledge.hypotheses.length} named condition patterns</strong> + Other / unmodeled reserve · ${knowledge.coverage?.ownerFindingCount||knowledge.findings.filter(f=>f.sourceType!=='clinical').length} owner-observable findings · ${knowledge.coverage?.clinicalFindingCount||0} clinical evidence findings · ${knowledge.coverage?.measurementTemplateCount||0} structured measurement templates · ${knowledge.coverage?.familyCount||new Set(knowledge.hypotheses.map(h=>h.family)).size} families.</p><p>${escapeHtml(knowledge.coverage?.scope||'')}</p><p>${escapeHtml(knowledge.coverage?.inferenceArchitecture||'')}</p><p class="helper">${escapeHtml(knowledge.coverage?.priorPolicy||'')}</p><h3>Knowledge & urgency provenance</h3><ul class="source-list">${knowledge.sources.map(s=>`<li><a href="${s.url}" target="_blank" rel="noreferrer">${escapeHtml(s.name)}</a> — ${escapeHtml(s.role)}</li>`).join('')}</ul><p class="helper">The cited veterinary references support representative condition/sign relationships, risk context, clinical interpretation anchors, and emergency red flags. They do <strong>not</strong> validate the numerical Bayesian weights as calibrated diagnostic probabilities.</p></div></div>`;
}
function bindLogForm(form){
  if(!form) return;
  form.addEventListener('submit',async e=>{
    e.preventDefault(); const fd=new FormData(form); const data={findingId:fd.get('findingId'),present:fd.get('present')==='true',time:new Date(fd.get('time')).toISOString(),severity:fd.get('severity'),confidence:fd.get('confidence')||'high',notes:fd.get('notes').trim()};
    if(editingObservationId){ const o=state.observations.find(x=>x.id===editingObservationId); Object.assign(o,data); }
    else state.observations.push({id:uid(),episodeId:state.settings.activeEpisodeId,...data});
    await save(); editingObservationId=null; closeModal(); toast('Observation saved'); setView(currentView==='log'?'dashboard':currentView);
  });
}
function bindRenderedActions(){
  $$('[data-viewgo]').forEach(b=>b.onclick=()=>setView(b.dataset.viewgo));
  $$('[data-edit-obs]').forEach(b=>b.onclick=()=>openObservationModal(b.dataset.editObs));
  $$('[data-edit-clinical]').forEach(b=>b.onclick=()=>openClinicalModal(b.dataset.editClinical));
  $$('[data-edit-diet]').forEach(b=>b.onclick=()=>openDietModal(b.dataset.editDiet));
  $$('[data-add-clinical]').forEach(b=>b.onclick=()=>openClinicalModal());
  $$('[data-add-diet]').forEach(b=>b.onclick=()=>openDietModal());
  $$('[data-log-finding]').forEach(b=>b.onclick=()=>openObservationModal(null,b.dataset.logFinding));
  $$('[data-quick-answer]').forEach(b=>b.onclick=async()=>{state.observations.push({id:uid(),episodeId:state.settings.activeEpisodeId,findingId:b.dataset.finding,present:b.dataset.quickAnswer==='yes',time:new Date().toISOString(),severity:'medium',confidence:'high',notes:'Logged from next-best observation prompt.'});await save();toast('Observation added');render();});
  $$('[data-episode]').forEach(b=>b.onclick=async()=>{const ep=state.episodes.find(e=>e.id===b.dataset.episode && e.petId===state.settings.activePetId);if(!ep)return;state.settings.activeEpisodeId=ep.id;await save();render();updateContextButtons();});
  $$('[data-pet]').forEach(b=>b.onclick=()=>switchPet(b.dataset.pet));
  $$('[data-new-episode]').forEach(b=>b.onclick=openEpisodeModal);
  $$('[data-edit-episode]').forEach(b=>b.onclick=()=>openEpisodeEditModal());
  $$('[data-align-episode]').forEach(b=>b.onclick=alignEpisodeToEvidence);
  $$('[data-link-episode]').forEach(c=>c.onchange=async()=>{const ep=activeEpisode();const ids=new Set(ep.linkedEpisodeIds||[]);if(c.checked)ids.add(c.dataset.linkEpisode);else ids.delete(c.dataset.linkEpisode);ep.linkedEpisodeIds=[...ids];await save();toast('Linked history updated');render();});
  $$('[data-add-diagnosis]').forEach(b=>b.onclick=()=>openDiagnosisModal());
  $$('[data-edit-diagnosis]').forEach(b=>b.onclick=()=>openDiagnosisModal(b.dataset.editDiagnosis));
  $$('[data-add-pet]').forEach(b=>b.onclick=openPetModal);
  $$('[data-remove-pet]').forEach(b=>b.onclick=removeActivePet);
  $$('[data-report-opt]').forEach(c=>c.onchange=async()=>{state.settings[c.dataset.reportOpt]=c.checked;await save();render();});
  $$('[data-print]').forEach(b=>b.onclick=()=>window.print());
  $$('[data-export]').forEach(b=>b.onclick=exportJson);
  $$('[data-demo]').forEach(b=>b.onclick=loadDemo);
  $$('[data-reset]').forEach(b=>b.onclick=resetData);
  $('#profileForm')?.addEventListener('submit',saveProfile);
  $('#importFile')?.addEventListener('change',importJson);
}
function openObservationModal(id=null,presetFinding=null){
  editingObservationId=id; const obs=id?state.observations.find(o=>o.id===id):null;
  $('#modalEyebrow').textContent=obs?'EDIT OBSERVATION':'OBSERVATION'; $('#modalTitle').textContent=obs?'Edit observation':`Log observation for ${activePet().name}`;
  $('#modalBody').innerHTML=logFormHtml(obs,'modalObservationForm');
  if(presetFinding) $('#modalObservationForm [name=findingId]').value=presetFinding;
  $('#modalBackdrop').classList.remove('hidden'); bindLogForm($('#modalObservationForm'));
  $$('[data-delete-obs]',$('#modalBody')).forEach(b=>b.onclick=()=>deleteObservation(b.dataset.deleteObs));
}
function closeModal(){ $('#modalBackdrop').classList.add('hidden'); editingObservationId=null; editingClinicalId=null; editingDietId=null; editingDiagnosisId=null; }
async function deleteObservation(id){ if(!confirm('Delete this observation?')) return; state.observations=state.observations.filter(o=>o.id!==id);await save();closeModal();toast('Observation deleted');render(); }
function interpretationFromForm(fd,template){
  let interpretation=String(fd.get('interpretation')||'auto');
  const raw=String(fd.get('value')||'').trim();
  if(interpretation!=='auto') return interpretation;
  const word=raw.toLowerCase();
  if(['positive','negative','trace'].includes(word)) return word;
  const v=parseFloat(raw), lo=parseFloat(fd.get('refLow')), hi=parseFloat(fd.get('refHigh'));
  if(Number.isFinite(v)){
    if(Number.isFinite(lo)&&v<lo) return 'low';
    if(Number.isFinite(hi)&&v>hi) return 'high';
    if(Number.isFinite(lo)||Number.isFinite(hi)) return 'normal';
    const a=template?.quantitativeAnchor;
    if(a && Number.isFinite(Number(a.value))){
      if(a.direction==='high' && v>Number(a.value)) return 'high';
      if(a.direction==='low' && v<Number(a.value)) return 'low';
    }
  }
  return 'unspecified';
}
function clinicalFormHtml(m=null){
  const templates=knowledge.measurementTemplates||[], cats=[...new Set(templates.map(t=>t.category))], selected=m?.templateId||templates[0]?.id||'custom';
  return `<form id="clinicalForm"><div class="form-row"><div class="field"><label>Measurement / test</label><select name="templateId">${cats.map(cat=>`<optgroup label="${escapeHtml(cat)}">${templates.filter(t=>t.category===cat).map(t=>`<option value="${t.id}" ${selected===t.id?'selected':''}>${escapeHtml(t.label)}</option>`).join('')}</optgroup>`).join('')}</select></div><div class="field"><label>Custom label</label><input name="label" placeholder="Used for Custom measurement / test" value="${escapeHtml(m?.label||'')}"></div></div>
  <div class="form-row three clinical-value-row"><div class="field"><label>Date & time</label><input type="datetime-local" name="time" value="${m?toInputDate(m.time):nowLocalInput()}" required></div><div class="field"><label>Result / value</label><input name="value" value="${escapeHtml(m?.value||'')}" placeholder="e.g. 242 / positive" required></div><div class="field"><label>Unit</label><input name="unit" value="${escapeHtml(m?.unit||measurementTemplate(selected)?.unit||'')}" placeholder="optional"></div></div>
  <div class="form-row three clinical-reference-row"><div class="field"><label>Lab reference low</label><input name="refLow" inputmode="decimal" value="${escapeHtml(m?.refLow||'')}" placeholder="optional"></div><div class="field"><label>Lab reference high</label><input name="refHigh" inputmode="decimal" value="${escapeHtml(m?.refHigh||'')}" placeholder="optional"></div><div class="field"><label>Interpretation</label><select name="interpretation"><option value="auto" ${!m?'selected':''}>Auto (result/reference)</option>${['unspecified','low','normal','high','negative','trace','positive'].map(x=>`<option value="${x}" ${m?.interpretation===x?'selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select></div></div>
  <div class="form-row"><div class="field"><label>Source</label><select name="source"><option value="vet_lab" ${m?.source==='vet_lab'||!m?'selected':''}>Veterinarian / laboratory</option><option value="home" ${m?.source==='home'?'selected':''}>Home measurement</option><option value="other" ${m?.source==='other'?'selected':''}>Other</option></select></div><div class="field"><label>Confidence</label><select name="confidence"><option value="high" ${!m||m?.confidence==='high'?'selected':''}>High</option><option value="medium" ${m?.confidence==='medium'?'selected':''}>Medium</option><option value="low" ${m?.confidence==='low'?'selected':''}>Low</option></select></div></div>
  <label class="checkbox"><input type="checkbox" name="attachEpisode" ${!m||m?.episodeId?'checked':''}> Attach to current episode (${escapeHtml(activeEpisode().title)})</label><label class="checkbox"><input type="checkbox" name="useInModel" ${(m?.useInModel || (!m && Object.keys(measurementTemplate(selected)?.modelMap||{}).length))?'checked':''}> Use mapped abnormal/positive interpretation as Bayesian evidence when supported</label>
  <div class="field"><label>Notes</label><textarea name="notes" placeholder="Lab name, fasting status, sample notes, veterinarian comments, etc.">${escapeHtml(m?.notes||'')}</textarea><span class="helper">Reference ranges vary by laboratory, method, age, hydration and clinical context. Normal or negative results are stored but are not automatically used as Bayesian rule-outs.</span></div><div class="form-actions">${m?`<button type="button" class="danger" data-delete-clinical="${m.id}">Delete</button>`:''}<button class="primary">${m?'Save changes':'Add clinical result'}</button></div></form>`;
}
function bindClinicalForm(){
  const form=$('#clinicalForm'); if(!form)return;
  const select=form.querySelector('[name=templateId]'), unit=form.querySelector('[name=unit]'), modelBox=form.querySelector('[name=useInModel]');
  select.onchange=()=>{const t=measurementTemplate(select.value); if(t && (!unit.value || editingClinicalId===null)) unit.value=t.unit||''; if(editingClinicalId===null) modelBox.checked=!!Object.keys(t?.modelMap||{}).length;};
  form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form),t=measurementTemplate(fd.get('templateId'));const data={petId:state.settings.activePetId,episodeId:fd.get('attachEpisode')?state.settings.activeEpisodeId:null,templateId:fd.get('templateId'),label:String(fd.get('label')||'').trim(),time:new Date(fd.get('time')).toISOString(),value:String(fd.get('value')||'').trim(),unit:String(fd.get('unit')||'').trim(),refLow:String(fd.get('refLow')||'').trim(),refHigh:String(fd.get('refHigh')||'').trim(),interpretation:interpretationFromForm(fd,t),source:fd.get('source'),confidence:fd.get('confidence')||'high',useInModel:fd.get('useInModel')==='on',notes:String(fd.get('notes')||'').trim()};if(editingClinicalId){Object.assign(state.clinicalMeasurements.find(x=>x.id===editingClinicalId),data);}else state.clinicalMeasurements.push({id:uid(),...data});await save();editingClinicalId=null;closeModal();toast('Clinical result saved');render();};
}
function openClinicalModal(id=null){editingClinicalId=id;const m=id?state.clinicalMeasurements.find(x=>x.id===id):null;$('#modalEyebrow').textContent='CLINICAL';$('#modalTitle').textContent=m?'Edit clinical result':`Add clinical result for ${activePet().name}`;$('#modalBody').innerHTML=clinicalFormHtml(m);$('#modalBackdrop').classList.remove('hidden');bindClinicalForm();$$('[data-delete-clinical]',$('#modalBody')).forEach(b=>b.onclick=()=>deleteClinical(b.dataset.deleteClinical));}
async function deleteClinical(id){if(!confirm('Delete this clinical result?'))return;state.clinicalMeasurements=state.clinicalMeasurements.filter(m=>m.id!==id);editingClinicalId=null;closeModal();await save();toast('Clinical result deleted');render();}
function dietFormHtml(d=null){return `<form id="dietForm"><div class="form-row"><div class="field"><label>Brand</label><input name="brand" value="${escapeHtml(d?.brand||'')}"></div><div class="field"><label>Product / recipe</label><input name="product" value="${escapeHtml(d?.product||'')}" required></div></div><div class="form-row three"><div class="field"><label>Food type</label><select name="form">${['wet','dry','raw','freeze-dried','home-cooked','treat','other'].map(x=>`<option value="${x}" ${d?.form===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Start date</label><input type="date" name="startDate" value="${escapeHtml(d?.startDate||new Date().toISOString().slice(0,10))}"></div><div class="field"><label>End date</label><input type="date" name="endDate" value="${escapeHtml(d?.endDate||'')}"></div></div><div class="form-row"><div class="field"><label>Nutrient basis</label><select name="nutrientBasis"><option value="as_fed" ${!d||d?.nutrientBasis==='as_fed'?'selected':''}>As-fed %</option><option value="dry_matter" ${d?.nutrientBasis==='dry_matter'?'selected':''}>Dry-matter %</option></select></div><div class="field"><label>Moisture %</label><input name="moisture" inputmode="decimal" value="${escapeHtml(d?.moisture||'')}" placeholder="needed for AF → DM display"></div></div><div class="form-row three"><div class="field"><label>Protein %</label><input name="protein" inputmode="decimal" value="${escapeHtml(d?.protein||'')}"></div><div class="field"><label>Fat %</label><input name="fat" inputmode="decimal" value="${escapeHtml(d?.fat||'')}"></div><div class="field"><label>Fiber %</label><input name="fiber" inputmode="decimal" value="${escapeHtml(d?.fiber||'')}"></div></div><div class="form-row three"><div class="field"><label>Carbohydrate %</label><input name="carbs" inputmode="decimal" value="${escapeHtml(d?.carbs||'')}"></div><div class="field"><label>Phosphorus</label><input name="phosphorus" inputmode="decimal" value="${escapeHtml(d?.phosphorus||'')}"></div><div class="field"><label>Phosphorus unit</label><select name="phosphorusUnit"><option value="percent" ${!d||d?.phosphorusUnit==='percent'?'selected':''}>%</option><option value="mg100kcal" ${d?.phosphorusUnit==='mg100kcal'?'selected':''}>mg / 100 kcal</option></select></div></div><div class="form-row"><div class="field"><label>Amount / feeding note</label><input name="amount" value="${escapeHtml(d?.amount||'')}" placeholder="e.g. 1 can/day, free-fed, 50% of diet"></div><div class="field"><label>Nutrition source</label><input name="source" value="${escapeHtml(d?.source||'')}" placeholder="label, manufacturer, lab, estimated"></div></div><div class="field"><label>Notes</label><textarea name="notes" placeholder="Flavor, prescription diet, carb estimate method, transition notes, etc.">${escapeHtml(d?.notes||'')}</textarea><span class="helper">Diet records are contextual only and do not alter the Bayesian model. When moisture is supplied for an as-fed record, the display also calculates dry-matter equivalents for percentage nutrients.</span></div><div class="form-actions">${d?`<button type="button" class="danger" data-delete-diet="${d.id}">Delete</button>`:''}<button class="primary">${d?'Save changes':'Add food record'}</button></div></form>`;}
function openDietModal(id=null){editingDietId=id;const d=id?state.diets.find(x=>x.id===id):null;$('#modalEyebrow').textContent='DIET';$('#modalTitle').textContent=d?'Edit food record':`Add food context for ${activePet().name}`;$('#modalBody').innerHTML=dietFormHtml(d);$('#modalBackdrop').classList.remove('hidden');const form=$('#dietForm');form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);const data={petId:state.settings.activePetId,brand:String(fd.get('brand')||'').trim(),product:String(fd.get('product')||'').trim(),form:fd.get('form'),startDate:fd.get('startDate')||'',endDate:fd.get('endDate')||'',nutrientBasis:fd.get('nutrientBasis'),moisture:String(fd.get('moisture')||'').trim(),protein:String(fd.get('protein')||'').trim(),fat:String(fd.get('fat')||'').trim(),fiber:String(fd.get('fiber')||'').trim(),carbs:String(fd.get('carbs')||'').trim(),phosphorus:String(fd.get('phosphorus')||'').trim(),phosphorusUnit:fd.get('phosphorusUnit'),amount:String(fd.get('amount')||'').trim(),source:String(fd.get('source')||'').trim(),notes:String(fd.get('notes')||'').trim()};if(editingDietId){Object.assign(state.diets.find(x=>x.id===editingDietId),data);}else state.diets.push({id:uid(),...data});await save();editingDietId=null;closeModal();toast('Food context saved');render();};$$('[data-delete-diet]',$('#modalBody')).forEach(b=>b.onclick=()=>deleteDiet(b.dataset.deleteDiet));}
async function deleteDiet(id){if(!confirm('Delete this food record?'))return;state.diets=state.diets.filter(d=>d.id!==id);editingDietId=null;closeModal();await save();toast('Food record deleted');render();}

function diagnosisFormHtml(d=null){
  const selected=d?.conditionId||'';
  const conditions=knowledge.hypotheses.filter(h=>h.id!=='other_unmodeled');
  return `<form id="diagnosisForm"><div class="form-row"><div class="field"><label>Condition</label><select name="conditionId"><option value="">Custom / not in library</option>${conditions.map(h=>`<option value="${h.id}" ${selected===h.id?'selected':''}>${escapeHtml(h.label)}</option>`).join('')}</select></div><div class="field"><label>Custom label</label><input name="customLabel" value="${escapeHtml(d?.customLabel||'')}" placeholder="Used when condition is not in library"></div></div>
  <div class="form-row three"><div class="field"><label>Status</label><select name="status">${['confirmed_active','probable_active','suspected_active','confirmed_resolved','ruled_out'].map(x=>`<option value="${x}" ${d?.status===x||(!d&&x==='confirmed_active')?'selected':''}>${escapeHtml(diagnosisStatusLabel(x))}</option>`).join('')}</select></div><div class="field"><label>Date</label><input type="date" name="date" value="${escapeHtml(d?.date||'')}"></div><div class="field"><label>Source</label><select name="source">${['veterinarian','specialist','pathology','imaging','laboratory-supported','owner-entered','other'].map(x=>`<option value="${x}" ${d?.source===x?'selected':''}>${x}</option>`).join('')}</select></div></div>
  <div class="form-row"><div class="field"><label>Stage / grade / qualifier</label><input name="stage" value="${escapeHtml(d?.stage||'')}" placeholder="e.g. IRIS stage 2, remission, biopsy confirmed"></div><div class="field"><label>Linked episode</label><select name="episodeId"><option value="">No specific episode</option>${petEpisodes().map(e=>`<option value="${e.id}" ${d?.episodeId===e.id?'selected':''}>${escapeHtml(e.title)} · ${fmtDate(e.start)}</option>`).join('')}</select></div></div>
  <label class="checkbox"><input type="checkbox" name="useInModel" ${d?.useInModel?'checked':''}> Use as prior context in future/current differential analysis</label>
  <div class="field"><label>Notes / provenance</label><textarea name="notes" placeholder="Who made the diagnosis, supporting tests, treatment, outcome, uncertainty, etc.">${escapeHtml(d?.notes||'')}</textarea><span class="helper">Diagnosis history adjusts prior context only when you explicitly enable it. It does not replace current-episode evidence.</span></div><div class="form-actions">${d?`<button type="button" class="danger" data-delete-diagnosis="${d.id}">Delete</button>`:''}<button class="primary">${d?'Save changes':'Add diagnosis'}</button></div></form>`;
}
function openDiagnosisModal(id=null){
  editingDiagnosisId=id; const d=id?state.diagnoses.find(x=>x.id===id):null;
  $('#modalEyebrow').textContent='HISTORY'; $('#modalTitle').textContent=d?'Edit diagnosis':`Add diagnosis for ${activePet().name}`;
  $('#modalBody').innerHTML=diagnosisFormHtml(d); $('#modalBackdrop').classList.remove('hidden');
  const form=$('#diagnosisForm');
  form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);const data={petId:state.settings.activePetId,conditionId:String(fd.get('conditionId')||''),customLabel:String(fd.get('customLabel')||'').trim(),status:String(fd.get('status')||'suspected_active'),date:String(fd.get('date')||''),source:String(fd.get('source')||''),stage:String(fd.get('stage')||'').trim(),episodeId:String(fd.get('episodeId')||'')||null,useInModel:fd.get('useInModel')==='on',notes:String(fd.get('notes')||'').trim()};if(!data.conditionId&&!data.customLabel){alert('Choose a condition or enter a custom label.');return;}if(editingDiagnosisId)Object.assign(state.diagnoses.find(x=>x.id===editingDiagnosisId),data);else state.diagnoses.push({id:uid(),...data});await save();closeModal();toast('Diagnosis history saved');render();};
  $$('[data-delete-diagnosis]',$('#modalBody')).forEach(b=>b.onclick=()=>deleteDiagnosis(b.dataset.deleteDiagnosis));
}
async function deleteDiagnosis(id){ if(!confirm('Delete this diagnosis history record?'))return; state.diagnoses=state.diagnoses.filter(d=>d.id!==id); await save(); closeModal(); toast('Diagnosis record deleted'); render(); }
function openEpisodeEditModal(){
  const ep=activeEpisode(); if(!ep)return;
  $('#modalEyebrow').textContent='EPISODE'; $('#modalTitle').textContent='Edit episode';
  $('#modalBody').innerHTML=`<form id="episodeEditForm"><div class="field"><label>Episode title</label><input name="title" value="${escapeHtml(ep.title)}" required></div><div class="form-row"><div class="field"><label>Start</label><input type="datetime-local" name="start" value="${toInputDate(ep.start)}" required></div><div class="field"><label>End</label><input type="datetime-local" name="end" value="${ep.end?toInputDate(ep.end):''}"></div></div><div class="field"><label>Status</label><select name="status"><option value="open" ${ep.status==='open'?'selected':''}>Open / ongoing</option><option value="closed" ${ep.status==='closed'?'selected':''}>Closed</option></select></div><div class="form-actions"><button class="primary">Save episode</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');
  $('#episodeEditForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);ep.title=String(fd.get('title')||'').trim()||ep.title;ep.start=new Date(fd.get('start')).toISOString();ep.end=fd.get('end')?new Date(fd.get('end')).toISOString():null;ep.status=fd.get('status');if(ep.status==='closed'&&!ep.end){const b=episodeEvidenceBounds(ep);ep.end=b?.last||new Date().toISOString();}await save();closeModal();updateContextButtons();toast('Episode updated');render();};
}
async function alignEpisodeToEvidence(){
  const ep=activeEpisode(), b=episodeEvidenceBounds(ep); if(!ep||!b)return;
  ep.start=b.first; if(ep.status==='closed')ep.end=b.last;
  await save();updateContextButtons();toast('Episode dates aligned to recorded evidence');render();
}
function openEpisodeModal(){
  const pet=activePet(), eps=petEpisodes();
  $('#modalEyebrow').textContent='EPISODE';$('#modalTitle').textContent=`Start new episode for ${pet.name}`;
  $('#modalBody').innerHTML=`<form id="episodeForm"><div class="field"><label>Episode title</label><input name="title" value="Episode ${eps.length+1}" required></div><div class="field"><label>Start</label><input type="datetime-local" name="start" value="${nowLocalInput()}" required></div><label class="checkbox"><input type="checkbox" name="closeCurrent" checked> Close ${escapeHtml(activeEpisode().title)} when this one starts</label><div class="form-actions"><button class="primary">Start episode</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');
  $('#episodeForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const start=new Date(fd.get('start')).toISOString();if(fd.get('closeCurrent')){const cur=activeEpisode();if(cur){cur.status='closed';cur.end=start;}}const ep=makeEpisode(pet.id,fd.get('title').trim(),start);state.episodes.push(ep);state.settings.activeEpisodeId=ep.id;await save();closeModal();updateContextButtons();render();};
}
function openPetModal(){
  $('#modalEyebrow').textContent='PET'; $('#modalTitle').textContent='Add pet';
  $('#modalBody').innerHTML=`<form id="petForm"><div class="form-row"><div class="field"><label>Name</label><input name="name" placeholder="Pet name" required autofocus></div><div class="field"><label>Sex</label><select name="sex"><option value="unknown">Unknown / not set</option><option value="female">Female</option><option value="male">Male</option></select></div></div><div class="form-row three"><div class="field"><label>Birth date</label><input type="date" name="birthDate"></div><div class="field"><label>Breed</label><input name="breed" placeholder="optional"></div><div class="field"><label>Neuter status</label><select name="neuterStatus"><option value="unknown">Unknown</option><option value="intact">Intact</option><option value="neutered">Spayed / neutered</option></select></div></div><div class="form-row"><div class="field"><label>Weight</label><input name="weight" placeholder="e.g., 10.4 lb"></div><div class="field"><label>Body condition score</label><input name="bodyConditionScore" placeholder="e.g., 5/9"></div></div><div class="form-actions"><button class="primary">Add pet</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');
  $('#petForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const pet=makePet({name:fd.get('name').trim(),sex:fd.get('sex'),birthDate:fd.get('birthDate'),breed:String(fd.get('breed')||'').trim(),neuterStatus:fd.get('neuterStatus'),weight:String(fd.get('weight')||'').trim(),bodyConditionScore:String(fd.get('bodyConditionScore')||'').trim()});const ep=makeEpisode(pet.id);state.pets.push(pet);state.episodes.push(ep);state.settings.activePetId=pet.id;state.settings.activeEpisodeId=ep.id;await save();closeModal();updateContextButtons();toast(`${pet.name} added`);render();};
}
function openPetSwitcher(){
  const pet=activePet();
  $('#modalEyebrow').textContent='PET'; $('#modalTitle').textContent='Switch pet';
  $('#modalBody').innerHTML=`<div class="pet-switch-list">${state.pets.map(p=>`<button class="pet-switch ${p.id===pet.id?'active':''}" data-switch-pet="${p.id}"><span class="pet-avatar">${escapeHtml((p.name||'?').slice(0,1).toUpperCase())}</span><span><strong>${escapeHtml(p.name)}</strong><small>${petEpisodes(p.id).length} episode${petEpisodes(p.id).length===1?'':'s'}</small></span>${p.id===pet.id?'<span class="chip accent">Current</span>':''}</button>`).join('')}</div><div class="divider"></div><div class="form-actions"><button class="secondary" data-add-pet-modal>＋ Add pet</button></div>`;
  $('#modalBackdrop').classList.remove('hidden');
  $$('[data-switch-pet]',$('#modalBody')).forEach(b=>b.onclick=async()=>{closeModal();await switchPet(b.dataset.switchPet);});
  $('[data-add-pet-modal]',$('#modalBody')).onclick=()=>openPetModal();
}
async function removeActivePet(){
  if(state.pets.length<=1) return;
  const pet=activePet();
  if(!confirm(`Remove ${pet.name} and all of this pet's episodes, observations, clinical results, and diet records? This cannot be undone.`)) return;
  const episodeIds=new Set(state.episodes.filter(e=>e.petId===pet.id).map(e=>e.id));
  state.observations=state.observations.filter(o=>!episodeIds.has(o.episodeId));
  state.clinicalMeasurements=state.clinicalMeasurements.filter(m=>m.petId!==pet.id);
  state.diets=state.diets.filter(d=>d.petId!==pet.id);
  state.diagnoses=state.diagnoses.filter(d=>d.petId!==pet.id);
  state.episodes=state.episodes.filter(e=>e.petId!==pet.id);
  state.pets=state.pets.filter(p=>p.id!==pet.id);
  state.settings.activePetId=state.pets[0].id;
  const eps=petEpisodes(); state.settings.activeEpisodeId=(eps.find(e=>e.status==='open')||eps[0]).id;
  await save();updateContextButtons();toast(`${pet.name} removed`);render();
}
async function saveProfile(e){
  e.preventDefault();const fd=new FormData(e.target);const pet=activePet();
  ['name','sex','birthDate','weight','breed','neuterStatus','bodyConditionScore','vetName','vetPhone'].forEach(k=>pet[k]=String(fd.get(k)||'').trim());
  if(!pet.name) pet.name='My cat';
  await save();updateContextButtons();toast('Pet profile saved');render();
}
function exportJson(){const blob=new Blob([JSON.stringify({app:'Bayesian Symptom Tracker',appVersion:APP_VERSION,exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`bayesian-symptom-tracker-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);}
async function importJson(e){const file=e.target.files[0];if(!file)return;try{const obj=JSON.parse(await file.text());const incoming=obj.state||obj;if(!Array.isArray(incoming.observations)||!Array.isArray(incoming.episodes)||(!Array.isArray(incoming.pets)&&!incoming.profile))throw new Error('Unrecognized backup format');state=migrateState(incoming);state.settings.modelPack=knowledge.packId;await save();updateContextButtons();toast('Backup imported');render();}catch(err){alert(`Import failed: ${err.message}`);}e.target.value='';}
async function resetData(){if(!confirm('Reset all local pets, episodes, and symptom tracker data in this browser? Export a backup first if needed.'))return;state=defaultState();await save();updateContextButtons();toast('Local data reset');setView('dashboard');}
async function loadDemo(){
  const pet=activePet(); const ep=makeEpisode(pet.id,'Demo: GI episode',new Date(Date.now()-9*36e5).toISOString());
  const demo=[
    ['food_change',true,-9,'medium','New wet-food flavor introduced at dinner.'],
    ['vomit_single',true,-6.5,'medium','Vomited food once after eating.'],
    ['vomit_repeated',true,-5.5,'high','Two additional vomiting episodes within about an hour.'],
    ['energy_low',true,-4.5,'medium','Quieter than usual and resting more.'],
    ['urine_normal',true,-3,'medium','Normal-size urine clump observed.'],
    ['appetite_reduced',true,-1.5,'medium','Ate about one-quarter of usual portion.']
  ];
  const cur=activeEpisode(); if(cur){cur.status='closed';cur.end=ep.start;} state.episodes.push(ep); state.settings.activeEpisodeId=ep.id;
  demo.forEach(([fid,p,h,sev,note])=>state.observations.push({id:uid(),episodeId:ep.id,findingId:fid,present:p,time:new Date(Date.now()+h*36e5).toISOString(),severity:sev,confidence:'high',notes:note}));
  state.diets.push({id:uid(),petId:pet.id,brand:'Demo Foods',product:'Chicken pâté',form:'wet',startDate:new Date(Date.now()-2*864e5).toISOString().slice(0,10),endDate:'',nutrientBasis:'as_fed',moisture:'78',protein:'10',fat:'5',fiber:'1.5',carbs:'3',phosphorus:'0.25',phosphorusUnit:'percent',amount:'demo only',source:'demo data',notes:'Demo diet context; does not affect model.'});
  await save();updateContextButtons();toast(`Demo episode loaded for ${pet.name}`);setView('dashboard');
}
function updateContextButtons(){
  const pet=activePet(), ep=activeEpisode();
  if($('#petButton')) $('#petButton').textContent=pet?`${pet.name} ▾`:'Pet ▾';
  if($('#episodeButton')) $('#episodeButton').textContent=ep?`${ep.title} ▾`:'Episode ▾';
}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2200);}

async function init(){
  try{
    knowledge=await fetch('./data/cat-knowledge-v0.5.json').then(r=>{if(!r.ok)throw new Error('Knowledge pack failed to load');return r.json();});
    const stored=await dbGet('state');
    state=migrateState(stored || defaultState());
    state.settings.modelPack=knowledge.packId;
    await save();
    updateContextButtons(); render();
    $$('#nav button').forEach(b=>b.onclick=()=>setView(b.dataset.view));
    $('#quickLog').onclick=()=>openObservationModal();
    $('#petButton').onclick=openPetSwitcher;
    $('#episodeButton').onclick=()=>setView('timeline');
    $('#closeModal').onclick=closeModal; $('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal();};
    $('#mobileMenu').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
    if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }catch(err){ $('#appContent').innerHTML=`<div class="notice danger"><strong>App failed to start.</strong> ${escapeHtml(err.message)}. Serve this folder through a web server rather than opening index.html directly.</div>`; console.error(err); }
}
init();
