import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const appPath=new URL('../app.js',import.meta.url);
let code=fs.readFileSync(appPath,'utf8').replace(/\ninit\(\);\s*$/,'\n');
const knowledge=JSON.parse(fs.readFileSync(new URL('../data/cat-knowledge-v0.4.json',import.meta.url),'utf8'));
const context={console,crypto:crypto.webcrypto,setTimeout,clearTimeout,structuredClone,Intl,Date,Math,JSON,Map,Set,URL,Blob};
vm.createContext(context);
vm.runInContext(code,context,{filename:'app.js'});
const run=src=>vm.runInContext(src,context);
run(`knowledge=${JSON.stringify(knowledge)};`);
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};

// Legacy single-profile state must migrate in place and gain v0.4 arrays/settings.
run(`state=migrateState({schemaVersion:1,profile:{name:'Boötes',sex:'male',weight:'11.5'},episodes:[{id:'legacy-ep',title:'Old illness',start:'2021-01-01T00:00:00.000Z',end:null,status:'open'}],observations:[{id:'o1',episodeId:'legacy-ep',findingId:'appetite_reduced',present:true,time:'2021-01-01T01:00:00.000Z',severity:'medium',notes:''}],settings:{activeEpisodeId:'legacy-ep'}});`);
assert(run(`state.schemaVersion`)===3,'State should migrate to schema v3');
assert(run(`state.pets.length`)===1,'Legacy profile should become one pet');
assert(run(`state.pets[0].name`)==='Boötes','Legacy pet name must survive migration');
assert(run(`state.episodes[0].petId===state.pets[0].id`),'Legacy episode must be assigned to migrated pet');
assert(run(`state.observations[0].confidence`)==='high','Legacy observations should receive a default confidence');
assert(run(`Array.isArray(state.clinicalMeasurements)&&Array.isArray(state.diets)`),'Migration should create clinical and diet arrays');

// Add a second pet and make sure every data class stays isolated.
run(`(() => { const p=makePet({name:'Luna'}); const e=makeEpisode(p.id,'Luna episode','2026-01-01T00:00:00.000Z'); state.pets.push(p); state.episodes.push(e); state.observations.push({id:'luna-o',episodeId:e.id,findingId:'appetite_increased',present:true,time:'2026-01-01T01:00:00.000Z',severity:'medium',confidence:'high',notes:''}); state.clinicalMeasurements.push({id:'luna-c',petId:p.id,episodeId:e.id,templateId:'blood_glucose',time:'2026-01-01T01:30:00.000Z',value:'300',unit:'mg/dL',refLow:'70',refHigh:'150',interpretation:'high',source:'vet_lab',confidence:'high',useInModel:true,notes:''}); state.diets.push({id:'luna-d',petId:p.id,brand:'Test',product:'Wet food',form:'wet',startDate:'2025-12-01',endDate:'',nutrientBasis:'as_fed',moisture:'78',protein:'10',fiber:'1',carbs:'3',phosphorus:'0.2',phosphorusUnit:'percent'}); state.settings.activePetId=p.id; state.settings.activeEpisodeId=e.id; })()`);
assert(run(`activePet().name`)==='Luna','Second pet should become active');
assert(run(`episodeObservations().length`)===1,'Luna should see only Luna episode observations');
assert(run(`episodeClinicalMeasurements().length`)===1,'Luna should see only Luna clinical result');
assert(run(`petDiets().length`)===1,'Luna should see only Luna diet');
assert(run(`modelEvidence().some(e=>e.findingId==='blood_glucose_high')`),'Mapped high blood glucose should become clinical model evidence');
run(`state.settings.activePetId=state.pets[0].id; state.settings.activeEpisodeId=petEpisodes()[0].id;`);
assert(run(`activePet().name`)==='Boötes','Switch back should restore first pet');
assert(run(`episodeObservations().every(o=>o.id!=='luna-o')`),'Second pet observation must not leak');
assert(run(`episodeClinicalMeasurements().every(m=>m.id!=='luna-c')`),'Second pet clinical result must not leak');
assert(run(`petDiets().every(d=>d.id!=='luna-d')`),'Second pet diet must not leak');

// Diet records are context only and must not change inference.
const beforeDiet=run(`infer().map(x=>x.score).join(',')`);
run(`state.diets.push({id:'ctx',petId:state.settings.activePetId,product:'Very low carb',form:'wet',startDate:'2020-01-01',endDate:'',nutrientBasis:'as_fed',moisture:'80',protein:'12',fiber:'1',carbs:'1',phosphorus:'0.2',phosphorusUnit:'percent'});`);
const afterDiet=run(`infer().map(x=>x.score).join(',')`);
assert(beforeDiet===afterDiet,'Diet context must not alter Bayesian inference');

// Normal clinical result is stored but should not become automatic negative model evidence.
run(`state.clinicalMeasurements.push({id:'normal-c',petId:state.settings.activePetId,episodeId:state.settings.activeEpisodeId,templateId:'creatinine',time:'2021-01-01T02:00:00.000Z',value:'1.2',unit:'mg/dL',refLow:'0.8',refHigh:'2.4',interpretation:'normal',confidence:'high',useInModel:true,notes:''});`);
assert(!run(`modelEvidence().some(e=>e.id==='clinical:normal-c')`),'Normal clinical values should remain context, not automatic rule-out evidence');

// Confidence should soften otherwise-identical owner evidence.
run(`state.observations=[{id:'hi',episodeId:state.settings.activeEpisodeId,findingId:'appetite_increased',present:true,time:'2021-01-01T03:00:00.000Z',severity:'medium',confidence:'high',notes:''}]; state.clinicalMeasurements=[];`);
const high=run(`infer()[0].score`);
run(`state.observations.find(o=>o.id==='hi').confidence='low';`);
const low=run(`infer()[0].score`);
assert(Number.isFinite(high)&&Number.isFinite(low)&&high!==low,'Changing confidence must change evidence strength');

// Context UI and report should expose both new data classes.
run(`state.diets=[{id:'r-d',petId:state.settings.activePetId,brand:'Example',product:'Pâté',form:'wet',startDate:'2020-01-01',endDate:'',nutrientBasis:'as_fed',moisture:'78',protein:'10',fat:'5',fiber:'1',carbs:'3',phosphorus:'0.25',phosphorusUnit:'percent',notes:''}]; state.clinicalMeasurements=[{id:'r-c',petId:state.settings.activePetId,episodeId:state.settings.activeEpisodeId,templateId:'total_t4',time:'2021-01-01T04:00:00.000Z',value:'8',unit:'µg/dL',refLow:'1',refHigh:'4',interpretation:'high',confidence:'high',useInModel:true,notes:''}];`);
const contextHtml=run(`renderContextPage()`);
assert(contextHtml.includes('data-add-clinical')&&contextHtml.includes('data-add-diet'),'Context screen should expose add controls');
const report=run(`reportHtml()`);
assert(report.includes('Clinical measurements / test results'),'Report should include clinical section');
assert(report.includes('Diet context overlapping episode'),'Report should include diet section');
assert(run(`nutrientDisplay(state.diets[0],'protein')`).includes('DM'),'As-fed nutrients with moisture should display a calculated dry-matter equivalent');

console.log('PASS legacy migration to state schema v3');
console.log('PASS multi-pet isolation across observations, clinical results, and diets');
console.log('PASS clinical evidence mapping and conservative normal-result handling');
console.log('PASS diet context remains non-inferential');
console.log('PASS context/report rendering and nutrient conversion');
