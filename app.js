const APP_VERSION = '0.8.0';
const STATE_SCHEMA_VERSION = 8;
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
let editingTreatmentId = null;
let editingStudyId = null;
let editingOutcomeId = null;

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
  return {id:uid(),petId,title,start,end:null,status:'open',trackingMode:'live',monitoringCadence:'standard',entryDateMode:'current_time',analysisMode:'all_evidence',analysisCutoff:null,advanceReplayOnSave:true,linkedEpisodeIds:[]};
}
function defaultState(){
  const pet=makePet();
  const episode=makeEpisode(pet.id);
  return {
    schemaVersion:STATE_SCHEMA_VERSION, pets:[pet], episodes:[episode], observations:[], clinicalMeasurements:[], diets:[], diagnoses:[], treatments:[], studies:[],
    outcomes:[],
    settings:{activePetId:pet.id,activeEpisodeId:episode.id,modelPack:'cat-practical-differentials-v0.7',reportModel:true,reportUrgency:true,reportNotes:true,reportClinical:true,reportDiet:true,reportHistory:true,reportTreatments:true,reportStudies:true,reportMonitoring:true},
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
}
function migrateState(raw){
  const s=raw && typeof raw==='object' ? raw : defaultState();
  s.settings={reportModel:true,reportUrgency:true,reportNotes:true,reportClinical:true,reportDiet:true,reportHistory:true,reportTreatments:true,reportStudies:true,reportMonitoring:true,...(s.settings||{})}; s.episodes ||= []; s.observations ||= []; s.clinicalMeasurements ||= []; s.diets ||= []; s.diagnoses ||= []; s.treatments ||= []; s.studies ||= []; s.outcomes ||= [];
  if(!Array.isArray(s.pets) || !s.pets.length){
    const legacy=s.profile||{}; const pet=makePet(legacy); s.pets=[pet];
    s.episodes.forEach(e=>{ if(!e.petId) e.petId=pet.id; });
    s.settings.activePetId=pet.id; delete s.profile;
  }
  s.pets=s.pets.map(p=>makePet(p));
  if(!s.pets.some(p=>p.id===s.settings.activePetId)) s.settings.activePetId=s.pets[0].id;
  s.episodes.forEach(e=>{
    if(!e.petId) e.petId=s.settings.activePetId;
    if(!Array.isArray(e.linkedEpisodeIds)) e.linkedEpisodeIds=[];
    if(!e.monitoringCadence) e.monitoringCadence='standard';
    if(!e.trackingMode){
      const times=[
        ...s.observations.filter(o=>o.episodeId===e.id).map(o=>o.time),
        ...s.clinicalMeasurements.filter(m=>m.episodeId===e.id).map(m=>m.time),
        ...s.studies.filter(x=>x.episodeId===e.id).map(x=>x.time),
        ...s.treatments.filter(t=>t.episodeId===e.id).flatMap(t=>[t.start,t.end].filter(Boolean))
      ].map(x=>new Date(x).getTime()).filter(Number.isFinite);
      const start=new Date(e.start||0).getTime(), first=times.length?Math.min(...times):NaN, last=times.length?Math.max(...times):NaN, now=Date.now();
      const evidencePredatesStart=Number.isFinite(start)&&Number.isFinite(first)&&first<start-24*36e5;
      const clearlyHistorical=Number.isFinite(last)&&(now-last)>30*24*36e5&&Number.isFinite(start)&&(now-start)>30*24*36e5;
      e.trackingMode=(e.status==='closed'||evidencePredatesStart||clearlyHistorical)?'retrospective':'live';
    }
    if(!['latest_evidence','current_time','analysis_cutoff'].includes(e.entryDateMode)) e.entryDateMode=e.trackingMode==='retrospective'?'latest_evidence':'current_time';
    if(!['all_evidence','as_of'].includes(e.analysisMode)) e.analysisMode='all_evidence';
    if(e.analysisCutoff && !Number.isFinite(new Date(e.analysisCutoff).getTime())) e.analysisCutoff=null;
    if(e.advanceReplayOnSave===undefined) e.advanceReplayOnSave=true;
  });
  const petId=s.settings.activePetId;
  let petEps=s.episodes.filter(e=>e.petId===petId).sort((a,b)=>new Date(b.start)-new Date(a.start));
  if(!petEps.length){ const ep=makeEpisode(petId); s.episodes.push(ep); petEps=[ep]; }
  if(!petEps.some(e=>e.id===s.settings.activeEpisodeId)) s.settings.activeEpisodeId=(petEps.find(e=>e.status==='open')||petEps[0]).id;
  s.observations.forEach(o=>{ if(!o.confidence) o.confidence='high'; if(!o.status) o.status=o.present===false?'checked_absent':'present'; if(o.status==='present')o.present=true; else if(o.status==='checked_absent'||o.status==='resolved')o.present=false; });
  s.clinicalMeasurements.forEach(m=>{ if(!m.petId) m.petId=s.settings.activePetId; if(!m.confidence) m.confidence='high'; if(m.useInModel===undefined) m.useInModel=true; });
  s.diets.forEach(d=>{ if(!d.petId) d.petId=s.settings.activePetId; });
  s.diagnoses.forEach(d=>{ if(!d.petId) d.petId=s.settings.activePetId; if(d.useInModel===undefined) d.useInModel=(d.status==='confirmed_active'||d.status==='probable_active'); });
  s.treatments.forEach(t=>{ if(!t.petId)t.petId=s.settings.activePetId; if(t.episodeId===undefined)t.episodeId=null; });
  s.studies.forEach(x=>{ if(!x.petId)x.petId=s.settings.activePetId; if(x.episodeId===undefined)x.episodeId=null; });
  s.outcomes.forEach(x=>{ if(!x.petId)x.petId=s.settings.activePetId; if(x.episodeId===undefined)x.episodeId=null; if(x.hiddenDuringReplay===undefined)x.hiddenDuringReplay=true; });
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
function petTreatments(petId=state.settings.activePetId){ return state.treatments.filter(t=>t.petId===petId).sort((a,b)=>new Date(b.start||0)-new Date(a.start||0)); }
function episodeTreatments(id=state.settings.activeEpisodeId){ return state.treatments.filter(t=>t.episodeId===id).sort((a,b)=>new Date(a.start||0)-new Date(b.start||0)); }
function petStudies(petId=state.settings.activePetId){ return state.studies.filter(x=>x.petId===petId).sort((a,b)=>new Date(b.time||0)-new Date(a.time||0)); }
function episodeStudies(id=state.settings.activeEpisodeId){ return state.studies.filter(x=>x.episodeId===id).sort((a,b)=>new Date(a.time||0)-new Date(b.time||0)); }
function petOutcomes(petId=state.settings.activePetId){ return state.outcomes.filter(x=>x.petId===petId).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)); }
function episodeOutcomes(id=state.settings.activeEpisodeId){ return state.outcomes.filter(x=>x.episodeId===id).sort((a,b)=>new Date(a.date||0)-new Date(b.date||0)); }
function episodeAnalysisCutoff(ep=activeEpisode()){
  if(!ep || ep.analysisMode!=='as_of') return null;
  const t=new Date(ep.analysisCutoff||'').getTime();
  if(Number.isFinite(t)) return new Date(t).toISOString();
  const b=episodeEvidenceBounds(ep); return b?.last || ep.start || null;
}
function withinAnalysisCutoff(time,ep=activeEpisode()){
  const cutoff=episodeAnalysisCutoff(ep); if(!cutoff) return true;
  const t=new Date(time).getTime(), c=new Date(cutoff).getTime();
  return Number.isFinite(t)&&Number.isFinite(c)?t<=c:true;
}
function analysisEpisodeObservations(id=state.settings.activeEpisodeId,ep=activeEpisode()){ return episodeObservations(id).filter(o=>withinAnalysisCutoff(o.time,ep)); }
function analysisEpisodeClinicalMeasurements(id=state.settings.activeEpisodeId,ep=activeEpisode()){ return episodeClinicalMeasurements(id).filter(m=>withinAnalysisCutoff(m.time,ep)); }
function analysisEpisodeStudies(id=state.settings.activeEpisodeId,ep=activeEpisode()){ return episodeStudies(id).filter(x=>withinAnalysisCutoff(x.time,ep)); }
function analysisEpisodeTreatments(id=state.settings.activeEpisodeId,ep=activeEpisode()){ return episodeTreatments(id).filter(t=>withinAnalysisCutoff(t.start||t.end,ep)); }
function analysisEvidenceCounts(ep=activeEpisode()){
  if(!ep)return {included:0,excluded:0,total:0};
  const all=[...episodeObservations(ep.id).map(x=>x.time),...episodeClinicalMeasurements(ep.id).map(x=>x.time),...episodeStudies(ep.id).map(x=>x.time),...episodeTreatments(ep.id).flatMap(x=>[x.start,x.end].filter(Boolean))];
  const included=all.filter(t=>withinAnalysisCutoff(t,ep)).length; return {included,excluded:all.length-included,total:all.length};
}
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
  const obs=analysisEpisodeObservations(episodeId);
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
    const pos=records.filter(r=>(r.status||'present')==='present' && r.present!==false).sort((a,b)=>new Date(a.time)-new Date(b.time));
    const neg=records.filter(r=>r.present===false || ['checked_absent','resolved'].includes(r.status)).sort((a,b)=>new Date(a.time)-new Date(b.time));
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
        const resolved=(lastNeg.status==='resolved');
        const w=sourceWeight*(resolved?(cfg.resolutionBaseWeight||.82):(cfg.negativeCheckBaseWeight||.60))*monitoring*conf;
        out.push({id:`owner:${episodeId}:${fid}:absent`,findingId:fid,present:false,time:lastNeg.time,severity:'medium',confidence:lastNeg.confidence||'high',notes:lastNeg.notes||'',evidenceType:scope==='current'?'owner':'linked_owner',sourceEpisodeId:episodeId,sourceScope:scope,weight:w,rawCount:neg.length,distinctDays:days,spanDays:0,summary:resolved?'explicitly marked resolved':`explicitly not observed${days>1?` on ${days} monitored days`:''}`});
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
function clinicalEvidence(measurements=analysisEpisodeClinicalMeasurements(),sourceWeight=1,scope='current'){
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
function linearTrend(records){
  const pts=records.map(r=>({t:new Date(r.time).getTime()/864e5,v:parseFloat(r.value),r})).filter(x=>Number.isFinite(x.t)&&Number.isFinite(x.v)).sort((a,b)=>a.t-b.t);
  if(pts.length<2)return null;
  const t0=pts[0].t, xs=pts.map(x=>x.t-t0), ys=pts.map(x=>x.v), mx=mean(xs), my=mean(ys);
  const den=xs.reduce((a,x)=>a+(x-mx)**2,0); if(!den)return null;
  const slope=xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0)/den;
  const pred=xs.map(x=>my+slope*(x-mx)), ssTot=ys.reduce((a,y)=>a+(y-my)**2,0), ssRes=ys.reduce((a,y,i)=>a+(y-pred[i])**2,0);
  const r2=ssTot>0?Math.max(0,1-ssRes/ssTot):1, span=Math.max(0,pts.at(-1).t-pts[0].t), first=ys[0], last=ys.at(-1), rel=first!==0?(last-first)/Math.abs(first):0;
  return {count:pts.length,spanDays:span,slope,r2,first,last,relativeChange:rel,firstTime:pts[0].r.time,lastTime:pts.at(-1).r.time};
}
function trendUnitKey(unit=''){
  const u=String(unit||'').trim().toLowerCase().replace(/\s+/g,'');
  const aliases={lbs:'lb',pounds:'lb',pound:'lb',kgs:'kg',kilograms:'kg',kilogram:'kg','mg\/dl':'mg/dl','mmol\/l':'mmol/l'};
  return aliases[u]||u||'unitless';
}
function quantitativeTrendEvidence(measurements=analysisEpisodeClinicalMeasurements(),sourceWeight=1,scope='current'){
  const cfg=knowledge.inferenceConfig||{}, groups=new Map(), out=[];
  for(const m of measurements){
    const t=measurementTemplate(m.templateId); if(!t?.trendMap||t.kind!=='numeric')continue;
    const key=`${m.templateId}|${trendUnitKey(m.unit)}`; if(!groups.has(key))groups.set(key,[]); groups.get(key).push(m);
  }
  for(const [groupKey,records] of groups){
    const templateId=records[0]?.templateId, t=measurementTemplate(templateId), unit=records[0]?.unit||'', tr=linearTrend(records); if(!tr)continue;
    if(tr.count<(cfg.trendMinPoints||3)||tr.spanDays<(cfg.trendMinSpanDays||7)||Math.abs(tr.relativeChange)<(cfg.trendMinRelativeChange||.05)||tr.r2<(cfg.trendMinR2||.45))continue;
    const direction=tr.slope>0?'increasing':'decreasing', fid=t.trendMap?.[direction]; if(!fid)continue;
    const conf=mean(records.map(r=>confidenceWeight(r.confidence||'high'))), strength=Math.min(1.45,1+Math.log2(1+Math.abs(tr.relativeChange)*10)*.18+Math.min(.18,tr.r2*.18));
    const weight=(cfg.trendEvidenceBaseWeight||.82)*strength*conf*sourceWeight;
    out.push({id:`trend:${scope}:${groupKey}:${fid}`,findingId:fid,present:true,time:tr.lastTime,severity:'medium',confidence:'high',notes:'',evidenceType:scope==='current'?'trend':'linked_trend',sourceScope:scope,sourceEpisodeId:records[0]?.episodeId,weight,rawCount:tr.count,spanDays:tr.spanDays,trend:tr,unit,summary:`${t.label} ${direction} across ${tr.count} measurements over ${tr.spanDays.toFixed(tr.spanDays<10?1:0)} d${unit?` (${unit})`:''} · ${(tr.relativeChange*100).toFixed(1)}% net change · R² ${tr.r2.toFixed(2)}`});
  }
  return out;
}
function correlationAdjustedEvidence(observations){
  const factors=knowledge.inferenceConfig?.correlationGroupFactors||[1,.68,.45,.30,.22], grouped=new Map(), out=[];
  observations.forEach((e,i)=>{ const g=finding(e.findingId)?.evidenceGroup; if(!g){out.push({...e,dependencyFactor:1,dependencyRank:0});return;} if(!grouped.has(g))grouped.set(g,[]); grouped.get(g).push({e,i,base:effectiveEvidenceWeight(e)}); });
  for(const [g,items] of grouped){ items.sort((a,b)=>b.base-a.base); items.forEach((x,rank)=>out.push({...x.e,evidenceGroup:g,dependencyRank:rank,dependencyFactor:factors[Math.min(rank,factors.length-1)]??factors.at(-1)??1})); }
  return out.sort((a,b)=>new Date(a.time)-new Date(b.time));
}
function modelEvidence(){
  const current=[...deriveOwnerEvidence(),...clinicalEvidence(),...quantitativeTrendEvidence()];
  const w=knowledge.inferenceConfig?.linkedHistoryWeight||.38;
  const history=linkedEpisodes().flatMap(ep=>[...deriveOwnerEvidence(ep.id,w,'linked'),...clinicalEvidence(analysisEpisodeClinicalMeasurements(ep.id),w,'linked'),...quantitativeTrendEvidence(analysisEpisodeClinicalMeasurements(ep.id),w,'linked')]);
  return correlationAdjustedEvidence([...current,...history]);
}
function episodeAnalysisStart(ep=activeEpisode()){
  if(!ep)return null;
  const bounds=episodeEvidenceBounds(ep), start=ep.start?new Date(ep.start).getTime():NaN, first=bounds?.first?new Date(bounds.first).getTime():NaN;
  if(Number.isFinite(start)&&Number.isFinite(first))return new Date(Math.min(start,first)).toISOString();
  if(Number.isFinite(first))return new Date(first).toISOString();
  return ep.start||null;
}
function demographicAdjustments(ep=activeEpisode(),pet=activePet()){
  const age=ageYearsAt(episodeAnalysisStart(ep),pet); const out={};
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
function diagnosisEffectiveDate(d){
  if(d?.date)return d.date;
  if(d?.episodeId){const ep=state.episodes.find(e=>e.id===d.episodeId);const iso=ep?.end||ep?.start;if(iso)return new Date(iso).toISOString().slice(0,10);}
  return null;
}
function diagnosisAdjustments(petId=state.settings.activePetId){
  const cfg=knowledge.inferenceConfig?.diagnosisModifiers||{}; const out={};
  knowledge.hypotheses.forEach(h=>out[h.id]={factor:1,reasons:[]});
  for(const d of petDiagnoses(petId)){
    if(!d.useInModel || !d.conditionId || !out[d.conditionId]) continue;
    const cutoff=episodeAnalysisCutoff(),dxDate=diagnosisEffectiveDate(d); if(cutoff && (!dxDate || dxDate>cutoff.slice(0,10))) continue;
    const base=cfg[d.status]||1;
    const credibility=d.source==='owner-entered'?.55:d.source==='other'?.75:1;
    const factor=base>=1 ? 1+(base-1)*credibility : 1-(1-base)*credibility;
    out[d.conditionId].factor*=factor;
    out[d.conditionId].reasons.push(`${d.status.replaceAll('_',' ')} diagnosis${d.date?` (${d.date})`:''}${d.source?` · ${d.source}`:''}`);
  }
  return out;
}
function effectiveEvidenceWeight(obs){ const base=Number.isFinite(obs.weight)?obs.weight:(knowledge.inferenceConfig?.ownerEvidenceBaseWeight||1)*severityWeight(obs.severity)*confidenceWeight(obs.confidence||'high'); return base*(Number.isFinite(obs.dependencyFactor)?obs.dependencyFactor:1); }
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
function distributionAfterVirtual(baseObs,fid,present,weight=1){
  return infer([...baseObs,{findingId:fid,present,severity:'medium',confidence:'high',weight,time:new Date().toISOString(),episodeId:state.settings.activeEpisodeId,id:'virtual'}]);
}
function informationGainForFinding(fid,baseEvidence=modelEvidence(),virtualWeight=1){
  const base=infer(baseEvidence), h0=entropy(base);
  const py=base.reduce((sum,h)=>sum+h.score*(knowledge.likelihoods[h.id]?.[fid] ?? .5),0);
  const y=distributionAfterVirtual(baseEvidence,fid,true,virtualWeight), n=distributionAfterVirtual(baseEvidence,fid,false,virtualWeight);
  const expected=py*entropy(y)+(1-py)*entropy(n);
  return {gain:Math.max(0,h0-expected),py};
}
function newObservationCandidates(limit=knowledge.monitoringConfig?.newQuestionLimit||6){
  const obs=analysisEpisodeObservations();
  const used=new Set(obs.map(o=>o.findingId));
  const usedStateGroups=new Set(obs.map(o=>finding(o.findingId)?.stateGroup).filter(Boolean));
  const baseEvidence=modelEvidence(), out=[];
  for(const f of knowledge.findings){
    if(f.sourceType==='clinical' || f.monitoringClass==='context_once') continue;
    // State-group members are mutually exclusive at a point in time. Once a state
    // has been recorded, contradictory siblings belong in reassessment/state-change
    // workflows rather than the unrecorded-question queue.
    if(used.has(f.id) || (f.stateGroup && usedStateGroups.has(f.stateGroup))) continue;
    const ig=informationGainForFinding(f.id,baseEvidence,1);
    out.push({finding:f,...ig,kind:'new'});
  }
  return out.sort((a,b)=>b.gain-a.gain).slice(0,limit);
}
function nextBestQuestion(){ return newObservationCandidates(1)[0]||null; }
function episodeMonitoringReference(ep=activeEpisode()){
  if(!ep) return new Date().toISOString();
  const cutoff=episodeAnalysisCutoff(ep); if(cutoff) return cutoff;
  const bounds=episodeEvidenceBounds(ep);
  if(ep.trackingMode==='retrospective'){
    const evidenceTimes=[ep.end,bounds?.last].filter(Boolean).map(x=>new Date(x).getTime()).filter(Number.isFinite);
    if(evidenceTimes.length) return new Date(Math.max(...evidenceTimes)).toISOString();
    return ep.start||new Date().toISOString();
  }
  if(ep.status==='closed'){
    const times=[ep.end,bounds?.last,ep.start].filter(Boolean).map(x=>new Date(x).getTime()).filter(Number.isFinite);
    return times.length?new Date(Math.max(...times)).toISOString():new Date().toISOString();
  }
  return new Date().toISOString();
}
function episodeLatestEvidenceTime(ep=activeEpisode()){
  if(!ep) return new Date().toISOString();
  const bounds=episodeEvidenceBounds(ep);
  return bounds?.last || ep.start || new Date().toISOString();
}
function episodeEntryDefaultTime(ep=activeEpisode()){
  if(ep?.entryDateMode==='analysis_cutoff') return episodeAnalysisCutoff(ep)||episodeLatestEvidenceTime(ep);
  if(ep?.entryDateMode==='latest_evidence') return episodeLatestEvidenceTime(ep);
  return new Date().toISOString();
}
function entryDateModeLabel(ep=activeEpisode()){
  if(ep?.entryDateMode==='analysis_cutoff') return episodeAnalysisCutoff(ep)?'Replay / analysis point':(ep?.trackingMode==='retrospective'?'Latest episode entry':'Current date & time');
  return ep?.entryDateMode==='latest_evidence'?'Latest episode entry':'Current date & time';
}
function dateEntryHelperHtml(fieldName='time',ep=activeEpisode()){
  const d=episodeEntryDefaultTime(ep);
  return `<div class="date-entry-helper"><span class="helper">New-entry default: <strong>${escapeHtml(entryDateModeLabel(ep))}</strong> · ${fmtDateTime(d)}</span><div class="button-row compact-row">${episodeAnalysisCutoff(ep)?`<button type="button" class="mini" data-date-fill="cutoff" data-date-target="${escapeHtml(fieldName)}">Use replay point</button>`:''}<button type="button" class="mini" data-date-fill="latest" data-date-target="${escapeHtml(fieldName)}">Use latest episode entry</button><button type="button" class="mini" data-date-fill="now" data-date-target="${escapeHtml(fieldName)}">Use current time</button></div></div>`;
}
function bindDateEntryHelpers(root=document){
  $$('[data-date-fill]',root).forEach(btn=>btn.onclick=()=>{
    const target=root.querySelector(`[name="${btn.dataset.dateTarget}"]`); if(!target)return;
    const iso=btn.dataset.dateFill==='cutoff'?(episodeAnalysisCutoff()||episodeLatestEvidenceTime()):btn.dataset.dateFill==='latest'?episodeLatestEvidenceTime():new Date().toISOString();
    target.value=toInputDate(iso);
  });
}
function monitoringCadenceHours(f,last,ep=activeEpisode()){
  const cfg=knowledge.monitoringConfig||{};
  const cls=f?.monitoringClass || (f?.stateGroup?'state':'event');
  let hours=cls==='state'||cls==='baseline_state'?(cfg.stateRecheckHours||24):(cfg.eventRecheckHours||48);
  if(last?.present===false || ['checked_absent','resolved'].includes(last?.status)) hours=cfg.absenceRecheckHours||72;
  if(cls==='baseline_state') hours*=cfg.baselineStateMultiplier||3;
  hours*=cfg.cadenceFactors?.[ep?.monitoringCadence||'standard']||1;
  hours*=cfg.confidenceCadenceFactors?.[last?.confidence||'high']||1;
  if(last?.present!==false && last?.status!=='resolved') hours*=cfg.severityCadenceFactors?.[last?.severity||'medium']||1;
  return Math.max(4,hours);
}
function monitoringCandidates(ep=activeEpisode()){
  if(!ep) return [];
  const obs=analysisEpisodeObservations(ep.id), refIso=episodeMonitoringReference(ep), ref=new Date(refIso).getTime();
  if(!obs.length || !Number.isFinite(ref)) return [];
  const baseEvidence=modelEvidence(), cfg=knowledge.monitoringConfig||{}, virtualWeight=cfg.monitoringVirtualWeight||.45;
  const byFinding=new Map(), byStateGroup=new Map();
  obs.forEach(o=>{
    if(!byFinding.has(o.findingId))byFinding.set(o.findingId,[]); byFinding.get(o.findingId).push(o);
    const f=finding(o.findingId); if(f?.stateGroup){const prev=byStateGroup.get(f.stateGroup);if(!prev||new Date(o.time)>new Date(prev.time))byStateGroup.set(f.stateGroup,o);}
  });
  const candidateRecords=[];
  const consumed=new Set();
  for(const [group,last] of byStateGroup){
    candidateRecords.push({last,records:byFinding.get(last.findingId)||[],stateGroup:group});
    for(const fid of byFinding.keys()) if(finding(fid)?.stateGroup===group) consumed.add(fid);
  }
  for(const [fid,records] of byFinding){ if(!consumed.has(fid)) candidateRecords.push({last:[...records].sort((a,b)=>new Date(a.time)-new Date(b.time)).at(-1),records}); }
  const out=[];
  for(const item of candidateRecords){
    const last=item.last, f=finding(last.findingId); if(!f || f.sourceType==='clinical' || f.monitoringClass==='context_once') continue;
    const status=last.status||(last.present===false?'checked_absent':'present');
    if(status==='resolved') continue;
    const lastMs=new Date(last.time).getTime(); if(!Number.isFinite(lastMs)) continue;
    const cadence=monitoringCadenceHours(f,last,ep), elapsed=Math.max(0,(ref-lastMs)/36e5), dueAt=new Date(lastMs+cadence*36e5).toISOString(), overdueHours=elapsed-cadence, due=overdueHours>=0;
    const ig=informationGainForFinding(f.id,baseEvidence,virtualWeight);
    const overdueFactor=due?Math.min(cfg.maxOverduePriorityFactor||3,1+Math.max(0,overdueHours)/Math.max(1,cadence)):Math.max(.12,elapsed/Math.max(1,cadence));
    const uncertainty=1+(1-confidenceWeight(last.confidence||'high'))*.8;
    const recurrence=Math.min(1.35,1+.08*Math.log2(1+item.records.filter(r=>r.present!==false).length));
    const priority=(.015+ig.gain)*overdueFactor*uncertainty*recurrence;
    let kind='event_recurrence', prompt=`Has ${f.label.toLowerCase()} occurred again since ${fmtDateTime(last.time)}?`;
    if(f.stateGroup){kind=status==='checked_absent'?'state_absence_recheck':'state_reassessment';prompt=status==='checked_absent'?`Is ${f.label.toLowerCase()} still not observed?`:`Is ${f.label.toLowerCase()} still the current state?`;}
    else if(status==='checked_absent'){kind='absence_recheck';prompt=`Is ${f.label.toLowerCase()} still not observed?`;}
    out.push({kind,finding:f,last,records:item.records,referenceTime:refIso,cadenceHours:cadence,dueAt,elapsedHours:elapsed,overdueHours,due,priority,informationGain:ig.gain,prompt});
  }
  return out.sort((a,b)=>(b.due-a.due)||(b.priority-a.priority)||(new Date(a.dueAt)-new Date(b.dueAt))).slice(0,cfg.queueLimit||12);
}
function monitoringSummary(ep=activeEpisode()){
  const obs=analysisEpisodeObservations(ep?.id), queue=monitoringCandidates(ep), ref=episodeMonitoringReference(ep), bounds=episodeEvidenceBounds(ep);
  const resolved=obs.filter(o=>o.status==='resolved').length, days=distinctDayCount(obs);
  return {queue,due:queue.filter(x=>x.due),upcoming:queue.filter(x=>!x.due),referenceTime:ref,rawObservations:obs.length,observationDays:days,resolved,bounds};
}
function monitoringDueLabel(item,ep=activeEpisode()){
  if(item.due){
    if(ep?.trackingMode==='retrospective') return `Due at historical reference point · cadence ${formatHours(item.cadenceHours)}`;
    return `${formatHours(Math.max(0,item.overdueHours))} overdue · cadence ${formatHours(item.cadenceHours)}`;
  }
  return `Next re-check in ${formatHours(Math.max(0,-item.overdueHours))} · cadence ${formatHours(item.cadenceHours)}`;
}
function formatHours(h){ if(h<1)return `${Math.max(1,Math.round(h*60))} min`; if(h<48)return `${h<10?h.toFixed(1):Math.round(h)} h`; return `${(h/24).toFixed(h<240?1:0)} d`; }
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
  analysisEpisodeObservations().forEach(o=>map.set(o.findingId,o));
  return map;
}
function urgencyAlerts(){
  const latest=latestFindingState();
  return knowledge.urgencyRules.flatMap(r=>{
    const matched=r.findings.map(id=>latest.get(id)).filter(o=>o?.present===true);
    const hit=r.match==='all'?matched.length===r.findings.length:matched.length>0;
    if(!hit)return [];
    const triggerTime=matched.map(o=>new Date(o.time).getTime()).filter(Number.isFinite).reduce((a,b)=>Math.max(a,b),0);
    return [{...r,triggerTime:triggerTime?new Date(triggerTime).toISOString():null}];
  }).sort((a,b)=> (a.level==='emergency'?-1:1)-(b.level==='emergency'?-1:1));
}
function urgencyIsHistorical(alert=null){
  const ep=activeEpisode(); if(!ep)return false;
  if(ep.status==='closed')return true;
  const t=alert?.triggerTime?new Date(alert.triggerTime).getTime():null;
  return Number.isFinite(t)?(Date.now()-t)>72*36e5:false;
}
function urgencyStatus(){
  const a=urgencyAlerts(); if(!a.length)return 'No episode flags';
  const current=a.filter(x=>!urgencyIsHistorical(x)), source=current.length?current:a, historical=!current.length;
  if(historical)return source.some(x=>x.level==='emergency')?'Historical emergency flag':'Historical urgent flag';
  return source.some(x=>x.level==='emergency')?'Emergency flag':'Urgent flag';
}

function episodeEvidenceTimes(ep=activeEpisode()){
  if(!ep)return [];
  const times=[...episodeObservations(ep.id).map(o=>o.time),...episodeClinicalMeasurements(ep.id).map(m=>m.time),...episodeStudies(ep.id).map(x=>x.time),...episodeTreatments(ep.id).flatMap(t=>[t.start,t.end].filter(Boolean))]
    .map(x=>new Date(x).getTime()).filter(Number.isFinite);
  return [...new Set(times)].sort((a,b)=>a-b).map(t=>new Date(t).toISOString());
}
async function setAnalysisMode(mode){
  const ep=activeEpisode(); if(!ep)return; ep.analysisMode=mode==='as_of'?'as_of':'all_evidence';
  if(ep.analysisMode==='as_of'&&!Number.isFinite(new Date(ep.analysisCutoff||'').getTime())){const ts=episodeEvidenceTimes(ep);ep.analysisCutoff=ts[0]||ep.start||new Date().toISOString();}
  if(ep.analysisMode==='as_of'&&ep.trackingMode==='retrospective'&&ep.entryDateMode==='latest_evidence') ep.entryDateMode='analysis_cutoff';
  if(ep.analysisMode!=='as_of'&&ep.entryDateMode==='analysis_cutoff') ep.entryDateMode=ep.trackingMode==='retrospective'?'latest_evidence':'current_time';
  await save();render();
}
async function setAnalysisCutoff(iso){ const ep=activeEpisode(); if(!ep||!iso)return; ep.analysisMode='as_of';ep.analysisCutoff=new Date(iso).toISOString();await save();render(); }
async function stepAnalysisCutoff(direction){
  const ep=activeEpisode();if(!ep)return;const ts=episodeEvidenceTimes(ep);if(!ts.length)return;
  const cur=new Date(episodeAnalysisCutoff(ep)||ts[0]).getTime();let idx=ts.findIndex(x=>new Date(x).getTime()>=cur);
  if(idx<0)idx=ts.length-1;if(direction==='first')idx=0;else if(direction==='latest')idx=ts.length-1;else if(direction==='prev')idx=Math.max(0,idx-(new Date(ts[idx]).getTime()>=cur?1:0));else if(direction==='next'){while(idx<ts.length&&new Date(ts[idx]).getTime()<=cur)idx++;idx=Math.min(ts.length-1,idx);}
  ep.analysisMode='as_of';ep.analysisCutoff=ts[idx];await save();render();
}
function analysisScopeSummary(ep=activeEpisode()){
  const counts=analysisEvidenceCounts(ep),cutoff=episodeAnalysisCutoff(ep);return {mode:cutoff?'as_of':'all_evidence',cutoff,counts};
}
function maybeAdvanceReplayCutoff(iso,ep=activeEpisode()){
  if(!ep||ep.analysisMode!=='as_of'||ep.advanceReplayOnSave===false||!iso)return false;
  const cur=new Date(ep.analysisCutoff||0).getTime(),t=new Date(iso).getTime();
  if(Number.isFinite(t)&&(!Number.isFinite(cur)||t>=cur)){ep.analysisCutoff=new Date(t).toISOString();return true;}
  return false;
}
function inferAtCutoff(iso,ep=activeEpisode()){
  if(!ep||!iso)return infer(); const prevMode=ep.analysisMode,prevCutoff=ep.analysisCutoff;
  ep.analysisMode='as_of';ep.analysisCutoff=iso;
  try{return infer();}finally{ep.analysisMode=prevMode;ep.analysisCutoff=prevCutoff;}
}
function replayTrajectory(maxPoints=12,ep=activeEpisode()){
  const cutoff=episodeAnalysisCutoff(ep);let times=episodeEvidenceTimes(ep);if(cutoff)times=times.filter(t=>new Date(t).getTime()<=new Date(cutoff).getTime());if(!times.length)return [];
  let sampled=times;
  if(times.length>maxPoints){const idx=new Set([0,times.length-1]);for(let i=1;i<maxPoints-1;i++)idx.add(Math.round(i*(times.length-1)/(maxPoints-1)));sampled=[...idx].sort((a,b)=>a-b).map(i=>times[i]);}
  return sampled.map(time=>{const model=inferAtCutoff(time,ep);return {time,top:model.slice(0,3)};});
}
function renderReplayTrajectory(ep=activeEpisode()){
  const rows=replayTrajectory(12,ep);if(rows.length<2)return '';
  return `<div class="card section-gap"><div class="card-head"><div><span class="eyebrow">DIFFERENTIAL TRAJECTORY</span><h2>How the leading pattern changed as evidence accumulated</h2></div><span class="chip">${rows.length} replay snapshots</span></div><div class="card-pad"><p>This is a retrospective replay of the same stored record. Each row uses only evidence dated at or before that row's timestamp; it does not alter the saved episode or current replay cutoff.</p><div class="table-wrap"><table class="table"><thead><tr><th>As of</th><th>1st</th><th>2nd</th><th>3rd</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fmtDateTime(r.time)}</td>${r.top.map(h=>`<td><strong>${escapeHtml(h.label)}</strong><br><small>${(h.score*100).toFixed(1)}%</small></td>`).join('')}</tr>`).join('')}</tbody></table></div></div></div>`;
}
function setView(view){
  currentView=view;
  $$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const meta={
    dashboard:['Dashboard','Track observations, episodes, and how the evidence shifts.'],
    log:['Log observation','Add a timestamped finding or explicitly record that a finding was absent.'],
    timeline:['Timeline','Review and edit the episode as it unfolded.'],
    monitoring:['Monitoring','Reassess ongoing findings, track persistence and recurrence, and identify new information opportunities.'],
    context:['Clinical & context','Record measurements, trends, treatments, diagnostic studies, and diet context.'],
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
  if(currentView==='monitoring') root.innerHTML=renderMonitoringPage();
  if(currentView==='context') root.innerHTML=renderContextPage();
  if(currentView==='history') root.innerHTML=renderHistoryPage();
  if(currentView==='model') root.innerHTML=renderModelPage();
  if(currentView==='reports') root.innerHTML=renderReportsPage();
  if(currentView==='settings') root.innerHTML=renderSettingsPage();
  bindRenderedActions();
}

function monitoringActionButtons(item){
  const fid=escapeHtml(item.finding.id), cls=item.finding.monitoringClass||'';
  if(item.kind==='state_reassessment'){
    if(cls==='baseline_state') return `<div class="question-actions"><button class="primary" data-monitor-status="present" data-finding="${fid}">Still current</button><button class="ghost" data-log-finding="${fid}">Changed / details</button></div>`;
    return `<div class="question-actions"><button class="primary" data-monitor-status="present" data-finding="${fid}">Still present</button><button class="ghost" data-monitor-status="resolved" data-finding="${fid}">Resolved</button><button class="ghost" data-log-finding="${fid}">Add details</button></div>`;
  }
  if(item.kind==='state_absence_recheck'||item.kind==='absence_recheck') return `<div class="question-actions"><button class="primary" data-monitor-status="checked_absent" data-finding="${fid}">Still not observed</button><button class="ghost" data-monitor-status="present" data-finding="${fid}">Observed now</button><button class="ghost" data-log-finding="${fid}">Add details</button></div>`;
  return `<div class="question-actions"><button class="primary" data-monitor-status="present" data-finding="${fid}">Occurred again</button><button class="ghost" data-monitor-status="checked_absent" data-finding="${fid}">No recurrence observed</button><button class="ghost" data-log-finding="${fid}">Add details</button></div>`;
}
function renderMonitoringQueue(items,{compact=false}={}){
  if(!items.length) return `<div class="empty compact">No reassessments are currently queued.</div>`;
  return `<div class="monitor-list">${items.map(item=>`<div class="monitor-item ${item.due?'due':''}"><div class="monitor-main"><div class="monitor-title"><span class="badge ${item.due?'urgent':'clear'}">${item.due?'Due':'Upcoming'}</span><strong>${escapeHtml(item.finding.label)}</strong></div><p>${escapeHtml(item.prompt)}</p><div class="monitor-meta"><span>Last record ${fmtDateTime(item.last.time)}</span><span>${escapeHtml(monitoringDueLabel(item))}</span><span>Discriminatory value ${item.informationGain.toFixed(3)} bits</span></div>${compact?'':`<small>${escapeHtml((knowledge.monitoringConfig?.policy)||'')}</small>`}</div><div class="monitor-actions">${monitoringActionButtons(item)}</div></div>`).join('')}</div>`;
}
function renderNewObservationOpportunity(q,{compact=false}={}){
  if(!q) return `<div class="empty compact">No additional unrecorded owner finding is currently available.</div>`;
  return `<div class="question-card"><h3>${escapeHtml(q.finding.question)}</h3><p>${compact?'Highest-value unrecorded finding at the current model state.':'This is an unrecorded finding estimated to reduce model uncertainty. It is separate from reassessing symptoms you are already following and is not a medical recommendation.'}</p><div class="chips"><span class="chip accent">Expected information gain ${q.gain.toFixed(3)} bits</span></div><div class="question-actions section-gap"><button class="primary" data-quick-answer="yes" data-finding="${q.finding.id}">Yes</button><button class="ghost" data-quick-answer="no" data-finding="${q.finding.id}">No</button><button class="ghost" data-log-finding="${q.finding.id}">Add details</button></div></div>`;
}
function renderMonitoringPage(){
  const ep=activeEpisode(), summary=monitoringSummary(ep), due=summary.due, upcoming=summary.upcoming, opportunities=newObservationCandidates();
  const currentEvidence=deriveOwnerEvidence().filter(e=>e.sourceScope==='current').sort((a,b)=>new Date(b.time)-new Date(a.time));
  const refLabel=ep.trackingMode==='retrospective'?'historical reference point':'current time';
  return `<div class="notice"><strong>Monitoring is separate from inference.</strong> The queue helps you decide what recorded state may be worth updating next. Its cadence is a data-quality heuristic, not a veterinary recheck schedule. Repeated checks remain raw history and are temporally summarized rather than multiplied as independent diagnostic tests.</div>
  ${ep.trackingMode==='retrospective'?`<div class="notice warning section-gap"><strong>Retrospective reconstruction mode.</strong> Reassessment timing is referenced to the latest evidence in this episode (${fmtDateTime(summary.referenceTime)}), not to today's clock. Quick answers open the detailed form. With <strong>Latest episode entry</strong> selected, the form is prefilled from the most recent historical record instead of today's date.</div>`:''}
  <div class="grid three section-gap">
    <div class="card kpi"><div class="kpi-label">REASSESSMENTS DUE</div><div class="kpi-value">${due.length}</div><div class="kpi-foot">${summary.queue.length} tracked finding${summary.queue.length===1?'':'s'} in queue</div></div>
    <div class="card kpi"><div class="kpi-label">OBSERVATION DAYS</div><div class="kpi-value">${summary.observationDays}</div><div class="kpi-foot">${summary.rawObservations} raw observation${summary.rawObservations===1?'':'s'}</div></div>
    <div class="card kpi"><div class="kpi-label">MONITORING REFERENCE</div><div class="kpi-value" style="font-size:21px">${ep.trackingMode==='retrospective'?'Historical':'Live'}</div><div class="kpi-foot">${fmtDateTime(summary.referenceTime)} · ${escapeHtml(ep.monitoringCadence||'standard')} cadence</div></div>
  </div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">REASSESSMENT QUEUE</span><h2>Ongoing and recurrent findings</h2></div><span class="chip ${due.length?'warning-chip':''}">${due.length} due</span></div><div class="card-pad">${renderMonitoringQueue([...due,...upcoming])}</div></div>
  <div class="grid two section-gap">
    <div class="card"><div class="card-head"><div><span class="eyebrow">NEW INFORMATION</span><h2>Unrecorded findings worth checking</h2></div><span class="chip">${opportunities.length} shown</span></div><div class="card-pad"><p>These prompts are distinct from reassessing an ongoing symptom. They are ranked only by expected reduction in model uncertainty.</p><div class="opportunity-list">${opportunities.map(q=>renderNewObservationOpportunity(q,{compact:true})).join('')}</div></div></div>
    <div class="card"><div class="card-head"><div><span class="eyebrow">DERIVED CURRENT STATE</span><h2>What the model is carrying forward</h2></div></div><div class="card-pad">${currentEvidence.length?`<div class="context-list">${currentEvidence.slice(0,20).map(e=>`<div class="context-item"><div><strong>${escapeHtml(evidenceLabel(e))}</strong><small>${escapeHtml(e.summary||'')}</small></div><div class="context-actions"><span class="chip">${e.rawCount||1} raw</span><span class="chip">${effectiveEvidenceWeight(e).toFixed(2)}× evidence</span></div></div>`).join('')}</div>`:'<div class="empty compact">No derived owner evidence yet.</div>'}</div></div>
  </div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">EPISODE MONITORING MODE</span><h2>${escapeHtml(ep.title)}</h2></div><button class="secondary" data-edit-episode>Edit episode</button></div><div class="card-pad"><p><strong>${ep.trackingMode==='retrospective'?'Retrospective reconstruction':'Live monitoring'}</strong> · ${escapeHtml(ep.monitoringCadence||'standard')} logging cadence · reference is ${escapeHtml(refLabel)}.</p><p><strong>New-entry date default:</strong> ${escapeHtml(entryDateModeLabel(ep))}${ep.entryDateMode==='latest_evidence'?` (${fmtDateTime(episodeLatestEvidenceTime(ep))})`:''}.</p><p class="helper">Use episode settings to switch tracking mode, change reassessment density, or control the timestamp prefilled for new entries. These controls do not change Bayesian likelihoods.</p></div></div>`;
}

function renderDashboard(){
  const obs=episodeObservations(); const clinical=episodeClinicalMeasurements(); const evidence=modelEvidence(); const model=infer(evidence); const alerts=urgencyAlerts(); const ep=activeEpisode(); const next=nextBestQuestion(); const timeline=episodeTimelineItems(); const monitoring=monitoringSummary(ep); const due=monitoring.due;
  const refDate=new Date(monitoring.referenceTime).toDateString(); const referenceDayCount=obs.filter(o=>new Date(o.time).toDateString()===refDate).length;
  const analysisStart=episodeAnalysisStart(ep), duration=ep&&analysisStart?hoursBetween(analysisStart,monitoring.referenceTime):0;
  const topDue=due[0];
  return `
    ${alerts.length?renderUrgency(alerts):`<div class="notice"><strong>No active deterministic urgency flags.</strong> This does not rule out illness or replace veterinary judgment.</div>`}
    <div class="grid three section-gap">
      <div class="card kpi"><div class="kpi-label">${ep.trackingMode==='retrospective'?'OBSERVATIONS ON LATEST DAY':'OBSERVATIONS TODAY'}</div><div class="kpi-value">${referenceDayCount}</div><div class="kpi-foot">${obs.length} raw observation${obs.length===1?'':'s'} in this episode</div></div>
      <div class="card kpi"><div class="kpi-label">EPISODE DURATION</div><div class="kpi-value">${duration<24?duration.toFixed(1)+' h':(duration/24).toFixed(1)+' d'}</div><div class="kpi-foot">Analysis start ${analysisStart?fmtDateTime(analysisStart):'—'} · ${ep.trackingMode==='retrospective'?'historical':'live'}</div></div>
      <div class="card kpi"><div class="kpi-label">REASSESSMENTS DUE</div><div class="kpi-value">${due.length}</div><div class="kpi-foot">Monitoring queue · independent of Bayesian likelihoods</div></div>
    </div>
    <div class="grid two section-gap">
      <div class="card">
        <div class="card-head"><div><span class="eyebrow">RELATIVE PATTERN CONSISTENCY</span><h2>Current condition matches</h2></div><button class="mini" data-viewgo="model">Inspect model</button></div>
        <div class="score-list">${evidence.length?renderScores(model.slice(0,8)):`<div class="empty">No condition ranking yet. Add observations or mapped clinical evidence to begin.</div>`}</div>
      </div>
      <div class="card">
        <div class="card-head"><div><span class="eyebrow">MONITORING & INFORMATION VALUE</span><h2>${topDue?'Reassess ongoing evidence':'Useful next observation'}</h2></div><button class="mini" data-viewgo="monitoring">Open monitoring</button></div>
        ${topDue?`<div class="card-pad">${renderMonitoringQueue([topDue],{compact:true})}${next?`<div class="divider"></div><span class="eyebrow">NEW INFORMATION</span>${renderNewObservationOpportunity(next,{compact:true})}`:''}</div>`:`<div class="card-pad">${renderNewObservationOpportunity(next)}</div>`}
      </div>
    </div>
    <div class="grid two section-gap">
      <div class="card"><div class="card-head"><div><span class="eyebrow">EPISODE</span><h2>Recent timeline</h2></div><button class="mini" data-viewgo="timeline">View all</button></div>${renderTimeline(timeline.slice(-6).reverse())}</div>
      <div class="card"><div class="card-head"><div><span class="eyebrow">MODEL NOTICE</span><h2>What the percentages mean</h2></div></div><div class="card-pad"><p style="margin-top:0">The percentages are normalized Bayesian <strong>pattern-consistency scores</strong> across the condition library. They are not estimates of the probability that your cat has a disease.</p><p>The model is intentionally transparent: observations, priors and likelihood assumptions are inspectable, and urgency warnings are calculated separately.</p><div class="notice warning">The current feline differential pack is <strong>not clinically validated</strong>. It includes an explicit Other / unmodeled reserve because even a large library cannot rule out diseases it does not represent.</div></div></div>
    </div>
    <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">CONTEXT</span><h2>Clinical & longitudinal context</h2></div><button class="mini" data-viewgo="context">Open context</button></div><div class="card-pad context-summary"><div><strong>${clinical.length}</strong><span>clinical result${clinical.length===1?'':'s'} attached</span></div><div><strong>${episodeTreatments().length}</strong><span>treatment record${episodeTreatments().length===1?'':'s'} attached</span></div><div><strong>${episodeStudies().length}</strong><span>diagnostic stud${episodeStudies().length===1?'y':'ies'} attached</span></div><p>Measurements and selected derived trends can inform the model. Treatments, studies, and diet remain explicit context unless a future evidence mapping is justified.</p></div></div>`;
}

function renderUrgency(alerts){
  const current=alerts.filter(a=>!urgencyIsHistorical(a)), top=(current.length?current:alerts)[0], historical=urgencyIsHistorical(top), cls=top.level==='emergency'?'danger':'warning';
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
    ...episodeClinicalMeasurements().map(m=>({kind:'clinical',time:m.time,record:m})),
    ...episodeStudies().map(x=>({kind:'study',time:x.time,record:x})),
    ...episodeTreatments().filter(t=>t.start).map(t=>({kind:'treatment',time:t.start,record:t}))
  ].sort((a,b)=>new Date(a.time)-new Date(b.time));
}
function renderTimeline(items){
  if(!items.length) return `<div class="empty"><div class="big">∅</div>No episode records logged yet.</div>`;
  return `<div class="timeline">${items.map(item=>{
    if(item.kind==='clinical'){
      const m=item.record,t=measurementTemplate(m.templateId),fid=clinicalFindingFor(m);
      return `<div class="event"><div class="event-time">${fmtDateTime(m.time)}</div><div class="dot clinical-dot"></div><div class="event-body"><strong>${escapeHtml(t?.label||m.label||'Clinical measurement')}: ${escapeHtml(m.value||'—')}${m.unit?` ${escapeHtml(m.unit)}`:''}</strong>${m.notes?`<p>${escapeHtml(m.notes)}</p>`:''}<div class="event-actions"><span class="chip">Clinical · ${escapeHtml(m.interpretation||'unspecified')}</span>${fid&&m.useInModel?'<span class="chip accent">Used in model</span>':''}<button class="mini" data-edit-clinical="${m.id}">Edit</button></div></div></div>`;
    }
    if(item.kind==='study'){const x=item.record;return `<div class="event"><div class="event-time">${fmtDateTime(x.time)}</div><div class="dot study-dot"></div><div class="event-body"><strong>${escapeHtml(x.type||'Diagnostic study')}${x.bodySite?' · '+escapeHtml(x.bodySite):''}</strong>${x.summary?`<p>${escapeHtml(x.summary)}</p>`:''}<div class="event-actions"><span class="chip">Study · ${escapeHtml(x.interpretation||'unspecified')}</span><span class="chip">Context</span><button class="mini" data-edit-study="${x.id}">Edit</button></div></div></div>`;}
    if(item.kind==='treatment'){const t=item.record;return `<div class="event"><div class="event-time">${fmtDateTime(t.start)}</div><div class="dot treatment-dot"></div><div class="event-body"><strong>${escapeHtml(t.name||'Treatment')}</strong><p>${escapeHtml([t.dose,t.route,t.frequency].filter(Boolean).join(' · '))}</p><div class="event-actions"><span class="chip">${escapeHtml(t.type||'treatment')}</span><span class="chip">Context</span><button class="mini" data-edit-treatment="${t.id}">Edit</button></div></div></div>`;}
    const o=item.record,f=finding(o.findingId),status=o.status||(o.present===false?'checked_absent':'present'),prefix=status==='resolved'?'Resolved: ':status==='checked_absent'?'Not observed: ':'';return `<div class="event"><div class="event-time">${fmtDateTime(o.time)}</div><div class="dot" style="background:${status==='present'?'var(--accent)':'#8090a5'}"></div><div class="event-body"><strong>${prefix}${escapeHtml(f?.label||o.findingId)}</strong>${o.notes?`<p>${escapeHtml(o.notes)}</p>`:''}<div class="event-actions">${status==='present'?`<span class="chip">Intensity: ${escapeHtml(o.severity||'medium')}</span>`:`<span class="chip">${status==='resolved'?'Resolved':'Checked absent'}</span>`}<span class="chip">Confidence: ${escapeHtml(o.confidence||'high')}</span><button class="mini" data-edit-obs="${o.id}">Edit</button></div></div></div>`;
  }).join('')}</div>`;
}
function logFormHtml(obs=null,formId='observationForm'){
  const ownerFindings=knowledge.findings.filter(f=>f.sourceType!=='clinical');
  const categories=[...new Set(ownerFindings.map(f=>f.category))];
  const selected=obs?.findingId || ownerFindings[0].id;
  return `<form id="${formId}">
    <div class="form-row">
      <div class="field"><label>Finding</label><select name="findingId">${categories.map(cat=>`<optgroup label="${escapeHtml(cat)}">${ownerFindings.filter(f=>f.category===cat).map(f=>`<option value="${f.id}" ${selected===f.id?'selected':''}>${escapeHtml(f.label)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="field"><label>Outcome</label><select name="status"><option value="present" ${(obs?.status|| (obs?.present===false?'checked_absent':'present'))==='present'?'selected':''}>Observed / present</option><option value="checked_absent" ${(obs?.status|| (obs?.present===false?'checked_absent':'present'))==='checked_absent'?'selected':''}>Checked and not observed</option><option value="resolved" ${obs?.status==='resolved'?'selected':''}>Previously present — now resolved</option></select></div>
    </div>
    <div class="form-row three">
      <div class="field"><label>Date & time</label><input type="datetime-local" name="time" value="${toInputDate(obs?.time||episodeEntryDefaultTime())}" required>${dateEntryHelperHtml('time')}</div>
      <div class="field"><label>Intensity</label><select name="severity"><option value="low" ${obs?.severity==='low'?'selected':''}>Low / mild</option><option value="medium" ${!obs||obs?.severity==='medium'?'selected':''}>Medium</option><option value="high" ${obs?.severity==='high'?'selected':''}>High / marked</option></select></div>
      <div class="field"><label>Observation confidence</label><select name="confidence"><option value="low" ${obs?.confidence==='low'?'selected':''}>Low — uncertain</option><option value="medium" ${obs?.confidence==='medium'?'selected':''}>Medium — fairly sure</option><option value="high" ${!obs||!obs?.confidence||obs?.confidence==='high'?'selected':''}>High — directly observed / measured</option></select></div>
    </div>
    <div class="field"><label>Notes</label><textarea name="notes" placeholder="What happened? Add quantity, color, contents, behavior, timing, context, etc.">${escapeHtml(obs?.notes||'')}</textarea><span class="helper">Confidence changes how strongly this observation influences the model. Intensity applies to a present symptom; an explicit resolution or checked absence is evaluated through confidence and timing instead.</span></div>
    <div class="form-actions">${obs?`<button type="button" class="danger" data-delete-obs="${obs.id}">Delete</button>`:''}<button type="submit" class="primary">${obs?'Save changes':'Add observation'}</button></div>
  </form>`;
}
function toInputDate(iso){ const d=new Date(iso);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16); }
function renderLogPage(){ return `<div class="grid two"><div class="card"><div class="card-head"><div><span class="eyebrow">NEW EVIDENCE</span><h2>Record an observation</h2></div></div><div class="card-pad">${logFormHtml(null,'inlineLogForm')}</div></div><div class="card"><div class="card-head"><div><span class="eyebrow">GUIDANCE</span><h2>Good observations are specific</h2></div></div><div class="card-pad"><p>Record what you actually saw and when. Time, frequency, amount, duration and context can matter more than a vague symptom label.</p><div class="notice"><strong>Example:</strong> “Vomited clear foam at 2:15 AM; third episode in 90 minutes; no food visible.”</div><p>You can explicitly record a checked absence or mark a previously present finding as resolved. Do not delete a historical observation just because it stopped happening.</p></div></div></div>`; }
function renderTimelinePage(){
  const eps=petEpisodes(); const items=[...episodeTimelineItems()].reverse(); const pet=activePet(), ep=activeEpisode(), scope=analysisScopeSummary(ep);
  return `${scope.mode==='as_of'?`<div class="notice warning"><strong>Replay boundary:</strong> the model is currently analyzing evidence only through ${fmtDateTime(scope.cutoff)}. The timeline still preserves and shows the complete record; ${scope.counts.excluded} later dated record${scope.counts.excluded===1?' is':'s are'} excluded from inference.</div>`:''}<div class="card ${scope.mode==='as_of'?'section-gap':''}"><div class="card-head"><div><span class="eyebrow">${escapeHtml(pet.name.toUpperCase())} · EPISODES</span><h2>${escapeHtml(ep.title)}</h2></div><div class="button-row"><button class="ghost" data-edit-episode>Edit episode</button><button class="primary" data-new-episode>＋ New episode</button></div></div><div class="card-pad"><div class="episode-strip">${eps.map(e=>`<button class="episode-pill ${e.id===state.settings.activeEpisodeId?'active':''}" data-episode="${e.id}">${escapeHtml(e.title)} · ${fmtDate(e.start)}</button>`).join('')}</div></div>${renderTimeline(items)}</div>`;
}

function renderContextPage(){
  const clinical=[...petClinicalMeasurements()].reverse(), diets=petDiets(), treatments=petTreatments(), studies=petStudies(), ep=activeEpisode(), trends=petQuantitativeTrends();
  return `<div class="notice"><strong>Preserve the record first; infer second.</strong> Numeric measurements are retained exactly and summarized into longitudinal trends when enough data exist. Treatments, diagnostic studies and diet are stored as explicit context and do not silently change the Bayesian differential in this release.</div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">LONGITUDINAL TRENDS</span><h2>Quantitative series</h2></div><span class="chip">${trends.length} series</span></div><div class="card-pad">${renderTrendList(trends)}</div></div>
  <div class="grid two section-gap context-grid">
    <div class="card"><div class="card-head"><div><span class="eyebrow">CLINICAL</span><h2>Measurements & test results</h2></div><button class="primary" data-add-clinical>＋ Add result</button></div><div class="card-pad"><p>Use the reference interval printed by the lab or supplied by the veterinarian. The app does not impose a universal numeric reference range.</p>${renderClinicalList(clinical)}</div></div>
    <div class="card"><div class="card-head"><div><span class="eyebrow">TREATMENTS</span><h2>Medications & interventions</h2></div><button class="primary" data-add-treatment>＋ Add treatment</button></div><div class="card-pad"><p>Record medication, fluids, procedures, supplements and other interventions with dose, route, timing, adherence and response. Treatment context is not automatically treated as diagnostic evidence.</p>${renderTreatmentList(treatments)}</div></div>
  </div>
  <div class="grid two section-gap context-grid">
    <div class="card"><div class="card-head"><div><span class="eyebrow">DIAGNOSTIC STUDIES</span><h2>Imaging, pathology & procedures</h2></div><button class="primary" data-add-study>＋ Add study</button></div><div class="card-pad"><p>Retain ultrasound, radiograph, echocardiogram, cytology, histopathology and other narrative diagnostic results with provenance.</p>${renderStudyList(studies)}</div></div>
    <div class="card"><div class="card-head"><div><span class="eyebrow">DIET CONTEXT</span><h2>Foods & nutrient profile</h2></div><button class="primary" data-add-diet>＋ Add food</button></div><div class="card-pad"><p>Track food form and nutrient composition over time. Protein, fat, fiber and carbohydrate values are stored as percentages on the selected basis; phosphorus can also be recorded as mg/100 kcal.</p>${renderDietList(diets)}</div></div>
  </div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">CURRENT EPISODE</span><h2>${escapeHtml(ep.title)} context</h2></div></div><div class="card-pad"><p>${episodeClinicalMeasurements().length} clinical result${episodeClinicalMeasurements().length===1?'':'s'} · ${episodeTreatments().length} treatment${episodeTreatments().length===1?'':'s'} · ${episodeStudies().length} stud${episodeStudies().length===1?'y':'ies'} attached · ${episodeDiets().length} food record${episodeDiets().length===1?'':'s'} overlapping the episode.</p></div></div>`;
}
function renderClinicalList(items){
  if(!items.length) return '<div class="empty compact">No clinical measurements saved for this pet.</div>';
  return `<div class="context-list">${items.map(m=>{const t=measurementTemplate(m.templateId),fid=clinicalFindingFor(m);const ref=(m.refLow||m.refHigh)?`Ref ${escapeHtml(m.refLow||'—')}–${escapeHtml(m.refHigh||'—')} ${escapeHtml(m.unit||'')}`:'';return `<div class="context-item"><div><strong>${escapeHtml(t?.label||m.label||'Measurement')}</strong><span class="context-value">${escapeHtml(m.value||'—')}${m.unit?` ${escapeHtml(m.unit)}`:''}</span><small>${fmtDateTime(m.time)} · ${escapeHtml(m.interpretation||'unspecified')}${ref?' · '+ref:''}${m.episodeId===state.settings.activeEpisodeId?' · current episode':''}</small>${m.notes?`<p>${escapeHtml(m.notes)}</p>`:''}</div><div class="context-actions">${fid&&m.useInModel?`<span class="chip accent">Model evidence · ${(clinicalEvidence([m])[0]?.weight||0).toFixed(2)}×</span>`:'<span class="chip">Context</span>'}<button class="mini" data-edit-clinical="${m.id}">Edit</button></div></div>`}).join('')}</div>`;
}
function petQuantitativeTrends(petId=state.settings.activePetId){
  const by=new Map();
  for(const m of petClinicalMeasurements(petId)){
    const t=measurementTemplate(m.templateId);if(t?.kind!=='numeric')continue;const v=parseFloat(m.value);if(!Number.isFinite(v))continue;
    const key=`${m.templateId}|${trendUnitKey(m.unit)}`;if(!by.has(key))by.set(key,[]);by.get(key).push(m);
  }
  return [...by.entries()].map(([key,records])=>{const templateId=records[0]?.templateId;return {key,templateId,template:measurementTemplate(templateId),unit:records[0]?.unit||'',records,trend:linearTrend(records)}}).filter(x=>x.trend&&x.trend.count>=2).sort((a,b)=>b.trend.spanDays-a.trend.spanDays);
}
function sparklineSvg(records){
  const pts=records.map(r=>({t:new Date(r.time).getTime(),v:parseFloat(r.value)})).filter(x=>Number.isFinite(x.t)&&Number.isFinite(x.v)).sort((a,b)=>a.t-b.t);if(pts.length<2)return '';
  const minT=pts[0].t,maxT=pts.at(-1).t,minV=Math.min(...pts.map(x=>x.v)),maxV=Math.max(...pts.map(x=>x.v)),dx=Math.max(1,maxT-minT),dy=Math.max(1e-9,maxV-minV);
  const p=pts.map(x=>`${(4+(x.t-minT)/dx*92).toFixed(1)},${(28-(x.v-minV)/dy*22).toFixed(1)}`).join(' ');
  return `<svg class="mini-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points="${p}"></polyline></svg>`;
}
function renderTrendList(items){
  if(!items.length)return '<div class="empty compact">Add repeated numeric measurements to build longitudinal trends.</div>';
  return `<div class="trend-grid">${items.map(x=>{const tr=x.trend,t=x.template,dir=tr.slope>0?'↑ increasing':tr.slope<0?'↓ decreasing':'→ stable',mapped=t.trendMap?.[tr.slope>0?'increasing':'decreasing'];return `<div class="trend-card"><div><strong>${escapeHtml(t.label)}</strong><small>${tr.count} measurements · ${tr.spanDays.toFixed(tr.spanDays<10?1:0)} d${x.unit?` · ${escapeHtml(x.unit)}`:''}</small></div>${sparklineSvg(x.records)}<div class="trend-facts"><span>${escapeHtml(dir)}</span><span>${(tr.relativeChange*100).toFixed(1)}% net</span><span>R² ${tr.r2.toFixed(2)}</span></div>${mapped?`<small class="helper">A sufficiently strong episode-local trend can derive “${escapeHtml(finding(mapped)?.label||mapped)}” evidence; correlated evidence is discounted rather than double-counted.</small>`:''}</div>`}).join('')}</div>`;
}
function renderTreatmentList(items){if(!items.length)return '<div class="empty compact">No medications or treatments saved for this pet.</div>';return `<div class="context-list">${items.map(t=>`<div class="context-item"><div><strong>${escapeHtml(t.name||'Treatment')}</strong><small>${escapeHtml(t.type||'treatment')} · ${t.start?fmtDateTime(t.start):'start unknown'}${t.end?' → '+fmtDateTime(t.end):' → ongoing'}${t.episodeId===state.settings.activeEpisodeId?' · current episode':''}</small><div class="nutrient-chips">${t.dose?`<span class="chip">${escapeHtml(t.dose)}</span>`:''}${t.route?`<span class="chip">${escapeHtml(t.route)}</span>`:''}${t.frequency?`<span class="chip">${escapeHtml(t.frequency)}</span>`:''}${t.response&&t.response!=='unknown'?`<span class="chip">Response: ${escapeHtml(t.response.replace('_',' '))}</span>`:''}</div>${t.notes?`<p>${escapeHtml(t.notes)}</p>`:''}</div><div class="context-actions"><span class="chip">Context only</span><button class="mini" data-edit-treatment="${t.id}">Edit</button></div></div>`).join('')}</div>`;}
function renderStudyList(items){if(!items.length)return '<div class="empty compact">No diagnostic studies saved for this pet.</div>';return `<div class="context-list">${items.map(x=>`<div class="context-item"><div><strong>${escapeHtml(x.type||'Diagnostic study')}${x.bodySite?' · '+escapeHtml(x.bodySite):''}</strong><small>${x.time?fmtDateTime(x.time):'date unknown'} · ${escapeHtml(x.interpretation||'unspecified')}${x.source?' · '+escapeHtml(x.source):''}${x.episodeId===state.settings.activeEpisodeId?' · current episode':''}</small>${x.summary?`<p>${escapeHtml(x.summary)}</p>`:''}${x.notes?`<p class="helper">${escapeHtml(x.notes)}</p>`:''}</div><div class="context-actions"><span class="chip">Context only</span><button class="mini" data-edit-study="${x.id}">Edit</button></div></div>`).join('')}</div>`;}
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

function outcomeLabel(o){ return hypothesis(o.conditionId)?.label || o.customLabel || 'Reference outcome'; }
function outcomeVisibleInReplay(o,ep=activeEpisode()){
  const cutoff=episodeAnalysisCutoff(ep); if(!cutoff||!o?.hiddenDuringReplay)return true;
  if(!o.date)return false; return o.date<=cutoff.slice(0,10);
}
function visibleEpisodeOutcomes(ep=activeEpisode()){ return episodeOutcomes(ep?.id).filter(o=>outcomeVisibleInReplay(o,ep)); }
function outcomeRank(o,model=infer()){ if(!o?.conditionId)return null; const i=model.findIndex(h=>h.id===o.conditionId); return i>=0?i+1:null; }
function renderOutcomeEvaluation(ep=activeEpisode(),model=infer()){
  const all=episodeOutcomes(ep?.id); if(!all.length)return '';
  const visible=all.filter(o=>outcomeVisibleInReplay(o,ep)), hidden=all.length-visible.length;
  return `<div class="card section-gap"><div class="card-head"><div><span class="eyebrow">REFERENCE OUTCOME / VALIDATION</span><h2>${visible.length?`${visible.length} outcome${visible.length===1?'':'s'} available for comparison`:`${hidden} outcome${hidden===1?' is':'s are'} blinded at this replay point`}</h2></div><span class="chip">Non-inferential</span></div><div class="card-pad"><p>Reference outcomes are stored separately from diagnoses used as prior context. They never change condition scores and exist only to evaluate retrospective cases without training the model on the answer.</p>${hidden?`<div class="notice"><strong>Blinded replay:</strong> ${hidden} reference outcome${hidden===1?' is':'s are'} hidden until its recorded date or until replay is disabled.</div>`:''}${visible.length?`<div class="context-list section-gap">${visible.map(o=>{const rank=outcomeRank(o,model);return `<div class="context-item"><div><strong>${escapeHtml(outcomeLabel(o))}</strong><small>${escapeHtml(o.certainty||'reference')} · ${escapeHtml(o.source||'source not set')}${o.date?' · '+escapeHtml(o.date):''}</small>${o.notes?`<p>${escapeHtml(o.notes)}</p>`:''}</div><div class="context-actions">${rank?`<span class="chip accent">Current rank #${rank}</span>`:'<span class="chip">Custom / unranked</span>'}</div></div>`}).join('')}</div>`:''}<div class="button-row section-gap"><button class="ghost" data-viewgo="history">Manage reference outcomes</button></div></div></div>`;
}
function diagnosisStatusLabel(status){
  return ({confirmed_active:'Confirmed · active',probable_active:'Probable · active',suspected_active:'Suspected · active',confirmed_resolved:'Confirmed · resolved/historical',ruled_out:'Ruled out'})[status]||status;
}
function diagnosisLabel(d){ return hypothesis(d.conditionId)?.label || d.customLabel || 'Custom diagnosis'; }
function episodeEvidenceBounds(ep=activeEpisode()){
  if(!ep) return null;
  const times=[...episodeObservations(ep.id).map(o=>o.time),...episodeClinicalMeasurements(ep.id).map(m=>m.time),...episodeStudies(ep.id).map(x=>x.time),...episodeTreatments(ep.id).flatMap(t=>[t.start,t.end].filter(Boolean))].map(x=>new Date(x).getTime()).filter(Number.isFinite);
  if(!times.length) return null;
  return {first:new Date(Math.min(...times)).toISOString(),last:new Date(Math.max(...times)).toISOString()};
}
function renderHistoryPage(){
  const pet=activePet(), ep=activeEpisode(), dx=petDiagnoses(), outcomes=episodeOutcomes(), prior=petEpisodes().filter(e=>e.id!==ep.id), linked=new Set(ep.linkedEpisodeIds||[]), bounds=episodeEvidenceBounds(ep);
  const analysisStart=episodeAnalysisStart(ep), age=ageYearsAt(analysisStart,pet);
  return `<div class="notice"><strong>History is explicit, not automatic.</strong> Episodes remain analytically separate unless you link them. Confirmed or suspected diagnoses can be retained as patient history and optionally used as prior context. Linked episode evidence is down-weighted and shown separately in the model audit.</div>
  <div class="grid two section-gap history-grid">
    <div class="card"><div class="card-head"><div><span class="eyebrow">PRIOR DIAGNOSES</span><h2>${escapeHtml(pet.name)}'s diagnosis history</h2></div><button class="primary" data-add-diagnosis>＋ Add diagnosis</button></div><div class="card-pad">${dx.length?`<div class="context-list">${dx.map(d=>`<div class="context-item"><div><strong>${escapeHtml(diagnosisLabel(d))}</strong><small>${escapeHtml(diagnosisStatusLabel(d.status))}${d.date?' · '+escapeHtml(d.date):''}${d.source?' · '+escapeHtml(d.source):''}${d.stage?' · '+escapeHtml(d.stage):''}</small>${d.notes?`<p>${escapeHtml(d.notes)}</p>`:''}</div><div class="context-actions">${d.useInModel&&d.conditionId?'<span class="chip accent">Prior context</span>':'<span class="chip">Record only</span>'}<button class="mini" data-edit-diagnosis="${d.id}">Edit</button></div></div>`).join('')}</div>`:'<div class="empty compact">No prior diagnoses saved for this pet.</div>'}</div></div>
    <div class="card"><div class="card-head"><div><span class="eyebrow">CURRENT EPISODE</span><h2>Episode definition</h2></div><button class="secondary" data-edit-episode>Edit episode</button></div><div class="card-pad"><p><strong>${escapeHtml(ep.title)}</strong></p><div class="history-facts"><div><span>Episode start</span><strong>${fmtDateTime(ep.start)}</strong></div><div><span>Status</span><strong>${escapeHtml(ep.status)}</strong></div><div><span>Tracking mode</span><strong>${ep.trackingMode==='retrospective'?'Retrospective':'Live'}</strong></div><div><span>Monitoring cadence</span><strong>${escapeHtml(ep.monitoringCadence||'standard')}</strong></div><div><span>New-entry dates</span><strong>${escapeHtml(entryDateModeLabel(ep))}</strong></div><div><span>Age at analysis start</span><strong>${age==null?'—':age.toFixed(1)+' y'}</strong></div><div><span>Linked prior episodes</span><strong>${linked.size}</strong></div></div>${bounds?`<div class="notice ${new Date(ep.start)>new Date(bounds.first)?'warning':''} section-gap"><strong>Evidence range:</strong> ${fmtDateTime(bounds.first)} → ${fmtDateTime(bounds.last)}.${new Date(ep.start)>new Date(bounds.first)?' The episode starts after its earliest evidence.':''}</div><div class="button-row"><button class="ghost" data-align-episode>Align episode start to earliest evidence</button></div>`:''}</div></div>
  </div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">LINKED HISTORY</span><h2>Select prior episodes for this analysis</h2></div><span class="chip">${linked.size} linked</span></div><div class="card-pad"><p>Linked episodes remain separate records. Their derived evidence enters the current model at a reduced historical weight; raw rows are never merged into this episode.</p>${prior.length?`<div class="link-episode-list">${prior.map(e=>`<label class="link-episode-row"><input type="checkbox" data-link-episode="${e.id}" ${linked.has(e.id)?'checked':''}><span><strong>${escapeHtml(e.title)}</strong><small>${fmtDate(e.start)}${e.end?' → '+fmtDate(e.end):' · open'} · ${episodeObservations(e.id).length} observations · ${episodeClinicalMeasurements(e.id).length} clinical results</small></span></label>`).join('')}</div>`:'<div class="empty compact">No other episodes are available to link.</div>'}</div></div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">REFERENCE OUTCOMES</span><h2>Episode validation labels</h2></div><button class="primary" data-add-outcome>＋ Add reference outcome</button></div><div class="card-pad"><p>Use this for a known final diagnosis or other reference outcome when evaluating a historical case. These records are <strong>never</strong> used as Bayesian evidence or priors.</p>${outcomes.length?`<div class="context-list">${outcomes.map(o=>`<div class="context-item"><div><strong>${escapeHtml(outcomeLabel(o))}</strong><small>${escapeHtml(o.certainty||'reference')} · ${escapeHtml(o.source||'source not set')}${o.date?' · '+escapeHtml(o.date):''}${o.hiddenDuringReplay?' · blinded during earlier replay':''}</small>${o.notes?`<p>${escapeHtml(o.notes)}</p>`:''}</div><div class="context-actions"><span class="chip">Validation only</span><button class="mini" data-edit-outcome="${o.id}">Edit</button></div></div>`).join('')}</div>`:'<div class="empty compact">No reference outcome saved for this episode.</div>'}</div></div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">LONGITUDINAL RECORD</span><h2>Patient data inventory</h2></div></div><div class="card-pad context-summary"><div><strong>${petEpisodes().length}</strong><span>episodes</span></div><div><strong>${state.observations.filter(o=>petEpisodes().some(e=>e.id===o.episodeId)).length}</strong><span>raw observations</span></div><div><strong>${petClinicalMeasurements().length}</strong><span>clinical results</span></div><div><strong>${petDiets().length}</strong><span>diet records</span></div><div><strong>${petTreatments().length}</strong><span>treatments</span></div><div><strong>${petStudies().length}</strong><span>diagnostic studies</span></div><div><strong>${dx.length}</strong><span>diagnoses</span></div><div><strong>${petOutcomes().length}</strong><span>reference outcomes</span></div></div></div>`;
}
function renderModelPage(){
  const evidence=[...modelEvidence()].reverse(); const model=infer(); const top=model[0]; const families=familyScores(model); const ep=activeEpisode();
  const byFamily=new Map(); model.forEach(h=>{const fam=h.family||'Other'; if(!byFamily.has(fam)) byFamily.set(fam,[]); byFamily.get(fam).push(h);});
  const familySections=families.map(f=>`<details class="model-family"><summary><strong>${escapeHtml(f.label)}</strong><span>${(f.score*100).toFixed(1)}% family aggregate</span></summary><div class="score-list">${renderScores(byFamily.get(f.label)||[])}</div></details>`).join('');
  const priorNotes=[...(top.demographic?.reasons||[]),...(top.diagnosis?.reasons||[])];
  const currentEvidence=evidence.filter(e=>e.sourceScope!=='linked'), historicalEvidence=evidence.filter(e=>e.sourceScope==='linked');
  const scope=analysisScopeSummary(ep), evidenceTimes=episodeEvidenceTimes(ep);
  return `<div class="notice warning"><strong>Experimental longitudinal model.</strong> Scores are relative pattern-consistency values from a non-validated knowledge pack. They are not disease probabilities, diagnoses, or rule-outs.</div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">CASE REPLAY / EVIDENCE SCOPE</span><h2>${scope.mode==='as_of'?`Analyzing as of ${fmtDateTime(scope.cutoff)}`:'Using all episode evidence'}</h2></div><span class="chip ${scope.mode==='as_of'?'accent':''}">${scope.counts.included}/${scope.counts.total} dated records included</span></div><div class="card-pad"><p>Replay mode prevents later records from leaking into a retrospective analysis. Raw data is never deleted; records after the cutoff are simply excluded from inference, monitoring, urgency state, information-gain prompts, and dated diagnosis priors until the cutoff advances.</p><div class="button-row"><button class="${scope.mode==='as_of'?'ghost':'primary'}" data-analysis-mode="all_evidence">Use all evidence</button><button class="${scope.mode==='as_of'?'primary':'ghost'}" data-analysis-mode="as_of">Replay / as-of</button>${scope.mode==='as_of'?`<button class="ghost" data-replay-step="first">First evidence</button><button class="ghost" data-replay-step="prev">Previous</button><button class="ghost" data-replay-step="next">Next</button><button class="ghost" data-replay-step="latest">Latest evidence</button>`:''}</div>${scope.mode==='as_of'?`<div class="field section-gap"><label>Analysis cutoff</label><input type="datetime-local" data-analysis-cutoff value="${toInputDate(scope.cutoff)}"><span class="helper">${scope.counts.excluded} dated record${scope.counts.excluded===1?' is':'s are'} currently hidden from analysis. ${evidenceTimes.length} distinct evidence timestamp${evidenceTimes.length===1?'':'s'} available.</span></div>`:''}</div></div>
  ${renderReplayTrajectory(ep)}
  ${renderOutcomeEvaluation(ep,model)}
  <div class="grid two section-gap"><div class="card"><div class="card-head"><div><span class="eyebrow">TOP CONDITION MATCHES</span><h2>Current differential pattern</h2></div></div><div class="score-list">${renderScores(model.slice(0,15))}</div></div>
  <div class="card"><div class="card-head"><div><span class="eyebrow">SYSTEM-LEVEL VIEW</span><h2>Condition-family aggregates</h2></div></div><div class="score-list">${renderFamilyScores(families)}</div></div></div>
  ${evidence.length?`<div class="card section-gap"><div class="card-head"><div><span class="eyebrow">TOP CURRENT MATCH</span><h2>${escapeHtml(top.label)}</h2><small>${escapeHtml(top.family||'')}</small></div><span class="chip accent">${(top.score*100).toFixed(1)}%</span></div><div class="card-pad"><p>${escapeHtml(top.description)}</p>${priorNotes.length?`<div class="notice"><strong>Prior/context adjustments for this condition:</strong> ${escapeHtml(priorNotes.join(' · '))}</div>`:''}<div class="divider"></div><h3>Derived evidence contribution</h3><p class="helper">Raw observations are retained in the timeline. Repeated observations are summarized into persistence/recurrence evidence before inference, avoiding naïve duplicate multiplication.</p></div><div class="evidence-list">${evidence.map(e=>{const imp=evidenceImpact(e,top.id);return `<div class="evidence-item"><div><strong>${escapeHtml(evidenceLabel(e))}</strong><small>${fmtDateTime(e.time)} · ${e.evidenceType.replaceAll('_',' ')} · effective weight ${effectiveEvidenceWeight(e).toFixed(2)}×${e.evidenceGroup&&e.dependencyFactor<1?` · correlated ${escapeHtml(e.evidenceGroup)} ×${e.dependencyFactor.toFixed(2)}`:''}${e.summary?' · '+escapeHtml(e.summary):''}</small></div><div class="impact ${imp>=0?'up':'down'}">${imp>=0?'▲':'▼'} ${Math.abs(imp*100).toFixed(1)} pt</div></div>`}).join('')}</div></div>`:`<div class="notice section-gap"><strong>No observations yet.</strong> The condition scores below are only baseline model weights until evidence is logged.</div>`}
  <div class="grid two section-gap"><div class="card"><div class="card-head"><div><span class="eyebrow">CURRENT EPISODE EVIDENCE</span><h2>${currentEvidence.length} derived evidence item${currentEvidence.length===1?'':'s'}</h2></div></div><div class="card-pad"><p>${analysisEpisodeObservations().length} in-scope owner observations and ${analysisEpisodeClinicalMeasurements().length} in-scope clinical result${analysisEpisodeClinicalMeasurements().length===1?'':'s'} are summarized for ${escapeHtml(ep.title)}.</p></div></div><div class="card"><div class="card-head"><div><span class="eyebrow">LINKED HISTORY</span><h2>${historicalEvidence.length} historical evidence item${historicalEvidence.length===1?'':'s'}</h2></div></div><div class="card-pad"><p>${linkedEpisodes().length} prior episode${linkedEpisodes().length===1?' is':'s are'} explicitly linked. Historical evidence is down-weighted rather than merged with the current episode.</p><button class="ghost" data-viewgo="history">Manage linked history</button></div></div></div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">CONDITION LIBRARY</span><h2>Browse all ${knowledge.hypotheses.length} hypotheses</h2></div><span class="chip">${knowledge.coverage?.namedConditionCount||knowledge.hypotheses.length} named</span></div><div class="card-pad"><p>${escapeHtml(knowledge.coverage?.scope||'')}</p>${familySections}</div></div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">TRANSPARENCY</span><h2>Inference architecture</h2></div></div><div class="card-pad"><p><strong>Raw records → temporal/quantitative summaries → correlation-aware evidence → clinical/history context → Bayesian pattern scores.</strong> Repeated observations contribute persistence or recurrence information rather than being treated as independent duplicate tests.</p><p>A separate longitudinal monitoring engine decides what may be worth reassessing and when. Monitoring cadence never changes hypothesis likelihoods; it only prioritizes data collection and preserves the distinction between new information and follow-up of an existing finding.</p><p>Evidence known to share physiology can be assigned to a correlation group. The strongest item keeps full weight while additional correlated items are progressively discounted; all source records remain visible.</p><p>Numeric clinical results retain their actual value. When a lab reference interval or a source-backed measurement anchor is available, the degree of abnormality modestly changes evidence strength. A single result is never silently converted into a diagnosis.</p><p>Known diagnoses and demographics adjust priors transparently. Previous episodes affect the current analysis only when explicitly linked.</p><p>${escapeHtml(knowledge.coverage?.priorPolicy||'')}</p><p>The explicit <strong>Other / unmodeled condition</strong> hypothesis reserves model mass for conditions outside this library.</p><button class="ghost" data-viewgo="settings">View coverage & provenance</button></div></div>`;
}
function renderReportsPage(){
  const opts=state.settings;
  return `<div class="card no-print"><div class="card-head"><div><span class="eyebrow">REPORT OPTIONS</span><h2>Vet-friendly episode report</h2></div></div><div class="card-pad"><div class="report-options"><label class="checkbox"><input type="checkbox" data-report-opt="reportModel" ${opts.reportModel?'checked':''}> Include Bayesian model</label><label class="checkbox"><input type="checkbox" data-report-opt="reportUrgency" ${opts.reportUrgency?'checked':''}> Include urgency-rule history</label><label class="checkbox"><input type="checkbox" data-report-opt="reportNotes" ${opts.reportNotes?'checked':''}> Include observation notes</label><label class="checkbox"><input type="checkbox" data-report-opt="reportClinical" ${opts.reportClinical?'checked':''}> Include clinical measurements</label><label class="checkbox"><input type="checkbox" data-report-opt="reportDiet" ${opts.reportDiet?'checked':''}> Include diet context</label><label class="checkbox"><input type="checkbox" data-report-opt="reportHistory" ${opts.reportHistory?'checked':''}> Include diagnoses & linked history</label><label class="checkbox"><input type="checkbox" data-report-opt="reportTreatments" ${opts.reportTreatments?'checked':''}> Include treatments</label><label class="checkbox"><input type="checkbox" data-report-opt="reportStudies" ${opts.reportStudies?'checked':''}> Include diagnostic studies</label><label class="checkbox"><input type="checkbox" data-report-opt="reportMonitoring" ${opts.reportMonitoring?'checked':''}> Include derived monitoring summary</label></div><div class="report-actions"><button class="primary" data-print>Print / Save PDF</button></div></div></div><div class="section-gap print-target">${reportHtml()}</div>`;
}
function reportHtml(){
  const ep=activeEpisode(),pet=activePet(),scope=analysisScopeSummary(ep),obs=analysisEpisodeObservations(),clinical=analysisEpisodeClinicalMeasurements(),diets=episodeDiets(),treatments=analysisEpisodeTreatments(),studies=analysisEpisodeStudies(),model=infer(),alerts=urgencyAlerts(),dx=petDiagnoses().filter(d=>!scope.cutoff||(diagnosisEffectiveDate(d)&&diagnosisEffectiveDate(d)<=scope.cutoff.slice(0,10))),linked=linkedEpisodes(),outcomes=visibleEpisodeOutcomes(ep),monitoring=monitoringSummary(ep),derivedOwner=deriveOwnerEvidence();
  return `<article class="report-paper"><h2>Bayesian Symptom Tracker — Episode Report</h2><p class="report-muted">Generated ${fmtDateTime(new Date().toISOString())} · App v${APP_VERSION} · Knowledge pack ${escapeHtml(knowledge.packId)}</p>${scope.mode==='as_of'?`<p><strong>Retrospective replay scope:</strong> this report reflects evidence available through ${fmtDateTime(scope.cutoff)}. Later dated episode records remain stored but are excluded from this report's analysis sections.</p>`:''}<table><tr><th>Patient</th><td>${escapeHtml(pet.name)}</td><th>Species</th><td>Cat</td></tr><tr><th>Sex</th><td>${escapeHtml(pet.sex)}</td><th>Weight</th><td>${escapeHtml(pet.weight||'—')}</td></tr><tr><th>Episode</th><td>${escapeHtml(ep.title)}</td><th>Started</th><td>${fmtDateTime(ep.start)}</td></tr><tr><th>Tracking mode</th><td>${ep.trackingMode==='retrospective'?'Retrospective reconstruction':'Live monitoring'}</td><th>Monitoring cadence</th><td>${escapeHtml(ep.monitoringCadence||'standard')}</td></tr></table>
  <h3>Observation timeline</h3><table><thead><tr><th>Time</th><th>Finding</th><th>Intensity</th><th>Confidence</th>${state.settings.reportNotes?'<th>Notes</th>':''}</tr></thead><tbody>${obs.map(o=>`<tr><td>${fmtDateTime(o.time)}</td><td>${(o.status==='resolved'?'Resolved: ':o.present===false?'Not observed: ':'')}${escapeHtml(finding(o.findingId)?.label||o.findingId)}</td><td>${escapeHtml(o.severity||'medium')}</td><td>${escapeHtml(o.confidence||'high')}</td>${state.settings.reportNotes?`<td>${escapeHtml(o.notes||'')}</td>`:''}</tr>`).join('')||'<tr><td colspan="5">No observations</td></tr>'}</tbody></table>
  ${state.settings.reportMonitoring?`<h3>Derived longitudinal monitoring summary</h3><p class="report-muted">Tracking mode: ${ep.trackingMode==='retrospective'?'retrospective reconstruction':'live monitoring'} · monitoring reference ${fmtDateTime(monitoring.referenceTime)}. Reassessment cadence is a data-quality heuristic, not a veterinary follow-up interval.</p><table><thead><tr><th>Finding</th><th>Derived summary</th><th>Last evidence</th><th>Reassessment</th></tr></thead><tbody>${derivedOwner.map(e=>{const q=monitoring.queue.find(x=>x.finding.id===e.findingId);return `<tr><td>${escapeHtml(evidenceLabel(e))}</td><td>${escapeHtml(e.summary||'')}</td><td>${fmtDateTime(e.time)}</td><td>${q?(q.due?'due':'upcoming'):'not queued'}</td></tr>`}).join('')||'<tr><td colspan="4">No derived owner evidence</td></tr>'}</tbody></table>`:''}
  ${state.settings.reportClinical?`<h3>Clinical measurements / test results</h3><table><thead><tr><th>Time</th><th>Test</th><th>Result</th><th>Reference</th><th>Interpretation</th><th>Model</th></tr></thead><tbody>${clinical.map(m=>{const t=measurementTemplate(m.templateId);return `<tr><td>${fmtDateTime(m.time)}</td><td>${escapeHtml(t?.label||m.label||m.templateId)}</td><td>${escapeHtml(m.value||'—')} ${escapeHtml(m.unit||'')}</td><td>${escapeHtml(m.refLow||'—')}–${escapeHtml(m.refHigh||'—')} ${escapeHtml(m.unit||'')}</td><td>${escapeHtml(m.interpretation||'unspecified')}</td><td>${clinicalFindingFor(m)&&m.useInModel?'mapped evidence':'context only'}</td></tr>`}).join('')||'<tr><td colspan="6">No clinical measurements attached to this episode</td></tr>'}</tbody></table>`:''}
  ${state.settings.reportDiet?`<h3>Diet context overlapping episode</h3><table><thead><tr><th>Food</th><th>Form</th><th>Dates</th><th>Protein</th><th>Fiber</th><th>Carbohydrate</th><th>Phosphorus</th></tr></thead><tbody>${diets.map(d=>`<tr><td>${escapeHtml([d.brand,d.product].filter(Boolean).join(' · ')||'Food record')}</td><td>${escapeHtml(d.form||'')}</td><td>${escapeHtml(d.startDate||'—')} → ${escapeHtml(d.endDate||'current')}</td><td>${escapeHtml(nutrientDisplay(d,'protein'))}</td><td>${escapeHtml(nutrientDisplay(d,'fiber'))}</td><td>${escapeHtml(nutrientDisplay(d,'carbs'))}</td><td>${escapeHtml(phosphorusDisplay(d))}</td></tr>`).join('')||'<tr><td colspan="7">No diet context overlaps this episode</td></tr>'}</tbody></table><p class="report-muted">Diet composition is reported as context and does not alter Bayesian scores in this release.</p>`:''}
  ${state.settings.reportTreatments?`<h3>Medications & treatments</h3><table><thead><tr><th>Treatment</th><th>Type</th><th>Dates</th><th>Dose / route / frequency</th><th>Response</th></tr></thead><tbody>${treatments.map(t=>`<tr><td>${escapeHtml(t.name||'Treatment')}</td><td>${escapeHtml(t.type||'')}</td><td>${t.start?fmtDateTime(t.start):'—'}${t.end?' → '+fmtDateTime(t.end):' → ongoing'}</td><td>${escapeHtml([t.dose,t.route,t.frequency].filter(Boolean).join(' · '))}</td><td>${escapeHtml((t.response||'unknown').replace('_',' '))}</td></tr>`).join('')||'<tr><td colspan="5">No treatments attached to this episode</td></tr>'}</tbody></table><p class="report-muted">Treatment records are context only in v0.8.0 and do not automatically change condition scores.</p>`:''}
  ${state.settings.reportStudies?`<h3>Diagnostic studies</h3><table><thead><tr><th>Time</th><th>Study</th><th>Interpretation</th><th>Summary</th></tr></thead><tbody>${studies.map(x=>`<tr><td>${x.time?fmtDateTime(x.time):'—'}</td><td>${escapeHtml(x.type||'Study')}${x.bodySite?' · '+escapeHtml(x.bodySite):''}</td><td>${escapeHtml(x.interpretation||'unspecified')}</td><td>${escapeHtml(x.summary||'')}</td></tr>`).join('')||'<tr><td colspan="4">No diagnostic studies attached to this episode</td></tr>'}</tbody></table><p class="report-muted">Narrative studies are retained with provenance but are not automatically converted into Bayesian evidence in v0.8.0.</p>`:''}
  ${state.settings.reportHistory?`<h3>Diagnosis & linked-history context</h3>${dx.length?`<table><thead><tr><th>Condition</th><th>Status</th><th>Date</th><th>Source</th><th>Prior context</th></tr></thead><tbody>${dx.map(d=>`<tr><td>${escapeHtml(diagnosisLabel(d))}</td><td>${escapeHtml(diagnosisStatusLabel(d.status))}</td><td>${escapeHtml(d.date||'—')}</td><td>${escapeHtml(d.source||'—')}</td><td>${d.useInModel?'enabled':'record only'}</td></tr>`).join('')}</tbody></table>`:'<p>No diagnoses recorded.</p>'}<p><strong>Linked prior episodes:</strong> ${linked.length?linked.map(e=>escapeHtml(e.title)+' ('+fmtDate(e.start)+')').join(', '):'None'}</p>${outcomes.length?`<p><strong>Reference outcome(s), validation only:</strong> ${outcomes.map(o=>escapeHtml(outcomeLabel(o))+(o.date?' ('+escapeHtml(o.date)+')':'')).join(', ')}</p>`:''}`:''}
  ${state.settings.reportUrgency?`<h3>Current deterministic urgency flags</h3>${alerts.length?`<ul>${alerts.map(a=>`<li><strong>${escapeHtml(a.title)}:</strong> ${escapeHtml(a.message)}</li>`).join('')}</ul>`:'<p>No active urgency rules at report generation time.</p>'}`:''}
  ${state.settings.reportModel?`<h3>Top relative condition-pattern scores</h3><table><thead><tr><th>Condition pattern</th><th>Family</th><th>Score</th></tr></thead><tbody>${model.slice(0,15).map(h=>`<tr><td>${escapeHtml(h.label)}</td><td>${escapeHtml(h.family||'')}</td><td>${(h.score*100).toFixed(1)}%</td></tr>`).join('')}</tbody></table><p><strong>Important:</strong> These normalized Bayesian scores are generated by a non-validated heuristic model and are not disease probabilities, diagnoses, or rule-outs. The library includes an Other / unmodeled condition reserve.</p>`:''}
  <p class="report-muted">This report is an owner-generated record intended to help communicate observations. It does not replace veterinary examination, diagnosis, or treatment.</p></article>`;
}
function renderSettingsPage(){
  const pet=activePet();
  return `<div class="grid two settings-grid"><div class="card"><div class="card-head"><div><span class="eyebrow">PETS</span><h2>${escapeHtml(pet.name)}'s profile</h2></div><button class="secondary" data-add-pet>＋ Add pet</button></div><div class="card-pad"><div class="pet-strip">${state.pets.map(p=>`<button class="pet-pill ${p.id===pet.id?'active':''}" data-pet="${p.id}">${escapeHtml(p.name)}</button>`).join('')}</div><form id="profileForm" class="section-gap"><div class="form-row"><div class="field"><label>Name</label><input name="name" value="${escapeHtml(pet.name)}" required></div><div class="field"><label>Sex</label><select name="sex"><option value="unknown" ${pet.sex==='unknown'?'selected':''}>Unknown / not set</option><option value="female" ${pet.sex==='female'?'selected':''}>Female</option><option value="male" ${pet.sex==='male'?'selected':''}>Male</option></select></div></div><div class="form-row three"><div class="field"><label>Birth date</label><input type="date" name="birthDate" value="${escapeHtml(pet.birthDate||'')}"></div><div class="field"><label>Breed</label><input name="breed" value="${escapeHtml(pet.breed||'')}" placeholder="optional"></div><div class="field"><label>Neuter status</label><select name="neuterStatus"><option value="unknown" ${pet.neuterStatus==='unknown'?'selected':''}>Unknown</option><option value="intact" ${pet.neuterStatus==='intact'?'selected':''}>Intact</option><option value="neutered" ${pet.neuterStatus==='neutered'?'selected':''}>Spayed / neutered</option></select></div></div><div class="form-row"><div class="field"><label>Current weight</label><input name="weight" placeholder="e.g., 10.4 lb" value="${escapeHtml(pet.weight||'')}"></div><div class="field"><label>Body condition score</label><input name="bodyConditionScore" placeholder="e.g., 5/9" value="${escapeHtml(pet.bodyConditionScore||'')}"></div></div><div class="form-row"><div class="field"><label>Veterinarian</label><input name="vetName" value="${escapeHtml(pet.vetName||'')}"></div><div class="field"><label>Vet phone</label><input name="vetPhone" value="${escapeHtml(pet.vetPhone||'')}"></div></div><div class="form-actions split-actions">${state.pets.length>1?'<button type="button" class="danger" data-remove-pet>Remove pet</button>':'<span></span>'}<button class="primary">Save profile</button></div></form></div></div>
  <div class="card"><div class="card-head"><div><span class="eyebrow">DATA</span><h2>Backup & portability</h2></div></div><div class="card-pad"><p>All pets, episodes, raw observations, diagnoses, reference outcomes, clinical measurements, quantitative series, treatments, diagnostic studies, diet records, and episode links are stored in IndexedDB in this browser. Export backups regularly.</p><div class="button-row"><button class="ghost" data-export>Export JSON</button><label class="button-like ghost-like" for="importFile">Import JSON</label><input type="file" id="importFile" accept="application/json" hidden><button class="secondary" data-demo>Load demo episode</button></div><div class="divider"></div><button class="danger" data-reset>Reset all local data</button></div></div></div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">KNOWLEDGE PACK</span><h2>${escapeHtml(knowledge.packId)}</h2></div><span class="chip">${escapeHtml(knowledge.modelStatus)}</span></div><div class="card-pad"><p>${escapeHtml(knowledge.modelNotice)}</p><h3>Coverage</h3><p><strong>${knowledge.coverage?.namedConditionCount||knowledge.hypotheses.length} named condition patterns</strong> + Other / unmodeled reserve · ${knowledge.coverage?.ownerFindingCount||knowledge.findings.filter(f=>f.sourceType!=='clinical').length} owner-observable findings · ${knowledge.coverage?.clinicalFindingCount||0} clinical evidence findings · ${knowledge.coverage?.measurementTemplateCount||0} structured measurement templates · ${knowledge.coverage?.familyCount||new Set(knowledge.hypotheses.map(h=>h.family)).size} families.</p><p>${escapeHtml(knowledge.coverage?.scope||'')}</p><p>${escapeHtml(knowledge.coverage?.inferenceArchitecture||'')}</p><p class="helper">${escapeHtml(knowledge.coverage?.priorPolicy||'')}</p><h3>Knowledge & urgency provenance</h3><ul class="source-list">${knowledge.sources.map(s=>`<li><a href="${s.url}" target="_blank" rel="noreferrer">${escapeHtml(s.name)}</a> — ${escapeHtml(s.role)}</li>`).join('')}</ul><p class="helper">The cited veterinary references support representative condition/sign relationships, risk context, clinical interpretation anchors, and emergency red flags. They do <strong>not</strong> validate the numerical Bayesian weights as calibrated diagnostic probabilities.</p></div></div>`;
}
function bindLogForm(form){
  if(!form) return;
  bindDateEntryHelpers(form);
  form.addEventListener('submit',async e=>{
    e.preventDefault(); const fd=new FormData(form); const status=String(fd.get('status')||'present'); const data={findingId:fd.get('findingId'),status,present:status==='present',time:new Date(fd.get('time')).toISOString(),severity:fd.get('severity'),confidence:fd.get('confidence')||'high',notes:fd.get('notes').trim()};
    if(editingObservationId){ const o=state.observations.find(x=>x.id===editingObservationId); Object.assign(o,data); }
    else state.observations.push({id:uid(),episodeId:state.settings.activeEpisodeId,...data});
    maybeAdvanceReplayCutoff(data.time);
    await save(); editingObservationId=null; closeModal(); toast('Observation saved'); setView(currentView==='log'?'dashboard':currentView);
  });
}
async function recordQuickObservation(fid,status,notes='Logged from monitoring / information prompt.'){
  const ep=activeEpisode();
  if(ep?.trackingMode==='retrospective'){
    openObservationModal(null,fid,status,episodeEntryDefaultTime(ep));
    return;
  }
  const present=status==='present';
  state.observations.push({id:uid(),episodeId:state.settings.activeEpisodeId,findingId:fid,status,present,time:new Date().toISOString(),severity:'medium',confidence:'high',notes});
  await save(); toast('Observation added'); render();
}

function bindRenderedActions(){
  $$('[data-viewgo]').forEach(b=>b.onclick=()=>setView(b.dataset.viewgo));
  $$('[data-analysis-mode]').forEach(b=>b.onclick=()=>setAnalysisMode(b.dataset.analysisMode));
  $$('[data-replay-step]').forEach(b=>b.onclick=()=>stepAnalysisCutoff(b.dataset.replayStep));
  $$('[data-analysis-cutoff]').forEach(i=>i.onchange=()=>setAnalysisCutoff(i.value));
  $$('[data-edit-obs]').forEach(b=>b.onclick=()=>openObservationModal(b.dataset.editObs));
  $$('[data-edit-clinical]').forEach(b=>b.onclick=()=>openClinicalModal(b.dataset.editClinical));
  $$('[data-edit-diet]').forEach(b=>b.onclick=()=>openDietModal(b.dataset.editDiet));
  $$('[data-edit-treatment]').forEach(b=>b.onclick=()=>openTreatmentModal(b.dataset.editTreatment));
  $$('[data-edit-study]').forEach(b=>b.onclick=()=>openStudyModal(b.dataset.editStudy));
  $$('[data-add-clinical]').forEach(b=>b.onclick=()=>openClinicalModal());
  $$('[data-add-diet]').forEach(b=>b.onclick=()=>openDietModal());
  $$('[data-add-treatment]').forEach(b=>b.onclick=()=>openTreatmentModal());
  $$('[data-add-study]').forEach(b=>b.onclick=()=>openStudyModal());
  $$('[data-log-finding]').forEach(b=>b.onclick=()=>openObservationModal(null,b.dataset.logFinding));
  $$('[data-quick-answer]').forEach(b=>b.onclick=()=>recordQuickObservation(b.dataset.finding,b.dataset.quickAnswer==='yes'?'present':'checked_absent','Logged from new-information prompt.'));
  $$('[data-monitor-status]').forEach(b=>b.onclick=()=>recordQuickObservation(b.dataset.finding,b.dataset.monitorStatus,'Logged from longitudinal reassessment queue.'));
  $$('[data-episode]').forEach(b=>b.onclick=async()=>{const ep=state.episodes.find(e=>e.id===b.dataset.episode && e.petId===state.settings.activePetId);if(!ep)return;state.settings.activeEpisodeId=ep.id;await save();render();updateContextButtons();});
  $$('[data-pet]').forEach(b=>b.onclick=()=>switchPet(b.dataset.pet));
  $$('[data-new-episode]').forEach(b=>b.onclick=openEpisodeModal);
  $$('[data-edit-episode]').forEach(b=>b.onclick=()=>openEpisodeEditModal());
  $$('[data-align-episode]').forEach(b=>b.onclick=alignEpisodeToEvidence);
  $$('[data-link-episode]').forEach(c=>c.onchange=async()=>{const ep=activeEpisode();const ids=new Set(ep.linkedEpisodeIds||[]);if(c.checked)ids.add(c.dataset.linkEpisode);else ids.delete(c.dataset.linkEpisode);ep.linkedEpisodeIds=[...ids];await save();toast('Linked history updated');render();});
  $$('[data-add-diagnosis]').forEach(b=>b.onclick=()=>openDiagnosisModal());
  $$('[data-edit-diagnosis]').forEach(b=>b.onclick=()=>openDiagnosisModal(b.dataset.editDiagnosis));
  $$('[data-add-outcome]').forEach(b=>b.onclick=()=>openOutcomeModal());
  $$('[data-edit-outcome]').forEach(b=>b.onclick=()=>openOutcomeModal(b.dataset.editOutcome));
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
function openObservationModal(id=null,presetFinding=null,presetStatus=null,presetTime=null){
  editingObservationId=id; const existing=id?state.observations.find(o=>o.id===id):null;
  const obs=existing || ((presetFinding||presetStatus||presetTime)?{findingId:presetFinding||knowledge.findings.find(f=>f.sourceType!=='clinical')?.id,status:presetStatus||'present',present:(presetStatus||'present')==='present',time:presetTime||new Date().toISOString(),severity:'medium',confidence:'high',notes:''}:null);
  $('#modalEyebrow').textContent=existing?'EDIT OBSERVATION':'OBSERVATION'; $('#modalTitle').textContent=existing?'Edit observation':`Log observation for ${activePet().name}`;
  $('#modalBody').innerHTML=logFormHtml(obs,'modalObservationForm');
  if(presetFinding) $('#modalObservationForm [name=findingId]').value=presetFinding;
  if(presetStatus) $('#modalObservationForm [name=status]').value=presetStatus;
  $('#modalBackdrop').classList.remove('hidden'); bindLogForm($('#modalObservationForm'));
  $$('[data-delete-obs]',$('#modalBody')).forEach(b=>b.onclick=()=>deleteObservation(b.dataset.deleteObs));
}
function closeModal(){ $('#modalBackdrop').classList.add('hidden'); editingObservationId=null; editingClinicalId=null; editingDietId=null; editingDiagnosisId=null; editingTreatmentId=null; editingStudyId=null; editingOutcomeId=null; }
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
  <div class="form-row three clinical-value-row"><div class="field"><label>Date & time</label><input type="datetime-local" name="time" value="${toInputDate(m?.time||episodeEntryDefaultTime())}" required>${dateEntryHelperHtml('time')}</div><div class="field"><label>Result / value</label><input name="value" value="${escapeHtml(m?.value||'')}" placeholder="e.g. 242 / positive" required></div><div class="field"><label>Unit</label><input name="unit" value="${escapeHtml(m?.unit||measurementTemplate(selected)?.unit||'')}" placeholder="optional"></div></div>
  <div class="form-row three clinical-reference-row"><div class="field"><label>Lab reference low</label><input name="refLow" inputmode="decimal" value="${escapeHtml(m?.refLow||'')}" placeholder="optional"></div><div class="field"><label>Lab reference high</label><input name="refHigh" inputmode="decimal" value="${escapeHtml(m?.refHigh||'')}" placeholder="optional"></div><div class="field"><label>Interpretation</label><select name="interpretation"><option value="auto" ${!m?'selected':''}>Auto (result/reference)</option>${['unspecified','low','normal','high','negative','trace','positive'].map(x=>`<option value="${x}" ${m?.interpretation===x?'selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select></div></div>
  <div class="form-row"><div class="field"><label>Source</label><select name="source"><option value="vet_lab" ${m?.source==='vet_lab'||!m?'selected':''}>Veterinarian / laboratory</option><option value="home" ${m?.source==='home'?'selected':''}>Home measurement</option><option value="other" ${m?.source==='other'?'selected':''}>Other</option></select></div><div class="field"><label>Confidence</label><select name="confidence"><option value="high" ${!m||m?.confidence==='high'?'selected':''}>High</option><option value="medium" ${m?.confidence==='medium'?'selected':''}>Medium</option><option value="low" ${m?.confidence==='low'?'selected':''}>Low</option></select></div></div>
  <label class="checkbox"><input type="checkbox" name="attachEpisode" ${!m||m?.episodeId?'checked':''}> Attach to current episode (${escapeHtml(activeEpisode().title)})</label><label class="checkbox"><input type="checkbox" name="useInModel" ${(m?.useInModel || (!m && Object.keys(measurementTemplate(selected)?.modelMap||{}).length))?'checked':''}> Use mapped abnormal/positive interpretation as Bayesian evidence when supported</label>
  <div class="field"><label>Notes</label><textarea name="notes" placeholder="Lab name, fasting status, sample notes, veterinarian comments, etc.">${escapeHtml(m?.notes||'')}</textarea><span class="helper">Reference ranges vary by laboratory, method, age, hydration and clinical context. Normal or negative results are stored but are not automatically used as Bayesian rule-outs.</span></div><div class="form-actions">${m?`<button type="button" class="danger" data-delete-clinical="${m.id}">Delete</button>`:''}<button class="primary">${m?'Save changes':'Add clinical result'}</button></div></form>`;
}
function bindClinicalForm(){
  const form=$('#clinicalForm'); if(!form)return;
  bindDateEntryHelpers(form);
  const select=form.querySelector('[name=templateId]'), unit=form.querySelector('[name=unit]'), modelBox=form.querySelector('[name=useInModel]');
  select.onchange=()=>{const t=measurementTemplate(select.value); if(t && (!unit.value || editingClinicalId===null)) unit.value=t.unit||''; if(editingClinicalId===null) modelBox.checked=!!Object.keys(t?.modelMap||{}).length;};
  form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form),t=measurementTemplate(fd.get('templateId'));const data={petId:state.settings.activePetId,episodeId:fd.get('attachEpisode')?state.settings.activeEpisodeId:null,templateId:fd.get('templateId'),label:String(fd.get('label')||'').trim(),time:new Date(fd.get('time')).toISOString(),value:String(fd.get('value')||'').trim(),unit:String(fd.get('unit')||'').trim(),refLow:String(fd.get('refLow')||'').trim(),refHigh:String(fd.get('refHigh')||'').trim(),interpretation:interpretationFromForm(fd,t),source:fd.get('source'),confidence:fd.get('confidence')||'high',useInModel:fd.get('useInModel')==='on',notes:String(fd.get('notes')||'').trim()};if(editingClinicalId){Object.assign(state.clinicalMeasurements.find(x=>x.id===editingClinicalId),data);}else state.clinicalMeasurements.push({id:uid(),...data});if(data.episodeId)maybeAdvanceReplayCutoff(data.time);await save();editingClinicalId=null;closeModal();toast('Clinical result saved');render();};
}
function openClinicalModal(id=null){editingClinicalId=id;const m=id?state.clinicalMeasurements.find(x=>x.id===id):null;$('#modalEyebrow').textContent='CLINICAL';$('#modalTitle').textContent=m?'Edit clinical result':`Add clinical result for ${activePet().name}`;$('#modalBody').innerHTML=clinicalFormHtml(m);$('#modalBackdrop').classList.remove('hidden');bindClinicalForm();$$('[data-delete-clinical]',$('#modalBody')).forEach(b=>b.onclick=()=>deleteClinical(b.dataset.deleteClinical));}
async function deleteClinical(id){if(!confirm('Delete this clinical result?'))return;state.clinicalMeasurements=state.clinicalMeasurements.filter(m=>m.id!==id);editingClinicalId=null;closeModal();await save();toast('Clinical result deleted');render();}
function dietFormHtml(d=null){return `<form id="dietForm"><div class="form-row"><div class="field"><label>Brand</label><input name="brand" value="${escapeHtml(d?.brand||'')}"></div><div class="field"><label>Product / recipe</label><input name="product" value="${escapeHtml(d?.product||'')}" required></div></div><div class="form-row three"><div class="field"><label>Food type</label><select name="form">${['wet','dry','raw','freeze-dried','home-cooked','treat','other'].map(x=>`<option value="${x}" ${d?.form===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Start date</label><input type="date" name="startDate" value="${escapeHtml(d?.startDate||new Date().toISOString().slice(0,10))}"></div><div class="field"><label>End date</label><input type="date" name="endDate" value="${escapeHtml(d?.endDate||'')}"></div></div><div class="form-row"><div class="field"><label>Nutrient basis</label><select name="nutrientBasis"><option value="as_fed" ${!d||d?.nutrientBasis==='as_fed'?'selected':''}>As-fed %</option><option value="dry_matter" ${d?.nutrientBasis==='dry_matter'?'selected':''}>Dry-matter %</option></select></div><div class="field"><label>Moisture %</label><input name="moisture" inputmode="decimal" value="${escapeHtml(d?.moisture||'')}" placeholder="needed for AF → DM display"></div></div><div class="form-row three"><div class="field"><label>Protein %</label><input name="protein" inputmode="decimal" value="${escapeHtml(d?.protein||'')}"></div><div class="field"><label>Fat %</label><input name="fat" inputmode="decimal" value="${escapeHtml(d?.fat||'')}"></div><div class="field"><label>Fiber %</label><input name="fiber" inputmode="decimal" value="${escapeHtml(d?.fiber||'')}"></div></div><div class="form-row three"><div class="field"><label>Carbohydrate %</label><input name="carbs" inputmode="decimal" value="${escapeHtml(d?.carbs||'')}"></div><div class="field"><label>Phosphorus</label><input name="phosphorus" inputmode="decimal" value="${escapeHtml(d?.phosphorus||'')}"></div><div class="field"><label>Phosphorus unit</label><select name="phosphorusUnit"><option value="percent" ${!d||d?.phosphorusUnit==='percent'?'selected':''}>%</option><option value="mg100kcal" ${d?.phosphorusUnit==='mg100kcal'?'selected':''}>mg / 100 kcal</option></select></div></div><div class="form-row"><div class="field"><label>Amount / feeding note</label><input name="amount" value="${escapeHtml(d?.amount||'')}" placeholder="e.g. 1 can/day, free-fed, 50% of diet"></div><div class="field"><label>Nutrition source</label><input name="source" value="${escapeHtml(d?.source||'')}" placeholder="label, manufacturer, lab, estimated"></div></div><div class="field"><label>Notes</label><textarea name="notes" placeholder="Flavor, prescription diet, carb estimate method, transition notes, etc.">${escapeHtml(d?.notes||'')}</textarea><span class="helper">Diet records are contextual only and do not alter the Bayesian model. When moisture is supplied for an as-fed record, the display also calculates dry-matter equivalents for percentage nutrients.</span></div><div class="form-actions">${d?`<button type="button" class="danger" data-delete-diet="${d.id}">Delete</button>`:''}<button class="primary">${d?'Save changes':'Add food record'}</button></div></form>`;}
function openDietModal(id=null){editingDietId=id;const d=id?state.diets.find(x=>x.id===id):null;$('#modalEyebrow').textContent='DIET';$('#modalTitle').textContent=d?'Edit food record':`Add food context for ${activePet().name}`;$('#modalBody').innerHTML=dietFormHtml(d);$('#modalBackdrop').classList.remove('hidden');const form=$('#dietForm');form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);const data={petId:state.settings.activePetId,brand:String(fd.get('brand')||'').trim(),product:String(fd.get('product')||'').trim(),form:fd.get('form'),startDate:fd.get('startDate')||'',endDate:fd.get('endDate')||'',nutrientBasis:fd.get('nutrientBasis'),moisture:String(fd.get('moisture')||'').trim(),protein:String(fd.get('protein')||'').trim(),fat:String(fd.get('fat')||'').trim(),fiber:String(fd.get('fiber')||'').trim(),carbs:String(fd.get('carbs')||'').trim(),phosphorus:String(fd.get('phosphorus')||'').trim(),phosphorusUnit:fd.get('phosphorusUnit'),amount:String(fd.get('amount')||'').trim(),source:String(fd.get('source')||'').trim(),notes:String(fd.get('notes')||'').trim()};if(editingDietId){Object.assign(state.diets.find(x=>x.id===editingDietId),data);}else state.diets.push({id:uid(),...data});await save();editingDietId=null;closeModal();toast('Food context saved');render();};$$('[data-delete-diet]',$('#modalBody')).forEach(b=>b.onclick=()=>deleteDiet(b.dataset.deleteDiet));}
async function deleteDiet(id){if(!confirm('Delete this food record?'))return;state.diets=state.diets.filter(d=>d.id!==id);editingDietId=null;closeModal();await save();toast('Food record deleted');render();}

function treatmentFormHtml(t=null){return `<form id="treatmentForm"><div class="form-row"><div class="field"><label>Name</label><input name="name" value="${escapeHtml(t?.name||'')}" placeholder="e.g. insulin glargine, subcutaneous fluids" required></div><div class="field"><label>Type</label><select name="type">${['medication','fluid therapy','procedure','supplement','diet therapy','other'].map(x=>`<option value="${x}" ${t?.type===x||(!t&&x==='medication')?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="form-row"><div class="field"><label>Start</label><input type="datetime-local" name="start" value="${toInputDate(t?.start||episodeEntryDefaultTime())}" required>${dateEntryHelperHtml('start')}</div><div class="field"><label>End</label><input type="datetime-local" name="end" value="${t?.end?toInputDate(t.end):''}"></div></div><div class="form-row three"><div class="field"><label>Dose / amount</label><input name="dose" value="${escapeHtml(t?.dose||'')}" placeholder="e.g. 1 unit"></div><div class="field"><label>Route</label><input name="route" value="${escapeHtml(t?.route||'')}" placeholder="SC, PO, IV..."></div><div class="field"><label>Frequency</label><input name="frequency" value="${escapeHtml(t?.frequency||'')}" placeholder="q12h, daily..."></div></div><div class="form-row"><div class="field"><label>Reason / indication</label><input name="reason" value="${escapeHtml(t?.reason||'')}"></div><div class="field"><label>Prescribed / directed by</label><input name="source" value="${escapeHtml(t?.source||'')}" placeholder="veterinarian, specialist, owner..."></div></div><div class="form-row"><div class="field"><label>Adherence</label><select name="adherence">${['unknown','as_directed','partial','missed_doses','stopped'].map(x=>`<option value="${x}" ${t?.adherence===x||(!t&&x==='unknown')?'selected':''}>${x.replaceAll('_',' ')}</option>`).join('')}</select></div><div class="field"><label>Observed response</label><select name="response">${['unknown','improved','no_change','worsened','mixed','adverse_effect'].map(x=>`<option value="${x}" ${t?.response===x||(!t&&x==='unknown')?'selected':''}>${x.replaceAll('_',' ')}</option>`).join('')}</select></div></div><label class="checkbox"><input type="checkbox" name="attachEpisode" ${!t||t?.episodeId?'checked':''}> Attach to current episode (${escapeHtml(activeEpisode().title)})</label><div class="field"><label>Adverse effects / observations</label><textarea name="adverse">${escapeHtml(t?.adverse||'')}</textarea></div><div class="field"><label>Notes / provenance</label><textarea name="notes">${escapeHtml(t?.notes||'')}</textarea><span class="helper">Treatment and response are retained as clinical context but are not used as automatic diagnostic evidence in v0.8.0, avoiding circular reasoning from treatment choices.</span></div><div class="form-actions">${t?`<button type="button" class="danger" data-delete-treatment="${t.id}">Delete</button>`:''}<button class="primary">${t?'Save changes':'Add treatment'}</button></div></form>`;}
function openTreatmentModal(id=null){editingTreatmentId=id;const t=id?state.treatments.find(x=>x.id===id):null;$('#modalEyebrow').textContent='TREATMENT';$('#modalTitle').textContent=t?'Edit treatment':`Add treatment for ${activePet().name}`;$('#modalBody').innerHTML=treatmentFormHtml(t);$('#modalBackdrop').classList.remove('hidden');const form=$('#treatmentForm');bindDateEntryHelpers(form);form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);const data={petId:state.settings.activePetId,episodeId:fd.get('attachEpisode')==='on'?state.settings.activeEpisodeId:null,name:String(fd.get('name')||'').trim(),type:String(fd.get('type')||'other'),start:new Date(fd.get('start')).toISOString(),end:fd.get('end')?new Date(fd.get('end')).toISOString():null,dose:String(fd.get('dose')||'').trim(),route:String(fd.get('route')||'').trim(),frequency:String(fd.get('frequency')||'').trim(),reason:String(fd.get('reason')||'').trim(),source:String(fd.get('source')||'').trim(),adherence:String(fd.get('adherence')||'unknown'),response:String(fd.get('response')||'unknown'),adverse:String(fd.get('adverse')||'').trim(),notes:String(fd.get('notes')||'').trim()};if(editingTreatmentId)Object.assign(state.treatments.find(x=>x.id===editingTreatmentId),data);else state.treatments.push({id:uid(),...data});if(data.episodeId)maybeAdvanceReplayCutoff(data.start);await save();closeModal();toast('Treatment saved');render();};$$('[data-delete-treatment]',$('#modalBody')).forEach(b=>b.onclick=()=>deleteTreatment(b.dataset.deleteTreatment));}
async function deleteTreatment(id){if(!confirm('Delete this treatment record?'))return;state.treatments=state.treatments.filter(x=>x.id!==id);await save();closeModal();toast('Treatment deleted');render();}
function studyFormHtml(x=null){return `<form id="studyForm"><div class="form-row"><div class="field"><label>Study type</label><select name="type">${['ultrasound','radiograph','echocardiogram','CT','MRI','cytology','histopathology','endoscopy','physical exam finding','other'].map(v=>`<option value="${v}" ${x?.type===v||(!x&&v==='ultrasound')?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Body site / label</label><input name="bodySite" value="${escapeHtml(x?.bodySite||'')}" placeholder="abdomen, thorax, kidney, mass..."></div></div><div class="form-row three"><div class="field"><label>Date & time</label><input type="datetime-local" name="time" value="${toInputDate(x?.time||episodeEntryDefaultTime())}" required>${dateEntryHelperHtml('time')}</div><div class="field"><label>Interpretation</label><select name="interpretation">${['unspecified','normal','abnormal','positive','negative','indeterminate'].map(v=>`<option value="${v}" ${x?.interpretation===v||(!x&&v==='unspecified')?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Source</label><input name="source" value="${escapeHtml(x?.source||'')}" placeholder="clinic / radiologist / pathologist"></div></div><label class="checkbox"><input type="checkbox" name="attachEpisode" ${!x||x?.episodeId?'checked':''}> Attach to current episode (${escapeHtml(activeEpisode().title)})</label><div class="field"><label>Result summary</label><textarea name="summary" placeholder="Retain the actual impression/findings when possible.">${escapeHtml(x?.summary||'')}</textarea></div><div class="field"><label>Notes / provenance</label><textarea name="notes">${escapeHtml(x?.notes||'')}</textarea><span class="helper">Narrative study results are stored with provenance. v0.8.0 does not automatically convert free-text imaging/pathology into Bayesian evidence.</span></div><div class="form-actions">${x?`<button type="button" class="danger" data-delete-study="${x.id}">Delete</button>`:''}<button class="primary">${x?'Save changes':'Add study'}</button></div></form>`;}
function openStudyModal(id=null){editingStudyId=id;const x=id?state.studies.find(y=>y.id===id):null;$('#modalEyebrow').textContent='DIAGNOSTIC STUDY';$('#modalTitle').textContent=x?'Edit diagnostic study':`Add diagnostic study for ${activePet().name}`;$('#modalBody').innerHTML=studyFormHtml(x);$('#modalBackdrop').classList.remove('hidden');const form=$('#studyForm');bindDateEntryHelpers(form);form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);const data={petId:state.settings.activePetId,episodeId:fd.get('attachEpisode')==='on'?state.settings.activeEpisodeId:null,type:String(fd.get('type')||'other'),bodySite:String(fd.get('bodySite')||'').trim(),time:new Date(fd.get('time')).toISOString(),interpretation:String(fd.get('interpretation')||'unspecified'),source:String(fd.get('source')||'').trim(),summary:String(fd.get('summary')||'').trim(),notes:String(fd.get('notes')||'').trim()};if(editingStudyId)Object.assign(state.studies.find(y=>y.id===editingStudyId),data);else state.studies.push({id:uid(),...data});if(data.episodeId)maybeAdvanceReplayCutoff(data.time);await save();closeModal();toast('Diagnostic study saved');render();};$$('[data-delete-study]',$('#modalBody')).forEach(b=>b.onclick=()=>deleteStudy(b.dataset.deleteStudy));}
async function deleteStudy(id){if(!confirm('Delete this diagnostic study?'))return;state.studies=state.studies.filter(x=>x.id!==id);await save();closeModal();toast('Diagnostic study deleted');render();}

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
function outcomeFormHtml(o=null){
  return `<form id="outcomeForm"><div class="form-row"><div class="field"><label>Reference condition</label><select name="conditionId"><option value="">Custom / not in library</option>${knowledge.hypotheses.filter(h=>h.id!=='other_unmodeled').map(h=>`<option value="${h.id}" ${o?.conditionId===h.id?'selected':''}>${escapeHtml(h.label)}</option>`).join('')}</select></div><div class="field"><label>Custom label</label><input name="customLabel" value="${escapeHtml(o?.customLabel||'')}" placeholder="Used when not in condition library"></div></div><div class="form-row three"><div class="field"><label>Outcome date</label><input type="date" name="date" value="${escapeHtml(o?.date||'')}"></div><div class="field"><label>Certainty</label><select name="certainty">${['confirmed','probable','suspected','historical_record'].map(x=>`<option value="${x}" ${o?.certainty===x||(!o&&x==='confirmed')?'selected':''}>${x.replaceAll('_',' ')}</option>`).join('')}</select></div><div class="field"><label>Source</label><select name="source">${['veterinarian','specialist','pathology','necropsy','medical_record','other','owner-entered'].map(x=>`<option value="${x}" ${o?.source===x||(!o&&x==='veterinarian')?'selected':''}>${x.replaceAll('_',' ')}</option>`).join('')}</select></div></div><label class="checkbox"><input type="checkbox" name="hiddenDuringReplay" ${!o||o.hiddenDuringReplay?'checked':''}> Hide this answer during replay until its outcome date</label><div class="field"><label>Notes / provenance</label><textarea name="notes" placeholder="Supporting tests, pathology, veterinarian statement, outcome details, record source, etc.">${escapeHtml(o?.notes||'')}</textarea><span class="helper">Reference outcomes are evaluation labels only. They never alter priors, likelihoods, evidence weights, information gain, monitoring, or urgency rules.</span></div><div class="form-actions">${o?`<button type="button" class="danger" data-delete-outcome="${o.id}">Delete</button>`:''}<button class="primary">${o?'Save changes':'Add reference outcome'}</button></div></form>`;
}
function openOutcomeModal(id=null){
  editingOutcomeId=id; const o=id?state.outcomes.find(x=>x.id===id):null; $('#modalEyebrow').textContent='VALIDATION'; $('#modalTitle').textContent=o?'Edit reference outcome':`Add reference outcome for ${activeEpisode().title}`; $('#modalBody').innerHTML=outcomeFormHtml(o); $('#modalBackdrop').classList.remove('hidden'); const form=$('#outcomeForm'); form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);const data={petId:state.settings.activePetId,episodeId:state.settings.activeEpisodeId,conditionId:String(fd.get('conditionId')||''),customLabel:String(fd.get('customLabel')||'').trim(),date:String(fd.get('date')||''),certainty:String(fd.get('certainty')||'confirmed'),source:String(fd.get('source')||'veterinarian'),hiddenDuringReplay:fd.get('hiddenDuringReplay')==='on',notes:String(fd.get('notes')||'').trim()};if(!data.conditionId&&!data.customLabel){alert('Choose a condition or enter a custom label.');return;}if(editingOutcomeId)Object.assign(state.outcomes.find(x=>x.id===editingOutcomeId),data);else state.outcomes.push({id:uid(),...data});await save();closeModal();toast('Reference outcome saved');render();};$$('[data-delete-outcome]',$('#modalBody')).forEach(b=>b.onclick=()=>deleteOutcome(b.dataset.deleteOutcome));
}
async function deleteOutcome(id){if(!confirm('Delete this reference outcome?'))return;state.outcomes=state.outcomes.filter(x=>x.id!==id);await save();closeModal();toast('Reference outcome deleted');render();}
function openEpisodeEditModal(){
  const ep=activeEpisode(); if(!ep)return;
  $('#modalEyebrow').textContent='EPISODE'; $('#modalTitle').textContent='Edit episode';
  $('#modalBody').innerHTML=`<form id="episodeEditForm"><div class="field"><label>Episode title</label><input name="title" value="${escapeHtml(ep.title)}" required></div><div class="form-row"><div class="field"><label>Start</label><input type="datetime-local" name="start" value="${toInputDate(ep.start)}" required></div><div class="field"><label>End</label><input type="datetime-local" name="end" value="${ep.end?toInputDate(ep.end):''}"></div></div><div class="form-row"><div class="field"><label>Status</label><select name="status"><option value="open" ${ep.status==='open'?'selected':''}>Open / ongoing</option><option value="closed" ${ep.status==='closed'?'selected':''}>Closed</option></select></div><div class="field"><label>Tracking mode</label><select name="trackingMode"><option value="live" ${ep.trackingMode!=='retrospective'?'selected':''}>Live monitoring</option><option value="retrospective" ${ep.trackingMode==='retrospective'?'selected':''}>Retrospective reconstruction</option></select></div></div><div class="field"><label>Monitoring cadence</label><select name="monitoringCadence"><option value="intensive" ${ep.monitoringCadence==='intensive'?'selected':''}>Intensive — denser reassessment queue</option><option value="standard" ${!ep.monitoringCadence||ep.monitoringCadence==='standard'?'selected':''}>Standard</option><option value="sparse" ${ep.monitoringCadence==='sparse'?'selected':''}>Sparse — less frequent reassessment queue</option></select><span class="helper">This changes only the app's data-quality reassessment queue. It does not change Bayesian likelihoods or provide a veterinary follow-up schedule.</span></div><div class="field"><label>New-entry date default</label><select name="entryDateMode"><option value="analysis_cutoff" ${ep.entryDateMode==='analysis_cutoff'?'selected':''}>Replay / analysis point</option><option value="latest_evidence" ${ep.entryDateMode==='latest_evidence'?'selected':''}>Latest episode entry — best for retrospective reconstruction</option><option value="current_time" ${ep.entryDateMode==='current_time'?'selected':''}>Current date & time — best for live logging</option></select><span class="helper">This only prefills new record dates. Existing records and Bayesian weights are never changed.</span></div><div class="form-row"><div class="field"><label>Inference evidence scope</label><select name="analysisMode"><option value="all_evidence" ${ep.analysisMode!=='as_of'?'selected':''}>Use all episode evidence</option><option value="as_of" ${ep.analysisMode==='as_of'?'selected':''}>Replay / analyze as of a date</option></select></div><div class="field"><label>Replay cutoff</label><input type="datetime-local" name="analysisCutoff" value="${toInputDate(episodeAnalysisCutoff(ep)||episodeLatestEvidenceTime(ep))}"></div></div><label class="checkbox"><input type="checkbox" name="advanceReplayOnSave" ${ep.advanceReplayOnSave!==false?'checked':''}> Advance replay cutoff when I save a record at or after the current replay point</label><div class="form-actions"><button class="primary">Save episode</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');
  const editEpisodeForm=$('#episodeEditForm'), editTracking=editEpisodeForm.querySelector('[name=trackingMode]'), editEntryMode=editEpisodeForm.querySelector('[name=entryDateMode]'), editAnalysis=editEpisodeForm.querySelector('[name=analysisMode]');
  let priorTrackingMode=ep.trackingMode||'live';
  editTracking.onchange=()=>{const priorDefault=priorTrackingMode==='retrospective'?'latest_evidence':'current_time';if(editEntryMode.value===priorDefault)editEntryMode.value=editTracking.value==='retrospective'?'latest_evidence':'current_time';if(editTracking.value==='live'&&editEntryMode.value==='analysis_cutoff'&&editAnalysis.value!=='as_of')editEntryMode.value='current_time';priorTrackingMode=editTracking.value;};
  editAnalysis.onchange=()=>{if(editAnalysis.value==='as_of'&&editTracking.value==='retrospective'&&editEntryMode.value==='latest_evidence')editEntryMode.value='analysis_cutoff';if(editAnalysis.value!=='as_of'&&editEntryMode.value==='analysis_cutoff')editEntryMode.value=editTracking.value==='retrospective'?'latest_evidence':'current_time';};
  editEpisodeForm.onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);ep.title=String(fd.get('title')||'').trim()||ep.title;ep.start=new Date(fd.get('start')).toISOString();ep.end=fd.get('end')?new Date(fd.get('end')).toISOString():null;ep.status=fd.get('status');ep.trackingMode=fd.get('trackingMode')||'live';ep.monitoringCadence=fd.get('monitoringCadence')||'standard';ep.entryDateMode=fd.get('entryDateMode')|| (ep.trackingMode==='retrospective'?'latest_evidence':'current_time');ep.analysisMode=fd.get('analysisMode')||'all_evidence';ep.analysisCutoff=fd.get('analysisCutoff')?new Date(fd.get('analysisCutoff')).toISOString():null;ep.advanceReplayOnSave=fd.get('advanceReplayOnSave')==='on';if(ep.analysisMode!=='as_of'&&ep.entryDateMode==='analysis_cutoff')ep.entryDateMode=ep.trackingMode==='retrospective'?'latest_evidence':'current_time';if(ep.status==='closed'&&!ep.end){const b=episodeEvidenceBounds(ep);ep.end=b?.last||new Date().toISOString();}await save();closeModal();updateContextButtons();toast('Episode updated');render();};
}
async function alignEpisodeToEvidence(){
  const ep=activeEpisode(), b=episodeEvidenceBounds(ep); if(!ep||!b)return;
  ep.start=b.first; if(ep.status==='closed')ep.end=b.last;
  await save();updateContextButtons();toast('Episode dates aligned to recorded evidence');render();
}
function openEpisodeModal(){
  const pet=activePet(), eps=petEpisodes();
  $('#modalEyebrow').textContent='EPISODE';$('#modalTitle').textContent=`Start new episode for ${pet.name}`;
  $('#modalBody').innerHTML=`<form id="episodeForm"><div class="field"><label>Episode title</label><input name="title" value="Episode ${eps.length+1}" required></div><div class="field"><label>Start</label><input type="datetime-local" name="start" value="${nowLocalInput()}" required></div><div class="form-row"><div class="field"><label>Tracking mode</label><select name="trackingMode"><option value="live" selected>Live monitoring</option><option value="retrospective">Retrospective reconstruction</option></select></div><div class="field"><label>Monitoring cadence</label><select name="monitoringCadence"><option value="intensive">Intensive</option><option value="standard" selected>Standard</option><option value="sparse">Sparse</option></select></div></div><div class="field"><label>New-entry date default</label><select name="entryDateMode"><option value="current_time" selected>Current date & time</option><option value="latest_evidence">Latest episode entry</option></select><span class="helper">For retrospective episodes, Latest episode entry prevents prompted observations from jumping to today's date.</span></div><label class="checkbox"><input type="checkbox" name="closeCurrent" checked> Close ${escapeHtml(activeEpisode().title)} when this one starts</label><div class="form-actions"><button class="primary">Start episode</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');
  const episodeForm=$('#episodeForm'), trackingSelect=episodeForm.querySelector('[name=trackingMode]'), entrySelect=episodeForm.querySelector('[name=entryDateMode]');
  trackingSelect.onchange=()=>{entrySelect.value=trackingSelect.value==='retrospective'?'latest_evidence':'current_time';};
  episodeForm.onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const start=new Date(fd.get('start')).toISOString();if(fd.get('closeCurrent')){const cur=activeEpisode();if(cur){cur.status='closed';cur.end=start;}}const ep=makeEpisode(pet.id,fd.get('title').trim(),start);ep.trackingMode=fd.get('trackingMode')||'live';ep.monitoringCadence=fd.get('monitoringCadence')||'standard';ep.entryDateMode=fd.get('entryDateMode')|| (ep.trackingMode==='retrospective'?'latest_evidence':'current_time');state.episodes.push(ep);state.settings.activeEpisodeId=ep.id;await save();closeModal();updateContextButtons();render();};
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
  if(!confirm(`Remove ${pet.name} and all of this pet's episodes, observations, clinical results, treatments, studies, diagnoses, and diet records? This cannot be undone.`)) return;
  const episodeIds=new Set(state.episodes.filter(e=>e.petId===pet.id).map(e=>e.id));
  state.observations=state.observations.filter(o=>!episodeIds.has(o.episodeId));
  state.clinicalMeasurements=state.clinicalMeasurements.filter(m=>m.petId!==pet.id);
  state.diets=state.diets.filter(d=>d.petId!==pet.id);
  state.diagnoses=state.diagnoses.filter(d=>d.petId!==pet.id);
  state.treatments=state.treatments.filter(t=>t.petId!==pet.id);
  state.studies=state.studies.filter(x=>x.petId!==pet.id);
  state.outcomes=state.outcomes.filter(x=>x.petId!==pet.id);
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
    knowledge=await fetch('./data/cat-knowledge-v0.7.json').then(r=>{if(!r.ok)throw new Error('Knowledge pack failed to load');return r.json();});
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
