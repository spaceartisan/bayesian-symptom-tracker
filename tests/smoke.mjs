import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';
const assert=(c,m)=>{if(!c)throw new Error(m)};
const k=JSON.parse(fs.readFileSync(new URL('../data/cat-knowledge-v0.5.json',import.meta.url),'utf8'));
const ids=new Set(k.findings.map(f=>f.id)), hids=new Set(k.hypotheses.map(h=>h.id)), src=new Set(k.sources.map(s=>s.id));
assert(k.schemaVersion===5,'knowledge schema v5');assert(k.hypotheses.length>=90,'broad condition library');assert(hids.has('other_unmodeled'),'reserve hypothesis');
for(const h of k.hypotheses)for(const sid of h.sourceRefs||[])assert(src.has(sid),`bad source ${sid}`);
for(const [hid,rs] of Object.entries(k.riskModifiers||{})){assert(hids.has(hid),`risk modifier unknown condition ${hid}`);for(const r of rs)assert(src.has(r.sourceRef),`risk modifier source ${r.sourceRef}`)}
for(const t of k.measurementTemplates||[])if(t.quantitativeAnchor)assert(src.has(t.quantitativeAnchor.sourceRef),`anchor source ${t.id}`);

let code=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'\n');
const ctx={console,crypto:crypto.webcrypto,setTimeout,clearTimeout,structuredClone,Intl,Date,Math,JSON,Map,Set,URL,Blob};vm.createContext(ctx);vm.runInContext(code,ctx,{filename:'app.js'});
const run=s=>vm.runInContext(s,ctx);run(`knowledge=${JSON.stringify(k)};state=defaultState();state.pets[0].name='Test';state.pets[0].sex='male';state.pets[0].birthDate='2018-01-01';state.episodes[0].start='2026-01-01T00:00:00.000Z';`);
const setObs=(ids)=>run(`state.observations=${JSON.stringify(ids.map((findingId,i)=>({id:'o'+i,episodeId:'X',findingId,present:true,time:`2026-01-${String(i+1).padStart(2,'0')}T00:00:00.000Z`,severity:'medium',confidence:'high',notes:''})))};state.observations.forEach(o=>o.episodeId=state.settings.activeEpisodeId);state.clinicalMeasurements=[];state.diagnoses=[];state.episodes[0].linkedEpisodeIds=[];`);
const rank=id=>run(`infer().findIndex(x=>x.id==='${id}')+1`);
setObs(['appetite_increased','weight_loss','thirst_increased','urine_increased','energy_increased']);assert(rank('hyperthyroidism')===1,'hyperthyroid scenario');
setObs(['thirst_increased','urine_increased','weight_loss','appetite_increased','hindlimb_weakness']);assert(rank('diabetes_mellitus')<=2,'diabetes scenario');
setObs(['fever_high','weight_loss','energy_low','appetite_reduced','abd_distended']);assert(rank('fip')===1,'FIP scenario');
setObs(['urine_none','urine_straining','vocalization','acute_onset','pain_severe']);assert(rank('urethral_obstruction')===1,'obstruction scenario');
setObs(['resp_rapid','resp_distress','open_mouth_breathing','energy_low']);assert(rank('congestive_heart_failure')<=2,'CHF scenario');
setObs(['appetite_reduced','energy_low','dehydration','abd_pain']);run(`state.clinicalMeasurements=[{id:'p1',petId:state.settings.activePetId,episodeId:state.settings.activeEpisodeId,templateId:'fpl',time:'2026-01-10T00:00:00Z',value:'high',unit:'',refLow:'',refHigh:'',interpretation:'high',source:'vet_lab',confidence:'high',useInModel:true,notes:''}]`);assert(rank('pancreatitis')<=2,'pancreatitis clinical scenario');
run(`state.pets[0].birthDate='2010-01-01';`);setObs(['thirst_increased','urine_increased','weight_loss','appetite_reduced','energy_low']);run(`state.clinicalMeasurements=[{id:'c1',petId:state.settings.activePetId,episodeId:state.settings.activeEpisodeId,templateId:'creatinine',time:'2026-01-10T00:00:00Z',value:'3.2',unit:'mg/dL',refLow:'0.8',refHigh:'2.4',interpretation:'high',source:'vet_lab',confidence:'high',useInModel:true,notes:''},{id:'s1',petId:state.settings.activePetId,episodeId:state.settings.activeEpisodeId,templateId:'sdma',time:'2026-01-10T00:00:00Z',value:'26',unit:'µg/dL',refLow:'0',refHigh:'14',interpretation:'high',source:'vet_lab',confidence:'high',useInModel:true,notes:''}]`);assert(rank('chronic_kidney_disease')===1,'older-cat renal clinical scenario');run(`state.pets[0].birthDate='2018-01-01';`);

// Repeated raw observations become one saturating longitudinal evidence item, not N independent copies.
run(`state.observations=[];for(let i=0;i<20;i++)state.observations.push({id:'r'+i,episodeId:state.settings.activeEpisodeId,findingId:'thirst_increased',present:true,time:new Date(Date.UTC(2026,0,1+i)).toISOString(),severity:'medium',confidence:'high',notes:''});`);
const ev=run(`deriveOwnerEvidence().find(e=>e.findingId==='thirst_increased')`);assert(ev.rawCount===20,'raw count preserved');assert(ev.weight>1&&ev.weight<=k.inferenceConfig.maxTemporalWeight+1e-9,'temporal weight saturates');
// A state change preserves earlier evidence at historical weight instead of deleting it.
run(`state.observations=[{id:'a',episodeId:state.settings.activeEpisodeId,findingId:'appetite_reduced',present:true,time:'2026-01-01T00:00:00Z',severity:'high',confidence:'high',notes:''},{id:'b',episodeId:state.settings.activeEpisodeId,findingId:'appetite_normal',present:true,time:'2026-01-10T00:00:00Z',severity:'medium',confidence:'high',notes:''}];`);
const red=run(`deriveOwnerEvidence().find(e=>e.findingId==='appetite_reduced')`), norm=run(`deriveOwnerEvidence().find(e=>e.findingId==='appetite_normal')`);assert(red&&norm&&red.weight<norm.weight,'prior state becomes historical, current state remains primary');
// Clinical magnitude: 400 mg/dL retains more weight than a barely-above anchor value.
run(`state.clinicalMeasurements=[{id:'g1',petId:state.settings.activePetId,episodeId:state.settings.activeEpisodeId,templateId:'blood_glucose',time:'2026-01-10T00:00:00Z',value:'400',unit:'mg/dL',refLow:'',refHigh:'',interpretation:'high',source:'vet_lab',confidence:'high',useInModel:true,notes:''}];`);
const w400=run(`clinicalEvidence()[0].weight`);run(`state.clinicalMeasurements[0].value='285'`);const w285=run(`clinicalEvidence()[0].weight`);assert(w400>w285,'quantitative magnitude retained');
run(`state.clinicalMeasurements=[];for(let i=0;i<20;i++)state.clinicalMeasurements.push({id:'g'+i,petId:state.settings.activePetId,episodeId:state.settings.activeEpisodeId,templateId:'blood_glucose',time:new Date(Date.UTC(2026,0,1+i)).toISOString(),value:'350',unit:'mg/dL',refLow:'',refHigh:'',interpretation:'high',source:'home',confidence:'high',useInModel:true,notes:''});`);const serial=run(`clinicalEvidence()[0]`);assert(serial.rawCount===20&&serial.weight<=k.inferenceConfig.maxSerialClinicalWeight+1e-9,'serial clinical values saturate rather than multiply independently');
// Current urgency remains deterministic.
run(`state.observations=[{id:'u',episodeId:state.settings.activeEpisodeId,findingId:'urine_none',present:true,time:new Date().toISOString(),severity:'high',confidence:'high',notes:''}];`);assert(run(`urgencyAlerts().some(a=>a.level==='emergency')`),'urinary emergency rule');
console.log('PASS v0.5 knowledge integrity and provenance');
console.log('PASS broad canonical condition scenarios');
console.log('PASS longitudinal temporal aggregation and state transitions');
console.log('PASS quantitative clinical evidence weighting');
console.log('PASS deterministic urgency rules');
