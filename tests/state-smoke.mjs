import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';
const assert=(c,m)=>{if(!c)throw new Error(m)};
let code=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'\n');
const k=JSON.parse(fs.readFileSync(new URL('../data/cat-knowledge-v0.6.json',import.meta.url),'utf8'));
const ctx={console,crypto:crypto.webcrypto,setTimeout,clearTimeout,structuredClone,Intl,Date,Math,JSON,Map,Set,URL,Blob};vm.createContext(ctx);vm.runInContext(code,ctx);const run=s=>vm.runInContext(s,ctx);run(`knowledge=${JSON.stringify(k)};`);
run(`state=migrateState({schemaVersion:3,pets:[{id:'p',name:'Cat',species:'cat',sex:'male',birthDate:'2020-01-01'}],episodes:[{id:'e',petId:'p',title:'Old',start:'2025-01-01T00:00:00Z',end:null,status:'open'}],observations:[],clinicalMeasurements:[],diets:[],settings:{activePetId:'p',activeEpisodeId:'e'}});`);
assert(run('state.schemaVersion')===5,'state schema v5');assert(run('Array.isArray(state.diagnoses)'),'diagnoses created');assert(run('Array.isArray(state.treatments)'),'treatments created');assert(run('Array.isArray(state.studies)'),'studies created');assert(run('Array.isArray(state.episodes[0].linkedEpisodeIds)'),'episode links created');
// Diet remains context only.
run(`state.observations=[{id:'o',episodeId:'e',findingId:'weight_loss',present:true,time:'2025-01-02T00:00:00Z',severity:'medium',confidence:'high',notes:''}];`);const before=run(`infer().map(x=>x.score).join(',')`);run(`state.diets.push({id:'d',petId:'p',product:'food',startDate:'2025-01-01',endDate:'',nutrientBasis:'as_fed',carbs:'1'})`);const after=run(`infer().map(x=>x.score).join(',')`);assert(before===after,'diet not inferential');
run(`state.treatments.push({id:'tx',petId:'p',episodeId:'e',name:'therapy',type:'medication',start:'2025-01-02T00:00:00Z',response:'improved'});state.studies.push({id:'st',petId:'p',episodeId:'e',type:'ultrasound',time:'2025-01-03T00:00:00Z',interpretation:'abnormal',summary:'demo'})`);const afterContext=run(`infer().map(x=>x.score).join(',')`);assert(before===afterContext,'treatment/study context not inferential');
// Prior diagnoses are explicit and opt-in.
const base=run(`infer().find(x=>x.id==='chronic_kidney_disease').score`);run(`state.diagnoses.push({id:'dx',petId:'p',conditionId:'chronic_kidney_disease',status:'confirmed_active',date:'2024-01-01',source:'veterinarian',useInModel:true,notes:''})`);const boosted=run(`infer().find(x=>x.id==='chronic_kidney_disease').score`);assert(boosted>base,'confirmed diagnosis changes prior context');
// Linked episodes are separate until explicitly linked.
run(`state.diagnoses=[]; const old=makeEpisode('p','Prior','2024-01-01T00:00:00Z');old.id='old';state.episodes.push(old);state.observations.push({id:'old-o',episodeId:'old',findingId:'thirst_increased',present:true,time:'2024-01-02T00:00:00Z',severity:'high',confidence:'high',notes:''});`);assert(!run(`modelEvidence().some(e=>e.sourceScope==='linked')`),'history not auto-linked');run(`state.episodes.find(e=>e.id==='e').linkedEpisodeIds=['old']`);const hist=run(`modelEvidence().filter(e=>e.sourceScope==='linked')`);assert(hist.length===1&&hist[0].weight<1,'linked history enters at reduced weight');
// Episode bounds support retrospective repair.
run(`state.observations.push({id:'oldest',episodeId:'e',findingId:'energy_low',present:true,time:'2023-12-01T00:00:00Z',severity:'medium',confidence:'high',notes:''})`);assert(run(`episodeEvidenceBounds(state.episodes.find(e=>e.id==='e')).first`).startsWith('2023-12-01'),'evidence bounds use raw dates');
assert(run(`episodeAnalysisStart(state.episodes.find(e=>e.id==='e'))`).startsWith('2023-12-01'),'analysis start automatically respects earlier retrospective evidence');
const legacyStatus=run(`migrateState({schemaVersion:4,pets:[{id:'q',name:'Legacy',species:'cat'}],episodes:[{id:'qe',petId:'q',title:'Old',start:'2025-01-01T00:00:00Z',status:'open'}],observations:[{id:'qo',episodeId:'qe',findingId:'weight_loss',present:true,time:'2025-01-01T01:00:00Z'}],clinicalMeasurements:[],diets:[],diagnoses:[],settings:{activePetId:'q',activeEpisodeId:'qe'}}).observations[0].status`);assert(legacyStatus==='present','legacy observation status migrated');
const contextHtml=run(`renderContextPage()`);assert(contextHtml.includes('data-add-treatment')&&contextHtml.includes('data-add-study')&&contextHtml.includes('LONGITUDINAL TRENDS'),'context UI exposes trends, treatments and studies');
const historyHtml=run(`renderHistoryPage()`);assert(historyHtml.includes('data-add-diagnosis')&&historyHtml.includes('data-link-episode'),'history UI exposes diagnosis and linked-episode controls');
const modelHtml=run(`renderModelPage()`);assert(modelHtml.includes('Derived evidence contribution')&&modelHtml.includes('Inference architecture'),'model UI exposes inference audit');
console.log('PASS migration to state schema v5');
console.log('PASS diet/treatment/study context isolation');
console.log('PASS diagnosis prior context');
console.log('PASS optional linked-history evidence');
console.log('PASS retrospective episode-date bounds');
// Urgency age is based on the triggering finding, not unrelated newer context.
run(`state.observations=[{id:'u-old',episodeId:'e',findingId:'urine_none',present:true,status:'present',time:'2025-01-01T00:00:00Z',severity:'high',confidence:'high',notes:''}];state.studies=[{id:'st-new',petId:'p',episodeId:'e',type:'ultrasound',time:new Date().toISOString(),interpretation:'normal',summary:'new unrelated study'}];`);
assert(run(`urgencyAlerts()[0].triggerTime`).startsWith('2025-01-01'),'urgency carries trigger time');
assert(run(`urgencyIsHistorical(urgencyAlerts()[0])`)===true,'old urgent finding remains historical despite newer context');
// Numeric trends never combine unlike units.
run(`state.clinicalMeasurements=[
{id:'w1',petId:'p',episodeId:'e',templateId:'body_weight',time:'2025-01-01T00:00:00Z',value:'10',unit:'lb',confidence:'high',useInModel:true},
{id:'w2',petId:'p',episodeId:'e',templateId:'body_weight',time:'2025-01-10T00:00:00Z',value:'9.5',unit:'lb',confidence:'high',useInModel:true},
{id:'w3',petId:'p',episodeId:'e',templateId:'body_weight',time:'2025-01-20T00:00:00Z',value:'4.1',unit:'kg',confidence:'high',useInModel:true}
];`);
assert(run(`quantitativeTrendEvidence().length`)===0,'mixed units cannot create a numeric trend');
run(`state.clinicalMeasurements.push({id:'w4',petId:'p',episodeId:'e',templateId:'body_weight',time:'2025-01-20T00:00:00Z',value:'9.0',unit:'lb',confidence:'high',useInModel:true})`);
assert(run(`quantitativeTrendEvidence().some(e=>e.findingId==='weight_loss'&&e.unit==='lb')`),'same-unit series can derive trend evidence');
console.log('PASS urgency trigger-time aging');
console.log('PASS unit-safe quantitative trends');
