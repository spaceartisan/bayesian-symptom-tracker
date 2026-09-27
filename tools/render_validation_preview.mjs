import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';
let code=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'\n');
const k=JSON.parse(fs.readFileSync(new URL('../data/cat-knowledge-v0.7.json',import.meta.url),'utf8'));
const ctx={console,crypto:crypto.webcrypto,setTimeout,clearTimeout,structuredClone,Intl,Date,Math,JSON,Map,Set,URL,Blob};vm.createContext(ctx);vm.runInContext(code,ctx);
vm.runInContext(`knowledge=${JSON.stringify(k)};state=defaultState();state.pets[0]={...state.pets[0],id:'demo-pet',name:'Atlas',sex:'male',birthDate:'2018-04-12'};state.settings.activePetId='demo-pet';state.episodes=[];state.observations=[];state.clinicalMeasurements=[];state.outcomes=[];state.diagnoses=[];state.treatments=[];state.studies=[];
const e1=makeEpisode('demo-pet','Winter metabolic episode','2025-01-01T00:00:00Z');e1.id='e1';e1.trackingMode='retrospective';e1.analysisMode='all_evidence';
const e2=makeEpisode('demo-pet','Spring renal episode','2025-04-01T00:00:00Z');e2.id='e2';e2.trackingMode='retrospective';e2.analysisMode='all_evidence';state.episodes=[e1,e2];state.settings.activeEpisodeId='e1';
state.observations=[
{id:'a1',episodeId:'e1',findingId:'thirst_increased',status:'present',present:true,time:'2025-01-02T12:00:00Z',severity:'high',confidence:'high',notes:''},
{id:'a2',episodeId:'e1',findingId:'urine_increased',status:'present',present:true,time:'2025-01-03T12:00:00Z',severity:'high',confidence:'high',notes:''},
{id:'a3',episodeId:'e1',findingId:'weight_loss',status:'present',present:true,time:'2025-01-05T12:00:00Z',severity:'high',confidence:'high',notes:''},
{id:'b1',episodeId:'e2',findingId:'thirst_increased',status:'present',present:true,time:'2025-04-02T12:00:00Z',severity:'medium',confidence:'high',notes:''},
{id:'b2',episodeId:'e2',findingId:'appetite_reduced',status:'present',present:true,time:'2025-04-04T12:00:00Z',severity:'medium',confidence:'high',notes:''},
{id:'b3',episodeId:'e2',findingId:'weight_loss',status:'present',present:true,time:'2025-04-06T12:00:00Z',severity:'medium',confidence:'high',notes:''}
];
state.clinicalMeasurements=[
{id:'g1',petId:'demo-pet',episodeId:'e1',templateId:'blood_glucose',time:'2025-01-06T12:00:00Z',value:'385',unit:'mg/dL',refLow:'',refHigh:'',interpretation:'high',source:'vet_lab',confidence:'high',useInModel:true,notes:''},
{id:'c1',petId:'demo-pet',episodeId:'e2',templateId:'creatinine',time:'2025-04-07T12:00:00Z',value:'3.1',unit:'mg/dL',refLow:'0.8',refHigh:'2.4',interpretation:'high',source:'vet_lab',confidence:'high',useInModel:true,notes:''},
{id:'s1',petId:'demo-pet',episodeId:'e2',templateId:'sdma',time:'2025-04-07T12:05:00Z',value:'25',unit:'µg/dL',refLow:'0',refHigh:'14',interpretation:'high',source:'vet_lab',confidence:'high',useInModel:true,notes:''}
];
state.outcomes=[
{id:'o1',petId:'demo-pet',episodeId:'e1',conditionId:'diabetes_mellitus',customLabel:'',date:'2025-01-07',certainty:'confirmed',source:'veterinarian',evaluationCutoff:'',strictDiagnosisBlind:true,hiddenDuringReplay:false,notes:''},
{id:'o2',petId:'demo-pet',episodeId:'e2',conditionId:'chronic_kidney_disease',customLabel:'',date:'2025-04-08',certainty:'confirmed',source:'veterinarian',evaluationCutoff:'',strictDiagnosisBlind:true,hiddenDuringReplay:false,notes:''}
];state.settings.validationScope='all_pets';`,ctx);
const content=vm.runInContext('renderValidationPage()',ctx);const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const html=`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>body{overflow:auto}h1,h2,h3,strong{color:#edf4ff}button{color:#dce8f5}.app-shell{min-height:100vh}.sidebar{position:fixed}.app-shell main{margin-left:215px}.topbar{position:static}.content{max-width:1450px}</style></head><body><div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">B</div><div><strong>Bayesian</strong><span>Symptom Tracker</span></div></div><nav><button><span>◫</span> Dashboard</button><button><span>◎</span> Monitoring</button><button><span>∿</span> Model</button><button class="active"><span>✓</span> Validation</button><button><span>⚙</span> Settings</button></nav></aside><main><header class="topbar"><div><h1>Validation</h1><p>Evaluate blinded historical cases without feeding outcomes back into inference.</p></div><div class="top-actions"><button class="ghost">Atlas ▾</button><button class="ghost">Winter metabolic episode ▾</button></div></header><section class="content">${content}</section></main></div></body></html>`;
fs.writeFileSync(new URL('../docs/validation-preview.html',import.meta.url),html);
