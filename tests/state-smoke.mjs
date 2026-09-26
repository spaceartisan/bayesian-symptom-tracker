import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const appPath=new URL('../app.js',import.meta.url);
let code=fs.readFileSync(appPath,'utf8').replace(/\ninit\(\);\s*$/,'\n');
const knowledge=JSON.parse(fs.readFileSync(new URL('../data/cat-knowledge-v0.3.json',import.meta.url),'utf8'));
const context={console,crypto:crypto.webcrypto,setTimeout,clearTimeout,structuredClone,Intl,Date,Math,JSON,Map,Set,URL,Blob};
vm.createContext(context);
vm.runInContext(code,context,{filename:'app.js'});
const run=src=>vm.runInContext(src,context);
run(`knowledge=${JSON.stringify(knowledge)};`);
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};

// Legacy single-profile state must migrate in place to one pet and retain its episode.
run(`state=migrateState({schemaVersion:1,profile:{name:'Boötes',sex:'male',weight:'11.5'},episodes:[{id:'legacy-ep',title:'Old illness',start:'2021-01-01T00:00:00.000Z',end:null,status:'open'}],observations:[{id:'o1',episodeId:'legacy-ep',findingId:'appetite_reduced',present:true,time:'2021-01-01T01:00:00.000Z',severity:'medium',notes:''}],settings:{activeEpisodeId:'legacy-ep'}});`);
assert(run(`state.schemaVersion`)===2,'State should migrate to schema v2');
assert(run(`state.pets.length`)===1,'Legacy profile should become one pet');
assert(run(`state.pets[0].name`)==='Boötes','Legacy pet name must survive migration');
assert(run(`state.episodes[0].petId===state.pets[0].id`),'Legacy episode must be assigned to migrated pet');
assert(run(`state.observations[0].confidence`)==='high','Legacy observations should receive a default confidence');

// Add a second pet and make sure episode evidence stays isolated.
run(`(() => { const p=makePet({name:'Luna'}); const e=makeEpisode(p.id,'Luna episode','2026-01-01T00:00:00.000Z'); state.pets.push(p); state.episodes.push(e); state.observations.push({id:'luna-o',episodeId:e.id,findingId:'appetite_increased',present:true,time:'2026-01-01T01:00:00.000Z',severity:'medium',confidence:'high',notes:''}); state.settings.activePetId=p.id; state.settings.activeEpisodeId=e.id; })()`);
assert(run(`activePet().name`)==='Luna','Second pet should become active');
assert(run(`episodeObservations().length`)===1,'Luna should see only Luna episode observations');
run(`state.settings.activePetId=state.pets[0].id; state.settings.activeEpisodeId=petEpisodes()[0].id;`);
assert(run(`activePet().name`)==='Boötes','Switch back should restore first pet');
assert(run(`episodeObservations().every(o=>o.id!=='luna-o')`),'Second pet observation must not leak into first pet inference');

// Confidence should soften otherwise-identical evidence.
run(`state.settings.activePetId=state.pets[1].id; state.settings.activeEpisodeId=petEpisodes()[0].id;`);
run(`state.observations=state.observations.filter(o=>o.episodeId!==state.settings.activeEpisodeId);`);
run(`state.observations.push({id:'hi',episodeId:state.settings.activeEpisodeId,findingId:'appetite_increased',present:true,time:'2026-01-01T01:00:00.000Z',severity:'medium',confidence:'high',notes:''});`);
const high=run(`infer()[0].score`);
run(`state.observations.find(o=>o.id==='hi').confidence='low';`);
const low=run(`infer()[0].score`);
assert(Number.isFinite(high)&&Number.isFinite(low),'Inference must remain finite with confidence weights');
assert(high!==low,'Changing confidence must change posterior evidence strength');


// Rendered HTML should expose multi-pet controls and the corrected import control.
const settingsHtml=run(`renderSettingsPage()`);
assert(settingsHtml.includes('data-add-pet'),'Settings should expose Add pet');
assert(settingsHtml.includes('button-like ghost-like'),'Import JSON should render with button styling');
const report=run(`reportHtml()`);
assert(report.includes('<th>Confidence</th>'),'Report should include observation confidence');

console.log('PASS legacy single-pet migration');
console.log('PASS multi-pet episode isolation');
console.log('PASS observation confidence affects inference');
console.log('PASS multi-pet settings/report rendering');
