const APP_VERSION = '0.4.0';
const STATE_SCHEMA_VERSION = 3;
const DB_NAME = 'BayesianSymptomTracker';
const DB_VERSION = 1;
const STORE = 'kv';
let knowledge;
let state;
let currentView = 'dashboard';
let editingObservationId = null;
let editingClinicalId = null;
let editingDietId = null;

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
    birthDate:seed.birthDate||'', weight:seed.weight||'', vetName:seed.vetName||'', vetPhone:seed.vetPhone||''
  };
}
function makeEpisode(petId,title='Current episode',start=new Date().toISOString()){
  return {id:uid(),petId,title,start,end:null,status:'open'};
}
function defaultState(){
  const pet=makePet();
  const episode=makeEpisode(pet.id);
  return {
    schemaVersion:STATE_SCHEMA_VERSION, pets:[pet], episodes:[episode], observations:[], clinicalMeasurements:[], diets:[],
    settings:{activePetId:pet.id,activeEpisodeId:episode.id,modelPack:'cat-practical-differentials-v0.4',reportModel:true,reportUrgency:true,reportNotes:true,reportClinical:true,reportDiet:true},
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
}
function migrateState(raw){
  const s=raw && typeof raw==='object' ? raw : defaultState();
  s.settings={reportModel:true,reportUrgency:true,reportNotes:true,reportClinical:true,reportDiet:true,...(s.settings||{})}; s.episodes ||= []; s.observations ||= []; s.clinicalMeasurements ||= []; s.diets ||= [];
  if(!Array.isArray(s.pets) || !s.pets.length){
    const legacy=s.profile||{}; const pet=makePet(legacy); s.pets=[pet];
    s.episodes.forEach(e=>{ if(!e.petId) e.petId=pet.id; });
    s.settings.activePetId=pet.id; delete s.profile;
  }
  s.pets=s.pets.map(p=>makePet(p));
  if(!s.pets.some(p=>p.id===s.settings.activePetId)) s.settings.activePetId=s.pets[0].id;
  s.episodes.forEach(e=>{ if(!e.petId) e.petId=s.settings.activePetId; });
  const petId=s.settings.activePetId;
  let petEps=s.episodes.filter(e=>e.petId===petId).sort((a,b)=>new Date(b.start)-new Date(a.start));
  if(!petEps.length){ const ep=makeEpisode(petId); s.episodes.push(ep); petEps=[ep]; }
  if(!petEps.some(e=>e.id===s.settings.activeEpisodeId)) s.settings.activeEpisodeId=(petEps.find(e=>e.status==='open')||petEps[0]).id;
  s.observations.forEach(o=>{ if(!o.confidence) o.confidence='high'; });
  s.clinicalMeasurements.forEach(m=>{ if(!m.petId) m.petId=s.settings.activePetId; if(!m.confidence) m.confidence='high'; if(m.useInModel===undefined) m.useInModel=true; });
  s.diets.forEach(d=>{ if(!d.petId) d.petId=s.settings.activePetId; });
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
function clinicalEvidence(measurements=episodeClinicalMeasurements()){
  return measurements.flatMap(m=>{
    if(!m.useInModel) return [];
    const fid=clinicalFindingFor(m);
    if(!fid) return [];
    return [{id:`clinical:${m.id}`,findingId:fid,present:true,time:m.time,severity:'medium',confidence:m.confidence||'high',notes:m.notes||'',evidenceType:'clinical',sourceRecordId:m.id}];
  });
}
function modelEvidence(){ return [...episodeObservations().map(o=>({...o,evidenceType:'owner'})),...clinicalEvidence()]; }

function infer(observations=modelEvidence()){
  const perFindingCount={};
  const logs={};
  knowledge.hypotheses.forEach(h=>logs[h.id]=Math.log(Math.max(h.prior,1e-6)));
  observations.forEach(obs=>{
    const n=perFindingCount[obs.findingId]||0;
    perFindingCount[obs.findingId]=n+1;
    const repeatWeight=Math.pow(0.5,n);
    const severityWeight=obs.severity==='high'?1.15:obs.severity==='low'?0.9:1;
    const confidenceWeight=obs.confidence==='low'?0.4:obs.confidence==='medium'?0.72:1;
    const weight=repeatWeight*severityWeight*confidenceWeight;
    knowledge.hypotheses.forEach(h=>{
      const p=Math.min(.97,Math.max(.03,knowledge.likelihoods[h.id]?.[obs.findingId] ?? .5));
      logs[h.id]+=weight*Math.log(obs.present===false ? (1-p) : p);
    });
  });
  const max=Math.max(...Object.values(logs));
  const exp=Object.fromEntries(Object.entries(logs).map(([k,v])=>[k,Math.exp(v-max)]));
  const total=Object.values(exp).reduce((a,b)=>a+b,0)||1;
  return knowledge.hypotheses.map(h=>({ ...h, score:exp[h.id]/total, log:logs[h.id]})).sort((a,b)=>b.score-a.score);
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
  if(e.evidenceType==='clinical'){
    const m=state.clinicalMeasurements.find(x=>x.id===e.sourceRecordId);
    const t=measurementTemplate(m?.templateId);
    return `${t?.label||m?.label||f?.label||e.findingId}: ${m?.value||''}${m?.unit?' '+m.unit:''}`.trim();
  }
  return `${e.present===false?'Absence of ':''}${f?.label||e.findingId}`;
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
function urgencyStatus(){ const a=urgencyAlerts(); return a.some(x=>x.level==='emergency')?'Emergency flag':a.length?'Urgent flag':'No active flags'; }

function setView(view){
  currentView=view;
  $$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const meta={
    dashboard:['Dashboard','Track observations, episodes, and how the evidence shifts.'],
    log:['Log observation','Add a timestamped finding or explicitly record that a finding was absent.'],
    timeline:['Timeline','Review and edit the episode as it unfolded.'],
    context:['Clinical & diet','Record lab/clinical measurements and food composition context.'],
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
  const top=alerts[0]; const cls=top.level==='emergency'?'danger':'warning';
  return `<div class="notice ${cls}"><strong>${top.level==='emergency'?'Emergency flag':'Urgent flag'}: ${escapeHtml(top.title)}</strong> ${escapeHtml(top.message)}${alerts.length>1?` <span class="muted">(${alerts.length-1} additional rule${alerts.length>2?'s':''} active.)</span>`:''}</div>`;
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
  return `<div class="card"><div class="card-head"><div><span class="eyebrow">${escapeHtml(pet.name.toUpperCase())} · EPISODES</span><h2>${escapeHtml(activeEpisode().title)}</h2></div><button class="primary" data-new-episode>＋ New episode</button></div><div class="card-pad"><div class="episode-strip">${eps.map(e=>`<button class="episode-pill ${e.id===state.settings.activeEpisodeId?'active':''}" data-episode="${e.id}">${escapeHtml(e.title)} · ${fmtDate(e.start)}</button>`).join('')}</div></div>${renderTimeline(items)}</div>`;
}

function renderContextPage(){
  const clinical=[...petClinicalMeasurements()].reverse(), diets=petDiets(), ep=activeEpisode();
  return `<div class="notice"><strong>Two evidence layers.</strong> Structured abnormal clinical results can optionally contribute to the Bayesian model when the selected test has a mapping. Normal/negative results are retained as context and are not automatically treated as rule-outs. Diet records never move Bayesian scores in this release.</div>
  <div class="grid two section-gap context-grid">
    <div class="card"><div class="card-head"><div><span class="eyebrow">CLINICAL</span><h2>Measurements & test results</h2></div><button class="primary" data-add-clinical>＋ Add result</button></div><div class="card-pad"><p>Use the reference interval printed by the lab or supplied by the veterinarian. The app does not impose a universal numeric reference range.</p>${renderClinicalList(clinical)}</div></div>
    <div class="card"><div class="card-head"><div><span class="eyebrow">DIET CONTEXT</span><h2>Foods & nutrient profile</h2></div><button class="primary" data-add-diet>＋ Add food</button></div><div class="card-pad"><p>Track food form and nutrient composition over time. Protein, fat, fiber and carbohydrate values are stored as percentages on the selected basis; phosphorus can also be recorded as mg/100 kcal.</p>${renderDietList(diets)}</div></div>
  </div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">CURRENT EPISODE</span><h2>${escapeHtml(ep.title)} context</h2></div></div><div class="card-pad"><p>${episodeClinicalMeasurements().length} clinical result${episodeClinicalMeasurements().length===1?'':'s'} attached · ${episodeDiets().length} food record${episodeDiets().length===1?'':'s'} overlapping the episode.</p></div></div>`;
}
function renderClinicalList(items){
  if(!items.length) return '<div class="empty compact">No clinical measurements saved for this pet.</div>';
  return `<div class="context-list">${items.map(m=>{const t=measurementTemplate(m.templateId),fid=clinicalFindingFor(m);const ref=(m.refLow||m.refHigh)?`Ref ${escapeHtml(m.refLow||'—')}–${escapeHtml(m.refHigh||'—')} ${escapeHtml(m.unit||'')}`:'';return `<div class="context-item"><div><strong>${escapeHtml(t?.label||m.label||'Measurement')}</strong><span class="context-value">${escapeHtml(m.value||'—')}${m.unit?` ${escapeHtml(m.unit)}`:''}</span><small>${fmtDateTime(m.time)} · ${escapeHtml(m.interpretation||'unspecified')}${ref?' · '+ref:''}${m.episodeId===state.settings.activeEpisodeId?' · current episode':''}</small>${m.notes?`<p>${escapeHtml(m.notes)}</p>`:''}</div><div class="context-actions">${fid&&m.useInModel?'<span class="chip accent">Model evidence</span>':'<span class="chip">Context</span>'}<button class="mini" data-edit-clinical="${m.id}">Edit</button></div></div>`}).join('')}</div>`;
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
function renderModelPage(){
  const evidence=[...modelEvidence()].reverse(); const model=infer(); const top=model[0]; const families=familyScores(model);
  const byFamily=new Map();
  model.forEach(h=>{const fam=h.family||'Other'; if(!byFamily.has(fam)) byFamily.set(fam,[]); byFamily.get(fam).push(h);});
  const familySections=families.map(f=>`<details class="model-family"><summary><strong>${escapeHtml(f.label)}</strong><span>${(f.score*100).toFixed(1)}% family aggregate</span></summary><div class="score-list">${renderScores(byFamily.get(f.label)||[])}</div></details>`).join('');
  return `<div class="notice warning"><strong>Experimental model.</strong> These are relative pattern-consistency scores from a non-validated Bayesian knowledge pack, not disease probabilities, diagnoses, or rule-outs.</div>
  <div class="grid two section-gap"><div class="card"><div class="card-head"><div><span class="eyebrow">TOP CONDITION MATCHES</span><h2>Current differential pattern</h2></div></div><div class="score-list">${renderScores(model.slice(0,15))}</div></div>
  <div class="card"><div class="card-head"><div><span class="eyebrow">SYSTEM-LEVEL VIEW</span><h2>Condition-family aggregates</h2></div></div><div class="score-list">${renderFamilyScores(families)}</div></div></div>
  ${evidence.length?`<div class="card section-gap"><div class="card-head"><div><span class="eyebrow">TOP CURRENT MATCH</span><h2>${escapeHtml(top.label)}</h2><small>${escapeHtml(top.family||'')}</small></div><span class="chip accent">${(top.score*100).toFixed(1)}%</span></div><div class="card-pad"><p>${escapeHtml(top.description)}</p><div class="divider"></div><h3>Evidence contribution</h3></div><div class="evidence-list">${evidence.map(e=>{const imp=evidenceImpact(e,top.id);return `<div class="evidence-item"><div><strong>${escapeHtml(evidenceLabel(e))}</strong><small>${fmtDateTime(e.time)} · ${e.evidenceType==='clinical'?'clinical result':'owner observation'}</small></div><div class="impact ${imp>=0?'up':'down'}">${imp>=0?'▲':'▼'} ${Math.abs(imp*100).toFixed(1)} pt</div></div>`}).join('')}</div></div>`:`<div class="notice section-gap"><strong>No observations yet.</strong> The condition scores below are only baseline model weights until evidence is logged.</div>`}
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">CONDITION LIBRARY</span><h2>Browse all ${knowledge.hypotheses.length} hypotheses</h2></div><span class="chip">${knowledge.coverage?.namedConditionCount||knowledge.hypotheses.length} named</span></div><div class="card-pad"><p>${escapeHtml(knowledge.coverage?.scope||'')}</p>${familySections}</div></div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">TRANSPARENCY</span><h2>Model assumptions</h2></div></div><div class="card-pad"><p>The engine treats logged owner findings and opted-in mapped clinical findings as conditionally independent given each condition hypothesis. Repeated identical findings are down-weighted to reduce runaway double-counting. Numeric likelihoods are heuristic pattern weights rather than measured diagnostic sensitivity or specificity.</p><p>${escapeHtml(knowledge.coverage?.priorPolicy||'Priors are stored in the versioned knowledge pack.')}</p><p>The explicit <strong>Other / unmodeled condition</strong> hypothesis reserves model mass for conditions outside this library. That does not make the remainder exhaustive.</p><button class="ghost" data-viewgo="settings">View coverage & provenance</button></div></div>`;
}
function renderReportsPage(){
  const opts=state.settings;
  return `<div class="card no-print"><div class="card-head"><div><span class="eyebrow">REPORT OPTIONS</span><h2>Vet-friendly episode report</h2></div></div><div class="card-pad"><div class="report-options"><label class="checkbox"><input type="checkbox" data-report-opt="reportModel" ${opts.reportModel?'checked':''}> Include Bayesian model</label><label class="checkbox"><input type="checkbox" data-report-opt="reportUrgency" ${opts.reportUrgency?'checked':''}> Include urgency-rule history</label><label class="checkbox"><input type="checkbox" data-report-opt="reportNotes" ${opts.reportNotes?'checked':''}> Include observation notes</label><label class="checkbox"><input type="checkbox" data-report-opt="reportClinical" ${opts.reportClinical?'checked':''}> Include clinical measurements</label><label class="checkbox"><input type="checkbox" data-report-opt="reportDiet" ${opts.reportDiet?'checked':''}> Include diet context</label></div><div class="report-actions"><button class="primary" data-print>Print / Save PDF</button></div></div></div><div class="section-gap print-target">${reportHtml()}</div>`;
}
function reportHtml(){
  const ep=activeEpisode(),pet=activePet(),obs=episodeObservations(),clinical=episodeClinicalMeasurements(),diets=episodeDiets(),model=infer(),alerts=urgencyAlerts();
  return `<article class="report-paper"><h2>Bayesian Symptom Tracker — Episode Report</h2><p class="report-muted">Generated ${fmtDateTime(new Date().toISOString())} · App v${APP_VERSION} · Knowledge pack ${escapeHtml(knowledge.packId)}</p><table><tr><th>Patient</th><td>${escapeHtml(pet.name)}</td><th>Species</th><td>Cat</td></tr><tr><th>Sex</th><td>${escapeHtml(pet.sex)}</td><th>Weight</th><td>${escapeHtml(pet.weight||'—')}</td></tr><tr><th>Episode</th><td>${escapeHtml(ep.title)}</td><th>Started</th><td>${fmtDateTime(ep.start)}</td></tr></table>
  <h3>Observation timeline</h3><table><thead><tr><th>Time</th><th>Finding</th><th>Intensity</th><th>Confidence</th>${state.settings.reportNotes?'<th>Notes</th>':''}</tr></thead><tbody>${obs.map(o=>`<tr><td>${fmtDateTime(o.time)}</td><td>${o.present===false?'Not observed: ':''}${escapeHtml(finding(o.findingId)?.label||o.findingId)}</td><td>${escapeHtml(o.severity||'medium')}</td><td>${escapeHtml(o.confidence||'high')}</td>${state.settings.reportNotes?`<td>${escapeHtml(o.notes||'')}</td>`:''}</tr>`).join('')||'<tr><td colspan="5">No observations</td></tr>'}</tbody></table>
  ${state.settings.reportClinical?`<h3>Clinical measurements / test results</h3><table><thead><tr><th>Time</th><th>Test</th><th>Result</th><th>Reference</th><th>Interpretation</th><th>Model</th></tr></thead><tbody>${clinical.map(m=>{const t=measurementTemplate(m.templateId);return `<tr><td>${fmtDateTime(m.time)}</td><td>${escapeHtml(t?.label||m.label||m.templateId)}</td><td>${escapeHtml(m.value||'—')} ${escapeHtml(m.unit||'')}</td><td>${escapeHtml(m.refLow||'—')}–${escapeHtml(m.refHigh||'—')} ${escapeHtml(m.unit||'')}</td><td>${escapeHtml(m.interpretation||'unspecified')}</td><td>${clinicalFindingFor(m)&&m.useInModel?'mapped evidence':'context only'}</td></tr>`}).join('')||'<tr><td colspan="6">No clinical measurements attached to this episode</td></tr>'}</tbody></table>`:''}
  ${state.settings.reportDiet?`<h3>Diet context overlapping episode</h3><table><thead><tr><th>Food</th><th>Form</th><th>Dates</th><th>Protein</th><th>Fiber</th><th>Carbohydrate</th><th>Phosphorus</th></tr></thead><tbody>${diets.map(d=>`<tr><td>${escapeHtml([d.brand,d.product].filter(Boolean).join(' · ')||'Food record')}</td><td>${escapeHtml(d.form||'')}</td><td>${escapeHtml(d.startDate||'—')} → ${escapeHtml(d.endDate||'current')}</td><td>${escapeHtml(nutrientDisplay(d,'protein'))}</td><td>${escapeHtml(nutrientDisplay(d,'fiber'))}</td><td>${escapeHtml(nutrientDisplay(d,'carbs'))}</td><td>${escapeHtml(phosphorusDisplay(d))}</td></tr>`).join('')||'<tr><td colspan="7">No diet context overlaps this episode</td></tr>'}</tbody></table><p class="report-muted">Diet composition is reported as context and does not alter Bayesian scores in this release.</p>`:''}
  ${state.settings.reportUrgency?`<h3>Current deterministic urgency flags</h3>${alerts.length?`<ul>${alerts.map(a=>`<li><strong>${escapeHtml(a.title)}:</strong> ${escapeHtml(a.message)}</li>`).join('')}</ul>`:'<p>No active urgency rules at report generation time.</p>'}`:''}
  ${state.settings.reportModel?`<h3>Top relative condition-pattern scores</h3><table><thead><tr><th>Condition pattern</th><th>Family</th><th>Score</th></tr></thead><tbody>${model.slice(0,15).map(h=>`<tr><td>${escapeHtml(h.label)}</td><td>${escapeHtml(h.family||'')}</td><td>${(h.score*100).toFixed(1)}%</td></tr>`).join('')}</tbody></table><p><strong>Important:</strong> These normalized Bayesian scores are generated by a non-validated heuristic model and are not disease probabilities, diagnoses, or rule-outs. The library includes an Other / unmodeled condition reserve.</p>`:''}
  <p class="report-muted">This report is an owner-generated record intended to help communicate observations. It does not replace veterinary examination, diagnosis, or treatment.</p></article>`;
}
function renderSettingsPage(){
  const pet=activePet();
  return `<div class="grid two settings-grid"><div class="card"><div class="card-head"><div><span class="eyebrow">PETS</span><h2>${escapeHtml(pet.name)}'s profile</h2></div><button class="secondary" data-add-pet>＋ Add pet</button></div><div class="card-pad"><div class="pet-strip">${state.pets.map(p=>`<button class="pet-pill ${p.id===pet.id?'active':''}" data-pet="${p.id}">${escapeHtml(p.name)}</button>`).join('')}</div><form id="profileForm" class="section-gap"><div class="form-row"><div class="field"><label>Name</label><input name="name" value="${escapeHtml(pet.name)}" required></div><div class="field"><label>Sex</label><select name="sex"><option value="unknown" ${pet.sex==='unknown'?'selected':''}>Unknown / not set</option><option value="female" ${pet.sex==='female'?'selected':''}>Female</option><option value="male" ${pet.sex==='male'?'selected':''}>Male</option></select></div></div><div class="form-row"><div class="field"><label>Birth date</label><input type="date" name="birthDate" value="${escapeHtml(pet.birthDate||'')}"></div><div class="field"><label>Weight</label><input name="weight" placeholder="e.g., 10.4 lb" value="${escapeHtml(pet.weight||'')}"></div></div><div class="form-row"><div class="field"><label>Veterinarian</label><input name="vetName" value="${escapeHtml(pet.vetName||'')}"></div><div class="field"><label>Vet phone</label><input name="vetPhone" value="${escapeHtml(pet.vetPhone||'')}"></div></div><div class="form-actions split-actions">${state.pets.length>1?'<button type="button" class="danger" data-remove-pet>Remove pet</button>':'<span></span>'}<button class="primary">Save profile</button></div></form></div></div>
  <div class="card"><div class="card-head"><div><span class="eyebrow">DATA</span><h2>Backup & portability</h2></div></div><div class="card-pad"><p>All pets, episodes, observations, clinical measurements, and diet records are stored in IndexedDB in this browser. Export backups regularly, especially before clearing browser data.</p><div class="button-row"><button class="ghost" data-export>Export JSON</button><label class="button-like ghost-like" for="importFile">Import JSON</label><input type="file" id="importFile" accept="application/json" hidden><button class="secondary" data-demo>Load demo episode</button></div><div class="divider"></div><button class="danger" data-reset>Reset all local data</button></div></div></div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">KNOWLEDGE PACK</span><h2>${escapeHtml(knowledge.packId)}</h2></div><span class="chip">${escapeHtml(knowledge.modelStatus)}</span></div><div class="card-pad"><p>${escapeHtml(knowledge.modelNotice)}</p><h3>Coverage</h3><p><strong>${knowledge.coverage?.namedConditionCount||knowledge.hypotheses.length} named condition patterns</strong> + Other / unmodeled reserve · ${knowledge.coverage?.ownerFindingCount||knowledge.findings.filter(f=>f.sourceType!=='clinical').length} owner-observable findings · ${knowledge.coverage?.clinicalFindingCount||0} clinical evidence findings · ${knowledge.coverage?.measurementTemplateCount||0} structured measurement templates · ${knowledge.coverage?.familyCount||new Set(knowledge.hypotheses.map(h=>h.family)).size} families.</p><p>${escapeHtml(knowledge.coverage?.scope||'')}</p><p class="helper">${escapeHtml(knowledge.coverage?.priorPolicy||'')}</p><h3>Knowledge & urgency provenance</h3><ul class="source-list">${knowledge.sources.map(s=>`<li><a href="${s.url}" target="_blank" rel="noreferrer">${escapeHtml(s.name)}</a> — ${escapeHtml(s.role)}</li>`).join('')}</ul><p class="helper">The cited veterinary references support representative condition/sign relationships and emergency red-flag examples. They do <strong>not</strong> validate the numeric Bayesian priors or likelihood weights in this experimental pack.</p></div></div>`;
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
function closeModal(){ $('#modalBackdrop').classList.add('hidden'); editingObservationId=null; editingClinicalId=null; editingDietId=null; }
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
function openEpisodeModal(){
  const pet=activePet(), eps=petEpisodes();
  $('#modalEyebrow').textContent='EPISODE';$('#modalTitle').textContent=`Start new episode for ${pet.name}`;
  $('#modalBody').innerHTML=`<form id="episodeForm"><div class="field"><label>Episode title</label><input name="title" value="Episode ${eps.length+1}" required></div><div class="field"><label>Start</label><input type="datetime-local" name="start" value="${nowLocalInput()}" required></div><label class="checkbox"><input type="checkbox" name="closeCurrent" checked> Close ${escapeHtml(activeEpisode().title)} when this one starts</label><div class="form-actions"><button class="primary">Start episode</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');
  $('#episodeForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const start=new Date(fd.get('start')).toISOString();if(fd.get('closeCurrent')){const cur=activeEpisode();if(cur){cur.status='closed';cur.end=start;}}const ep=makeEpisode(pet.id,fd.get('title').trim(),start);state.episodes.push(ep);state.settings.activeEpisodeId=ep.id;await save();closeModal();updateContextButtons();render();};
}
function openPetModal(){
  $('#modalEyebrow').textContent='PET'; $('#modalTitle').textContent='Add pet';
  $('#modalBody').innerHTML=`<form id="petForm"><div class="form-row"><div class="field"><label>Name</label><input name="name" placeholder="Pet name" required autofocus></div><div class="field"><label>Sex</label><select name="sex"><option value="unknown">Unknown / not set</option><option value="female">Female</option><option value="male">Male</option></select></div></div><div class="form-row"><div class="field"><label>Birth date</label><input type="date" name="birthDate"></div><div class="field"><label>Weight</label><input name="weight" placeholder="e.g., 10.4 lb"></div></div><div class="form-actions"><button class="primary">Add pet</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');
  $('#petForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const pet=makePet({name:fd.get('name').trim(),sex:fd.get('sex'),birthDate:fd.get('birthDate'),weight:fd.get('weight').trim()});const ep=makeEpisode(pet.id);state.pets.push(pet);state.episodes.push(ep);state.settings.activePetId=pet.id;state.settings.activeEpisodeId=ep.id;await save();closeModal();updateContextButtons();toast(`${pet.name} added`);render();};
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
  state.episodes=state.episodes.filter(e=>e.petId!==pet.id);
  state.pets=state.pets.filter(p=>p.id!==pet.id);
  state.settings.activePetId=state.pets[0].id;
  const eps=petEpisodes(); state.settings.activeEpisodeId=(eps.find(e=>e.status==='open')||eps[0]).id;
  await save();updateContextButtons();toast(`${pet.name} removed`);render();
}
async function saveProfile(e){
  e.preventDefault();const fd=new FormData(e.target);const pet=activePet();
  ['name','sex','birthDate','weight','vetName','vetPhone'].forEach(k=>pet[k]=String(fd.get(k)||'').trim());
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
    knowledge=await fetch('./data/cat-knowledge-v0.4.json').then(r=>{if(!r.ok)throw new Error('Knowledge pack failed to load');return r.json();});
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
