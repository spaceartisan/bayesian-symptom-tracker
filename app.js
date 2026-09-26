const APP_VERSION = '0.2.0';
const DB_NAME = 'BayesianSymptomTracker';
const DB_VERSION = 1;
const STORE = 'kv';
let knowledge;
let state;
let currentView = 'dashboard';
let editingObservationId = null;

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

function defaultState(){
  const episode={id:uid(),title:'Current episode',start:new Date().toISOString(),end:null,status:'open'};
  return {
    schemaVersion:1,
    profile:{name:'My cat',species:'cat',sex:'unknown',birthDate:'',weight:'',vetName:'',vetPhone:''},
    episodes:[episode], observations:[],
    settings:{activeEpisodeId:episode.id,modelPack:'cat-practical-differentials-v0.3',reportModel:true,reportUrgency:true,reportNotes:true},
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
}
async function save(){ state.updatedAt=new Date().toISOString(); await dbSet('state',state); }
function activeEpisode(){ return state.episodes.find(e=>e.id===state.settings.activeEpisodeId) || state.episodes[0]; }
function episodeObservations(id=state.settings.activeEpisodeId){ return state.observations.filter(o=>o.episodeId===id).sort((a,b)=>new Date(a.time)-new Date(b.time)); }
function finding(id){ return knowledge.findings.find(f=>f.id===id); }
function hypothesis(id){ return knowledge.hypotheses.find(h=>h.id===id); }

function infer(observations=episodeObservations()){
  const perFindingCount={};
  const logs={};
  knowledge.hypotheses.forEach(h=>logs[h.id]=Math.log(Math.max(h.prior,1e-6)));
  observations.forEach(obs=>{
    const n=perFindingCount[obs.findingId]||0;
    perFindingCount[obs.findingId]=n+1;
    const repeatWeight=Math.pow(0.5,n);
    const severityWeight=obs.severity==='high'?1.15:obs.severity==='low'?0.9:1;
    const weight=repeatWeight*severityWeight;
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
  return infer([...baseObs,{findingId:fid,present,severity:'medium',time:new Date().toISOString(),episodeId:state.settings.activeEpisodeId,id:'virtual'}]);
}
function nextBestQuestion(){
  const obs=episodeObservations();
  const used=new Set(obs.map(o=>o.findingId));
  const usedStateGroups=new Set(obs.map(o=>finding(o.findingId)?.stateGroup).filter(Boolean));
  const base=infer(obs); const h0=entropy(base);
  let best=null;
  for(const f of knowledge.findings){
    // State-group members are mutually exclusive at a point in time. Once a state
    // has been recorded, don't ask a contradictory sibling as the next-best prompt.
    // Users can still manually log a later state change from the observation form.
    if(used.has(f.id) || (f.stateGroup && usedStateGroups.has(f.stateGroup))) continue;
    const py=base.reduce((s,h)=>s+h.score*(knowledge.likelihoods[h.id]?.[f.id] ?? .5),0);
    const y=distributionAfterVirtual(obs,f.id,true), n=distributionAfterVirtual(obs,f.id,false);
    const expected=py*entropy(y)+(1-py)*entropy(n);
    const gain=h0-expected;
    if(!best || gain>best.gain) best={finding:f,gain,py};
  }
  return best;
}
function evidenceImpact(obs,targetHypothesisId){
  const all=episodeObservations(); const full=infer(all).find(x=>x.id===targetHypothesisId)?.score||0;
  const without=infer(all.filter(x=>x.id!==obs.id)).find(x=>x.id===targetHypothesisId)?.score||0;
  return full-without;
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
    model:['Bayesian model','Inspect relative pattern-consistency scores and the evidence behind them.'],
    reports:['Reports','Create a printable, vet-friendly episode summary.'],
    settings:['Settings','Patient details, episodes, backup, provenance, and model information.']
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
  if(currentView==='model') root.innerHTML=renderModelPage();
  if(currentView==='reports') root.innerHTML=renderReportsPage();
  if(currentView==='settings') root.innerHTML=renderSettingsPage();
  bindRenderedActions();
}

function renderDashboard(){
  const obs=episodeObservations(); const model=infer(obs); const alerts=urgencyAlerts(); const ep=activeEpisode(); const next=nextBestQuestion();
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
        <div class="score-list">${obs.length?renderScores(model.slice(0,8)):`<div class="empty">No condition ranking yet. Add observations to begin.</div>`}</div>
      </div>
      <div class="card">
        <div class="card-head"><div><span class="eyebrow">INFORMATION VALUE</span><h2>Useful next observation</h2></div></div>
        ${next?`<div class="question-card"><h3>${escapeHtml(next.finding.question)}</h3><p>Of the unrecorded findings, this question is estimated to reduce the model's uncertainty the most right now. It is not a medical recommendation.</p><div class="chips"><span class="chip accent">Expected information gain ${next.gain.toFixed(3)} bits</span></div><div class="question-actions section-gap"><button class="primary" data-quick-answer="yes" data-finding="${next.finding.id}">Yes</button><button class="ghost" data-quick-answer="no" data-finding="${next.finding.id}">No</button><button class="ghost" data-log-finding="${next.finding.id}">Add details</button></div></div>`:`<div class="empty">Add observations to generate a next-best question.</div>`}
      </div>
    </div>
    <div class="grid two section-gap">
      <div class="card"><div class="card-head"><div><span class="eyebrow">EPISODE</span><h2>Recent timeline</h2></div><button class="mini" data-viewgo="timeline">View all</button></div>${renderTimeline(obs.slice(-6).reverse())}</div>
      <div class="card"><div class="card-head"><div><span class="eyebrow">MODEL NOTICE</span><h2>What the percentages mean</h2></div></div><div class="card-pad"><p style="margin-top:0">The percentages are normalized Bayesian <strong>pattern-consistency scores</strong> across the condition library. They are not estimates of the probability that your cat has a disease.</p><p>The model is intentionally transparent: observations, priors and likelihood assumptions are inspectable, and urgency warnings are calculated separately.</p><div class="notice warning">The current feline differential pack is <strong>not clinically validated</strong>. It includes an explicit Other / unmodeled reserve because even a large library cannot rule out diseases it does not represent.</div></div></div>
    </div>`;
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
function renderTimeline(obs){
  if(!obs.length) return `<div class="empty"><div class="big">∅</div>No observations logged yet.</div>`;
  return `<div class="timeline">${obs.map(o=>{const f=finding(o.findingId);return `<div class="event"><div class="event-time">${fmtDateTime(o.time)}</div><div class="dot" style="background:${o.present===false?'#8090a5':'var(--accent)'}"></div><div class="event-body"><strong>${o.present===false?'Not observed: ':''}${escapeHtml(f?.label||o.findingId)}</strong>${o.notes?`<p>${escapeHtml(o.notes)}</p>`:''}<div class="event-actions"><span class="chip">${escapeHtml(o.severity||'medium')}</span><button class="mini" data-edit-obs="${o.id}">Edit</button></div></div></div>`}).join('')}</div>`;
}
function logFormHtml(obs=null,formId='observationForm'){
  const categories=[...new Set(knowledge.findings.map(f=>f.category))];
  const selected=obs?.findingId || knowledge.findings[0].id;
  return `<form id="${formId}">
    <div class="form-row">
      <div class="field"><label>Finding</label><select name="findingId">${categories.map(cat=>`<optgroup label="${escapeHtml(cat)}">${knowledge.findings.filter(f=>f.category===cat).map(f=>`<option value="${f.id}" ${selected===f.id?'selected':''}>${escapeHtml(f.label)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="field"><label>Outcome</label><select name="present"><option value="true" ${obs?.present!==false?'selected':''}>Observed / present</option><option value="false" ${obs?.present===false?'selected':''}>Checked and not observed</option></select></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Date & time</label><input type="datetime-local" name="time" value="${obs?toInputDate(obs.time):nowLocalInput()}" required></div>
      <div class="field"><label>Intensity / confidence</label><select name="severity"><option value="low" ${obs?.severity==='low'?'selected':''}>Low / mild</option><option value="medium" ${!obs||obs?.severity==='medium'?'selected':''}>Medium</option><option value="high" ${obs?.severity==='high'?'selected':''}>High / marked</option></select></div>
    </div>
    <div class="field"><label>Notes</label><textarea name="notes" placeholder="What happened? Add quantity, color, contents, behavior, timing, context, etc.">${escapeHtml(obs?.notes||'')}</textarea><span class="helper">Keep raw observations factual when possible. The standardized finding above is stored separately from your notes.</span></div>
    <div class="form-actions">${obs?`<button type="button" class="danger" data-delete-obs="${obs.id}">Delete</button>`:''}<button type="submit" class="primary">${obs?'Save changes':'Add observation'}</button></div>
  </form>`;
}
function toInputDate(iso){ const d=new Date(iso);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16); }
function renderLogPage(){ return `<div class="grid two"><div class="card"><div class="card-head"><div><span class="eyebrow">NEW EVIDENCE</span><h2>Record an observation</h2></div></div><div class="card-pad">${logFormHtml(null,'inlineLogForm')}</div></div><div class="card"><div class="card-head"><div><span class="eyebrow">GUIDANCE</span><h2>Good observations are specific</h2></div></div><div class="card-pad"><p>Record what you actually saw and when. Time, frequency, amount, duration and context can matter more than a vague symptom label.</p><div class="notice"><strong>Example:</strong> “Vomited clear foam at 2:15 AM; third episode in 90 minutes; no food visible.”</div><p>You can also record that a finding was explicitly checked and <em>not</em> observed. Negative evidence can shift the model too.</p></div></div></div>`; }
function renderTimelinePage(){
  const eps=[...state.episodes].sort((a,b)=>new Date(b.start)-new Date(a.start)); const obs=[...episodeObservations()].reverse();
  return `<div class="card"><div class="card-head"><div><span class="eyebrow">EPISODES</span><h2>${escapeHtml(activeEpisode().title)}</h2></div><button class="primary" data-new-episode>＋ New episode</button></div><div class="card-pad"><div class="episode-strip">${eps.map(e=>`<button class="episode-pill ${e.id===state.settings.activeEpisodeId?'active':''}" data-episode="${e.id}">${escapeHtml(e.title)} · ${fmtDate(e.start)}</button>`).join('')}</div></div>${renderTimeline(obs)}</div>`;
}
function renderModelPage(){
  const model=infer(); const top=model[0]; const obs=[...episodeObservations()].reverse(); const families=familyScores(model);
  const byFamily=new Map();
  model.forEach(h=>{const fam=h.family||'Other'; if(!byFamily.has(fam)) byFamily.set(fam,[]); byFamily.get(fam).push(h);});
  const familySections=families.map(f=>`<details class="model-family"><summary><strong>${escapeHtml(f.label)}</strong><span>${(f.score*100).toFixed(1)}% family aggregate</span></summary><div class="score-list">${renderScores(byFamily.get(f.label)||[])}</div></details>`).join('');
  return `<div class="notice warning"><strong>Experimental model.</strong> These are relative pattern-consistency scores from a non-validated Bayesian knowledge pack, not disease probabilities, diagnoses, or rule-outs.</div>
  <div class="grid two section-gap"><div class="card"><div class="card-head"><div><span class="eyebrow">TOP CONDITION MATCHES</span><h2>Current differential pattern</h2></div></div><div class="score-list">${renderScores(model.slice(0,15))}</div></div>
  <div class="card"><div class="card-head"><div><span class="eyebrow">SYSTEM-LEVEL VIEW</span><h2>Condition-family aggregates</h2></div></div><div class="score-list">${renderFamilyScores(families)}</div></div></div>
  ${obs.length?`<div class="card section-gap"><div class="card-head"><div><span class="eyebrow">TOP CURRENT MATCH</span><h2>${escapeHtml(top.label)}</h2><small>${escapeHtml(top.family||'')}</small></div><span class="chip accent">${(top.score*100).toFixed(1)}%</span></div><div class="card-pad"><p>${escapeHtml(top.description)}</p><div class="divider"></div><h3>Evidence contribution</h3></div><div class="evidence-list">${obs.map(o=>{const imp=evidenceImpact(o,top.id);const f=finding(o.findingId);return `<div class="evidence-item"><div><strong>${o.present===false?'Absence of ':''}${escapeHtml(f?.label||o.findingId)}</strong><small>${fmtDateTime(o.time)}</small></div><div class="impact ${imp>=0?'up':'down'}">${imp>=0?'▲':'▼'} ${Math.abs(imp*100).toFixed(1)} pt</div></div>`}).join('')}</div></div>`:`<div class="notice section-gap"><strong>No observations yet.</strong> The condition scores below are only baseline model weights until evidence is logged.</div>`}
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">CONDITION LIBRARY</span><h2>Browse all ${knowledge.hypotheses.length} hypotheses</h2></div><span class="chip">${knowledge.coverage?.namedConditionCount||knowledge.hypotheses.length} named</span></div><div class="card-pad"><p>${escapeHtml(knowledge.coverage?.scope||'')}</p>${familySections}</div></div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">TRANSPARENCY</span><h2>Model assumptions</h2></div></div><div class="card-pad"><p>The engine treats logged findings as conditionally independent given each condition hypothesis. Repeated identical findings are down-weighted to reduce runaway double-counting. Numeric likelihoods are heuristic pattern weights rather than measured diagnostic sensitivity or specificity.</p><p>${escapeHtml(knowledge.coverage?.priorPolicy||'Priors are stored in the versioned knowledge pack.')}</p><p>The explicit <strong>Other / unmodeled condition</strong> hypothesis reserves model mass for conditions outside this library. That does not make the remainder exhaustive.</p><button class="ghost" data-viewgo="settings">View coverage & provenance</button></div></div>`;
}
function renderReportsPage(){
  const opts=state.settings;
  return `<div class="card no-print"><div class="card-head"><div><span class="eyebrow">REPORT OPTIONS</span><h2>Vet-friendly episode report</h2></div></div><div class="card-pad"><div class="report-options"><label class="checkbox"><input type="checkbox" data-report-opt="reportModel" ${opts.reportModel?'checked':''}> Include Bayesian model</label><label class="checkbox"><input type="checkbox" data-report-opt="reportUrgency" ${opts.reportUrgency?'checked':''}> Include urgency-rule history</label><label class="checkbox"><input type="checkbox" data-report-opt="reportNotes" ${opts.reportNotes?'checked':''}> Include observation notes</label></div><div class="report-actions"><button class="primary" data-print>Print / Save PDF</button></div></div></div><div class="section-gap print-target">${reportHtml()}</div>`;
}
function reportHtml(){
  const ep=activeEpisode(),obs=episodeObservations(),model=infer(obs),alerts=urgencyAlerts();
  return `<article class="report-paper"><h2>Bayesian Symptom Tracker — Episode Report</h2><p class="report-muted">Generated ${fmtDateTime(new Date().toISOString())} · App v${APP_VERSION} · Knowledge pack ${escapeHtml(knowledge.packId)}</p><table><tr><th>Patient</th><td>${escapeHtml(state.profile.name)}</td><th>Species</th><td>Cat</td></tr><tr><th>Sex</th><td>${escapeHtml(state.profile.sex)}</td><th>Weight</th><td>${escapeHtml(state.profile.weight||'—')}</td></tr><tr><th>Episode</th><td>${escapeHtml(ep.title)}</td><th>Started</th><td>${fmtDateTime(ep.start)}</td></tr></table>
  <h3>Observation timeline</h3><table><thead><tr><th>Time</th><th>Finding</th><th>Intensity</th>${state.settings.reportNotes?'<th>Notes</th>':''}</tr></thead><tbody>${obs.map(o=>`<tr><td>${fmtDateTime(o.time)}</td><td>${o.present===false?'Not observed: ':''}${escapeHtml(finding(o.findingId)?.label||o.findingId)}</td><td>${escapeHtml(o.severity)}</td>${state.settings.reportNotes?`<td>${escapeHtml(o.notes||'')}</td>`:''}</tr>`).join('')||'<tr><td colspan="4">No observations</td></tr>'}</tbody></table>
  ${state.settings.reportUrgency?`<h3>Current deterministic urgency flags</h3>${alerts.length?`<ul>${alerts.map(a=>`<li><strong>${escapeHtml(a.title)}:</strong> ${escapeHtml(a.message)}</li>`).join('')}</ul>`:'<p>No active urgency rules at report generation time.</p>'}`:''}
  ${state.settings.reportModel?`<h3>Top relative condition-pattern scores</h3><table><thead><tr><th>Condition pattern</th><th>Family</th><th>Score</th></tr></thead><tbody>${model.slice(0,15).map(h=>`<tr><td>${escapeHtml(h.label)}</td><td>${escapeHtml(h.family||'')}</td><td>${(h.score*100).toFixed(1)}%</td></tr>`).join('')}</tbody></table><p><strong>Important:</strong> These normalized Bayesian scores are generated by a non-validated heuristic model and are not disease probabilities, diagnoses, or rule-outs. The library includes an Other / unmodeled condition reserve.</p>`:''}
  <p class="report-muted">This report is an owner-generated record intended to help communicate observations. It does not replace veterinary examination, diagnosis, or treatment.</p></article>`;
}
function renderSettingsPage(){
  return `<div class="grid two"><div class="card"><div class="card-head"><div><span class="eyebrow">PATIENT</span><h2>Profile</h2></div></div><div class="card-pad"><form id="profileForm"><div class="form-row"><div class="field"><label>Name</label><input name="name" value="${escapeHtml(state.profile.name)}"></div><div class="field"><label>Sex</label><select name="sex"><option value="unknown" ${state.profile.sex==='unknown'?'selected':''}>Unknown / not set</option><option value="female" ${state.profile.sex==='female'?'selected':''}>Female</option><option value="male" ${state.profile.sex==='male'?'selected':''}>Male</option></select></div></div><div class="form-row"><div class="field"><label>Birth date</label><input type="date" name="birthDate" value="${escapeHtml(state.profile.birthDate||'')}"></div><div class="field"><label>Weight</label><input name="weight" placeholder="e.g., 10.4 lb" value="${escapeHtml(state.profile.weight||'')}"></div></div><div class="form-row"><div class="field"><label>Veterinarian</label><input name="vetName" value="${escapeHtml(state.profile.vetName||'')}"></div><div class="field"><label>Vet phone</label><input name="vetPhone" value="${escapeHtml(state.profile.vetPhone||'')}"></div></div><div class="form-actions"><button class="primary">Save profile</button></div></form></div></div>
  <div class="card"><div class="card-head"><div><span class="eyebrow">DATA</span><h2>Backup & portability</h2></div></div><div class="card-pad"><p>Your data is stored in IndexedDB in this browser. Export backups regularly, especially before clearing browser data.</p><div class="form-actions" style="justify-content:flex-start"><button class="ghost" data-export>Export JSON</button><label class="ghost" style="cursor:pointer">Import JSON<input type="file" id="importFile" accept="application/json" hidden></label><button class="secondary" data-demo>Load demo episode</button></div><div class="divider"></div><button class="danger" data-reset>Reset local data</button></div></div></div>
  <div class="card section-gap"><div class="card-head"><div><span class="eyebrow">KNOWLEDGE PACK</span><h2>${escapeHtml(knowledge.packId)}</h2></div><span class="chip">${escapeHtml(knowledge.modelStatus)}</span></div><div class="card-pad"><p>${escapeHtml(knowledge.modelNotice)}</p><h3>Coverage</h3><p><strong>${knowledge.coverage?.namedConditionCount||knowledge.hypotheses.length} named condition patterns</strong> + Other / unmodeled reserve · ${knowledge.coverage?.findingCount||knowledge.findings.length} owner-observable findings · ${knowledge.coverage?.familyCount||new Set(knowledge.hypotheses.map(h=>h.family)).size} families.</p><p>${escapeHtml(knowledge.coverage?.scope||'')}</p><p class="helper">${escapeHtml(knowledge.coverage?.priorPolicy||'')}</p><h3>Knowledge & urgency provenance</h3><ul class="source-list">${knowledge.sources.map(s=>`<li><a href="${s.url}" target="_blank" rel="noreferrer">${escapeHtml(s.name)}</a> — ${escapeHtml(s.role)}</li>`).join('')}</ul><p class="helper">The cited veterinary references support representative condition/sign relationships and emergency red-flag examples. They do <strong>not</strong> validate the numeric Bayesian priors or likelihood weights in this experimental pack.</p></div></div>`;
}

function bindLogForm(form){
  if(!form) return;
  form.addEventListener('submit',async e=>{
    e.preventDefault(); const fd=new FormData(form); const data={findingId:fd.get('findingId'),present:fd.get('present')==='true',time:new Date(fd.get('time')).toISOString(),severity:fd.get('severity'),notes:fd.get('notes').trim()};
    if(editingObservationId){ const o=state.observations.find(x=>x.id===editingObservationId); Object.assign(o,data); }
    else state.observations.push({id:uid(),episodeId:state.settings.activeEpisodeId,...data});
    await save(); editingObservationId=null; closeModal(); toast('Observation saved'); setView(currentView==='log'?'dashboard':currentView);
  });
}
function bindRenderedActions(){
  $$('[data-viewgo]').forEach(b=>b.onclick=()=>setView(b.dataset.viewgo));
  $$('[data-edit-obs]').forEach(b=>b.onclick=()=>openObservationModal(b.dataset.editObs));
  $$('[data-log-finding]').forEach(b=>b.onclick=()=>openObservationModal(null,b.dataset.logFinding));
  $$('[data-quick-answer]').forEach(b=>b.onclick=async()=>{state.observations.push({id:uid(),episodeId:state.settings.activeEpisodeId,findingId:b.dataset.finding,present:b.dataset.quickAnswer==='yes',time:new Date().toISOString(),severity:'medium',notes:'Logged from next-best observation prompt.'});await save();toast('Observation added');render();});
  $$('[data-episode]').forEach(b=>b.onclick=async()=>{state.settings.activeEpisodeId=b.dataset.episode;await save();render();updateEpisodeButton();});
  $$('[data-new-episode]').forEach(b=>b.onclick=openEpisodeModal);
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
  $('#modalEyebrow').textContent=obs?'EDIT OBSERVATION':'OBSERVATION'; $('#modalTitle').textContent=obs?'Edit observation':'Log observation';
  $('#modalBody').innerHTML=logFormHtml(obs,'modalObservationForm');
  if(presetFinding) $('#modalObservationForm [name=findingId]').value=presetFinding;
  $('#modalBackdrop').classList.remove('hidden'); bindLogForm($('#modalObservationForm'));
  $$('[data-delete-obs]',$('#modalBody')).forEach(b=>b.onclick=()=>deleteObservation(b.dataset.deleteObs));
}
function closeModal(){ $('#modalBackdrop').classList.add('hidden'); editingObservationId=null; }
async function deleteObservation(id){ if(!confirm('Delete this observation?')) return; state.observations=state.observations.filter(o=>o.id!==id);await save();closeModal();toast('Observation deleted');render(); }
function openEpisodeModal(){
  $('#modalEyebrow').textContent='EPISODE';$('#modalTitle').textContent='Start new episode';
  $('#modalBody').innerHTML=`<form id="episodeForm"><div class="field"><label>Episode title</label><input name="title" value="Episode ${state.episodes.length+1}" required></div><div class="field"><label>Start</label><input type="datetime-local" name="start" value="${nowLocalInput()}" required></div><label class="checkbox"><input type="checkbox" name="closeCurrent" checked> Close the current episode when this one starts</label><div class="form-actions"><button class="primary">Start episode</button></div></form>`;
  $('#modalBackdrop').classList.remove('hidden');
  $('#episodeForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const start=new Date(fd.get('start')).toISOString();if(fd.get('closeCurrent')){const cur=activeEpisode();cur.status='closed';cur.end=start;}const ep={id:uid(),title:fd.get('title').trim(),start,end:null,status:'open'};state.episodes.push(ep);state.settings.activeEpisodeId=ep.id;await save();closeModal();updateEpisodeButton();render();};
}
async function saveProfile(e){e.preventDefault();const fd=new FormData(e.target);['name','sex','birthDate','weight','vetName','vetPhone'].forEach(k=>state.profile[k]=fd.get(k));await save();toast('Profile saved');}
function exportJson(){const blob=new Blob([JSON.stringify({app:'Bayesian Symptom Tracker',appVersion:APP_VERSION,exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`bayesian-symptom-tracker-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);}
async function importJson(e){const file=e.target.files[0];if(!file)return;try{const obj=JSON.parse(await file.text());const incoming=obj.state||obj;if(!incoming.profile||!Array.isArray(incoming.observations)||!Array.isArray(incoming.episodes))throw new Error('Unrecognized backup format');state=incoming;await save();updateEpisodeButton();toast('Backup imported');render();}catch(err){alert(`Import failed: ${err.message}`);}e.target.value='';}
async function resetData(){if(!confirm('Reset all local symptom tracker data in this browser? Export a backup first if needed.'))return;state=defaultState();await save();updateEpisodeButton();toast('Local data reset');setView('dashboard');}
async function loadDemo(){
  const ep={id:uid(),title:'Demo: GI episode',start:new Date(Date.now()-9*36e5).toISOString(),end:null,status:'open'};
  const demo=[
    ['food_change',true,-9,'medium','New wet-food flavor introduced at dinner.'],
    ['vomit_single',true,-6.5,'medium','Vomited food once after eating.'],
    ['vomit_repeated',true,-5.5,'high','Two additional vomiting episodes within about an hour.'],
    ['energy_low',true,-4.5,'medium','Quieter than usual and resting more.'],
    ['urine_normal',true,-3,'medium','Normal-size urine clump observed.'],
    ['appetite_reduced',true,-1.5,'medium','Ate about one-quarter of usual portion.']
  ];
  const cur=activeEpisode(); if(cur){cur.status='closed';cur.end=ep.start;} state.episodes.push(ep); state.settings.activeEpisodeId=ep.id;
  demo.forEach(([fid,p,h,sev,note])=>state.observations.push({id:uid(),episodeId:ep.id,findingId:fid,present:p,time:new Date(Date.now()+h*36e5).toISOString(),severity:sev,notes:note}));
  await save();updateEpisodeButton();toast('Demo episode loaded');setView('dashboard');
}
function updateEpisodeButton(){ const ep=activeEpisode(); $('#episodeButton').textContent=ep?`${ep.title} ▾`:'Episode ▾'; }
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2200);}

async function init(){
  try{
    knowledge=await fetch('./data/cat-knowledge-v0.3.json').then(r=>{if(!r.ok)throw new Error('Knowledge pack failed to load');return r.json();});
    state=await dbGet('state') || defaultState();
    const hadState=await dbGet('state');
    state.settings ||= {};
    state.settings.modelPack=knowledge.packId;
    if(!hadState || hadState.settings?.modelPack!==knowledge.packId) await save();
    updateEpisodeButton(); render();
    $$('#nav button').forEach(b=>b.onclick=()=>setView(b.dataset.view));
    $('#quickLog').onclick=()=>openObservationModal(); $('#episodeButton').onclick=()=>setView('timeline');
    $('#closeModal').onclick=closeModal; $('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal();};
    $('#mobileMenu').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
    if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }catch(err){ $('#appContent').innerHTML=`<div class="notice danger"><strong>App failed to start.</strong> ${escapeHtml(err.message)}. Serve this folder through a web server rather than opening index.html directly.</div>`; console.error(err); }
}
init();
