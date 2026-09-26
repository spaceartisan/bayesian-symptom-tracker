import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';
const assert=(c,m)=>{if(!c)throw new Error(m)};
let code=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'\n');
const k=JSON.parse(fs.readFileSync(new URL('../data/cat-knowledge-v0.5.json',import.meta.url),'utf8'));
const ctx={console,crypto:crypto.webcrypto,setTimeout,clearTimeout,structuredClone,Intl,Date,Math,JSON,Map,Set,URL,Blob};vm.createContext(ctx);vm.runInContext(code,ctx);const run=s=>vm.runInContext(s,ctx);run(`knowledge=${JSON.stringify(k)};`);
run(`state=migrateState({schemaVersion:3,pets:[{id:'p',name:'Cat',species:'cat',sex:'male',birthDate:'2020-01-01'}],episodes:[{id:'e',petId:'p',title:'Old',start:'2025-01-01T00:00:00Z',end:null,status:'open'}],observations:[],clinicalMeasurements:[],diets:[],settings:{activePetId:'p',activeEpisodeId:'e'}});`);
assert(run('state.schemaVersion')===4,'state schema v4');assert(run('Array.isArray(state.diagnoses)'),'diagnoses created');assert(run('Array.isArray(state.episodes[0].linkedEpisodeIds)'),'episode links created');
// Diet remains context only.
run(`state.observations=[{id:'o',episodeId:'e',findingId:'weight_loss',present:true,time:'2025-01-02T00:00:00Z',severity:'medium',confidence:'high',notes:''}];`);const before=run(`infer().map(x=>x.score).join(',')`);run(`state.diets.push({id:'d',petId:'p',product:'food',startDate:'2025-01-01',endDate:'',nutrientBasis:'as_fed',carbs:'1'})`);const after=run(`infer().map(x=>x.score).join(',')`);assert(before===after,'diet not inferential');
// Prior diagnoses are explicit and opt-in.
const base=run(`infer().find(x=>x.id==='chronic_kidney_disease').score`);run(`state.diagnoses.push({id:'dx',petId:'p',conditionId:'chronic_kidney_disease',status:'confirmed_active',date:'2024-01-01',source:'veterinarian',useInModel:true,notes:''})`);const boosted=run(`infer().find(x=>x.id==='chronic_kidney_disease').score`);assert(boosted>base,'confirmed diagnosis changes prior context');
// Linked episodes are separate until explicitly linked.
run(`state.diagnoses=[]; const old=makeEpisode('p','Prior','2024-01-01T00:00:00Z');old.id='old';state.episodes.push(old);state.observations.push({id:'old-o',episodeId:'old',findingId:'thirst_increased',present:true,time:'2024-01-02T00:00:00Z',severity:'high',confidence:'high',notes:''});`);assert(!run(`modelEvidence().some(e=>e.sourceScope==='linked')`),'history not auto-linked');run(`state.episodes.find(e=>e.id==='e').linkedEpisodeIds=['old']`);const hist=run(`modelEvidence().filter(e=>e.sourceScope==='linked')`);assert(hist.length===1&&hist[0].weight<1,'linked history enters at reduced weight');
// Episode bounds support retrospective repair.
run(`state.observations.push({id:'oldest',episodeId:'e',findingId:'energy_low',present:true,time:'2023-12-01T00:00:00Z',severity:'medium',confidence:'high',notes:''})`);assert(run(`episodeEvidenceBounds(state.episodes.find(e=>e.id==='e')).first`).startsWith('2023-12-01'),'evidence bounds use raw dates');
const historyHtml=run(`renderHistoryPage()`);assert(historyHtml.includes('data-add-diagnosis')&&historyHtml.includes('data-link-episode'),'history UI exposes diagnosis and linked-episode controls');
const modelHtml=run(`renderModelPage()`);assert(modelHtml.includes('Derived evidence contribution')&&modelHtml.includes('Inference architecture'),'model UI exposes inference audit');
console.log('PASS migration to state schema v4');
console.log('PASS diet context isolation');
console.log('PASS diagnosis prior context');
console.log('PASS optional linked-history evidence');
console.log('PASS retrospective episode-date bounds');
