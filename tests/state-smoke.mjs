import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';
const assert=(c,m)=>{if(!c)throw new Error(m)};
let code=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'\n');
const k=JSON.parse(fs.readFileSync(new URL('../data/cat-knowledge-v0.7.json',import.meta.url),'utf8'));
const ctx={console,crypto:crypto.webcrypto,setTimeout,clearTimeout,structuredClone,Intl,Date,Math,JSON,Map,Set,URL,Blob};vm.createContext(ctx);vm.runInContext(code,ctx);const run=s=>vm.runInContext(s,ctx);run(`knowledge=${JSON.stringify(k)};`);
run(`state=migrateState({schemaVersion:3,pets:[{id:'p',name:'Cat',species:'cat',sex:'male',birthDate:'2020-01-01'}],episodes:[{id:'e',petId:'p',title:'Old',start:'2025-01-01T00:00:00Z',end:null,status:'open'}],observations:[],clinicalMeasurements:[],diets:[],settings:{activePetId:'p',activeEpisodeId:'e'}});`);
assert(run('state.schemaVersion')===8,'state schema v8');assert(run('Array.isArray(state.diagnoses)'),'diagnoses created');assert(run('Array.isArray(state.treatments)'),'treatments created');assert(run('Array.isArray(state.studies)'),'studies created');assert(run('Array.isArray(state.outcomes)'),'reference outcomes created');assert(run('Array.isArray(state.episodes[0].linkedEpisodeIds)'),'episode links created');assert(['live','retrospective'].includes(run('state.episodes[0].trackingMode')),'tracking mode created');assert(run('state.episodes[0].monitoringCadence')==='standard','monitoring cadence created');assert(run("['latest_evidence','current_time','analysis_cutoff'].includes(state.episodes[0].entryDateMode)"),'entry date mode created');assert(run("['all_evidence','as_of'].includes(state.episodes[0].analysisMode)"),'analysis mode created');assert(run('state.episodes[0].advanceReplayOnSave')===true,'replay advance preference created');
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
const historyHtml=run(`renderHistoryPage()`);assert(historyHtml.includes('data-add-diagnosis')&&historyHtml.includes('data-link-episode')&&historyHtml.includes('data-add-outcome'),'history UI exposes diagnosis, linked-episode, and reference-outcome controls');
const modelHtml=run(`renderModelPage()`);assert(modelHtml.includes('Derived evidence contribution')&&modelHtml.includes('Inference architecture')&&modelHtml.includes('CASE REPLAY / EVIDENCE SCOPE'),'model UI exposes inference audit and replay controls');
const monitoringHtml=run(`renderMonitoringPage()`);assert(monitoringHtml.includes('REASSESSMENT QUEUE')&&monitoringHtml.includes('NEW INFORMATION'),'monitoring UI exposes reassessment and new-information lanes');
console.log('PASS migration to state schema v8');
console.log('PASS diet/treatment/study context isolation');
console.log('PASS diagnosis prior context');
console.log('PASS optional linked-history evidence');
console.log('PASS retrospective episode-date bounds');
// Legacy open episodes with evidence far before the recorded episode start migrate to retrospective tracking.
const retro=run(`migrateState({schemaVersion:5,pets:[{id:'r',name:'Retro',species:'cat'}],episodes:[{id:'re',petId:'r',title:'Historical',start:'2026-09-26T00:00:00Z',status:'open'}],observations:[{id:'ro',episodeId:'re',findingId:'thirst_increased',present:true,status:'present',time:'2025-12-01T00:00:00Z',severity:'medium',confidence:'high'}],clinicalMeasurements:[],diets:[],diagnoses:[],treatments:[],studies:[],settings:{activePetId:'r',activeEpisodeId:'re'}})`);assert(retro.episodes[0].trackingMode==='retrospective','historical evidence infers retrospective mode');assert(retro.episodes[0].entryDateMode==='latest_evidence','retrospective migration defaults new entries to latest evidence');
run(`state=${JSON.stringify(retro)};`);assert(run(`episodeMonitoringReference()`).startsWith('2025-12-01'),'retrospective monitoring reference uses latest evidence rather than wall clock');assert(run(`episodeEntryDefaultTime()`).startsWith('2025-12-01'),'retrospective entry default uses latest recorded evidence');
const retroForm=run(`logFormHtml(null,'retroForm')`);assert(retroForm.includes('Use latest episode entry')&&retroForm.includes('2025-12-01T00:00'),'observation form exposes latest-entry date helper and historical default');
assert(run(`clinicalFormHtml(null)`).includes('Use latest episode entry'),'clinical result form exposes historical date helper');assert(run(`treatmentFormHtml(null)`).includes('Use latest episode entry'),'treatment form exposes historical date helper');assert(run(`studyFormHtml(null)`).includes('Use latest episode entry'),'diagnostic study form exposes historical date helper');
const retroScore=run(`infer().map(x=>x.score).join(',')`);run(`state.episodes[0].entryDateMode='current_time'`);const dateModeScore=run(`infer().map(x=>x.score).join(',')`);assert(retroScore===dateModeScore,'entry date default is non-inferential');run(`state.episodes[0].entryDateMode='latest_evidence'`);
// Linked episodes never populate the current monitoring queue.
run(`const prior=makeEpisode('r','Prior','2025-01-01T00:00:00Z');prior.id='prior-monitor';prior.trackingMode='retrospective';state.episodes.push(prior);state.observations.push({id:'prior-thirst',episodeId:'prior-monitor',findingId:'thirst_increased',status:'present',present:true,time:'2025-01-02T00:00:00Z',severity:'high',confidence:'high',notes:''});state.episodes.find(e=>e.id==='re').linkedEpisodeIds=['prior-monitor'];`);assert(!run(`monitoringCandidates().some(x=>x.last.episodeId==='prior-monitor')`),'linked history excluded from current monitoring queue');
// Urgency age is based on the triggering finding, not unrelated newer context.
run(`state.observations=[{id:'u-old',episodeId:state.settings.activeEpisodeId,findingId:'urine_none',present:true,status:'present',time:'2025-01-01T00:00:00Z',severity:'high',confidence:'high',notes:''}];state.studies=[{id:'st-new',petId:state.settings.activePetId,episodeId:state.settings.activeEpisodeId,type:'ultrasound',time:new Date().toISOString(),interpretation:'normal',summary:'new unrelated study'}];`);
assert(run(`urgencyAlerts()[0].triggerTime`).startsWith('2025-01-01'),'urgency carries trigger time');
assert(run(`urgencyIsHistorical(urgencyAlerts()[0])`)===true,'old urgent finding remains historical despite newer context');
// Numeric trends never combine unlike units.
run(`state.clinicalMeasurements=[
{id:'w1',petId:state.settings.activePetId,episodeId:state.settings.activeEpisodeId,templateId:'body_weight',time:'2025-01-01T00:00:00Z',value:'10',unit:'lb',confidence:'high',useInModel:true},
{id:'w2',petId:state.settings.activePetId,episodeId:state.settings.activeEpisodeId,templateId:'body_weight',time:'2025-01-10T00:00:00Z',value:'9.5',unit:'lb',confidence:'high',useInModel:true},
{id:'w3',petId:state.settings.activePetId,episodeId:state.settings.activeEpisodeId,templateId:'body_weight',time:'2025-01-20T00:00:00Z',value:'4.1',unit:'kg',confidence:'high',useInModel:true}
];`);
assert(run(`quantitativeTrendEvidence().length`)===0,'mixed units cannot create a numeric trend');
run(`state.clinicalMeasurements.push({id:'w4',petId:state.settings.activePetId,episodeId:state.settings.activeEpisodeId,templateId:'body_weight',time:'2025-01-20T00:00:00Z',value:'9.0',unit:'lb',confidence:'high',useInModel:true})`);
assert(run(`quantitativeTrendEvidence().some(e=>e.findingId==='weight_loss'&&e.unit==='lb')`),'same-unit series can derive trend evidence');

// Case replay / as-of analysis prevents future evidence leakage while preserving raw records.
run(`state={...defaultState(),pets:[{id:'rp',name:'Replay',species:'cat',sex:'male',birthDate:'2020-01-01',weight:'',breed:'',neuterStatus:'unknown',bodyConditionScore:'',vetName:'',vetPhone:''}],episodes:[],observations:[],clinicalMeasurements:[],diets:[],diagnoses:[],treatments:[],studies:[],settings:{...defaultState().settings,activePetId:'rp'}};const re=makeEpisode('rp','Replay case','2025-11-01T00:00:00Z');re.id='replay';re.trackingMode='retrospective';re.analysisMode='as_of';re.analysisCutoff='2025-11-05T23:59:00Z';re.entryDateMode='analysis_cutoff';state.episodes=[re];state.settings.activeEpisodeId='replay';state.observations=[
{id:'r1',episodeId:'replay',findingId:'thirst_increased',status:'present',present:true,time:'2025-11-02T12:00:00Z',severity:'high',confidence:'high',notes:''},
{id:'r2',episodeId:'replay',findingId:'urine_increased',status:'present',present:true,time:'2025-11-03T12:00:00Z',severity:'high',confidence:'high',notes:''},
{id:'future',episodeId:'replay',findingId:'urine_none',status:'present',present:true,time:'2025-12-01T12:00:00Z',severity:'high',confidence:'high',notes:''}
];state.clinicalMeasurements=[{id:'gfuture',petId:'rp',episodeId:'replay',templateId:'blood_glucose',time:'2025-12-02T12:00:00Z',value:'400',unit:'mg/dL',refLow:'',refHigh:'',interpretation:'high',source:'vet_lab',confidence:'high',useInModel:true,notes:''}];state.diagnoses=[{id:'dxfuture',petId:'rp',conditionId:'diabetes_mellitus',status:'confirmed_active',date:'2025-12-03',source:'veterinarian',useInModel:true,notes:''}];`);
assert(run(`analysisEpisodeObservations().length`)===2,'replay filters future observations');
assert(run(`analysisEpisodeClinicalMeasurements().length`)===0,'replay filters future clinical results');
assert(run(`analysisEvidenceCounts().excluded`)===2,'replay reports excluded future dated records');
assert(!run(`urgencyAlerts().some(a=>a.findings.includes('urine_none'))`),'future urgency finding cannot leak into as-of state');
assert(run(`diagnosisAdjustments().diabetes_mellitus.factor`)===1,'future diagnosis cannot alter as-of prior');
run(`state.diagnoses.push({id:'dxundated',petId:'rp',conditionId:'chronic_kidney_disease',status:'confirmed_active',date:'',source:'veterinarian',useInModel:true,notes:''})`);assert(run(`diagnosisAdjustments().chronic_kidney_disease.factor`)===1,'undated diagnosis cannot leak into strict as-of prior');
const replayBefore=run(`infer().map(x=>x.score).join(',')`);
run(`state.episodes[0].analysisCutoff='2025-12-03T23:59:00Z'`);
assert(run(`analysisEpisodeObservations().length`)===3,'advancing replay includes later observation');
assert(run(`analysisEpisodeClinicalMeasurements().length`)===1,'advancing replay includes later clinical result');
assert(run(`diagnosisAdjustments().diabetes_mellitus.factor`)>1,'advancing replay includes dated diagnosis prior');
const replayAfter=run(`infer().map(x=>x.score).join(',')`);assert(replayAfter!==replayBefore,'advancing replay changes inference only when new evidence becomes in scope');
assert(run(`episodeEntryDefaultTime()`).startsWith('2025-12-03'),'analysis-cutoff entry mode follows replay point');
run(`state.episodes[0].analysisCutoff='2025-11-05T23:59:00Z';state.episodes[0].advanceReplayOnSave=true`);assert(run(`maybeAdvanceReplayCutoff('2025-11-06T12:00:00Z')`)===true,'saving a newer retrospective record can advance replay');assert(run(`episodeAnalysisCutoff()`).startsWith('2025-11-06T12:00'),'replay cutoff advances to saved record time');assert(run(`maybeAdvanceReplayCutoff('2025-11-04T12:00:00Z')`)===false,'older backfilled record does not rewind replay automatically');
run(`state.episodes[0].analysisCutoff='2025-11-05T23:59:00Z'`);
const qBefore=run(`newObservationCandidates(200).some(x=>x.finding.id==='urine_none')`);assert(qBefore,'future observation does not suppress an as-of information-gain question');
const scopeHtml=run(`renderModelPage()`);assert(scopeHtml.includes('Analyzing as of')&&scopeHtml.includes('hidden from analysis'),'replay scope is visible in model UI');
const cutoffBefore=run(`episodeAnalysisCutoff()`);const trajectoryRows=run(`replayTrajectory()`);const trajectoryHtml=run(`renderReplayTrajectory()`);const cutoffAfter=run(`episodeAnalysisCutoff()`);assert(trajectoryHtml.includes('DIFFERENTIAL TRAJECTORY'),'replay trajectory renders');assert(trajectoryRows.every(r=>new Date(r.time).getTime()<=new Date(cutoffBefore).getTime()),'replay trajectory cannot reveal future snapshots');assert(cutoffBefore===cutoffAfter,'trajectory calculation does not mutate saved replay cutoff');
console.log('PASS case replay / as-of evidence isolation');


// Reference outcomes provide blinded validation labels without entering inference.
run(`state={...defaultState(),pets:[{id:'op',name:'OutcomeCat',species:'cat',sex:'female',birthDate:'2018-01-01',weight:'',breed:'',neuterStatus:'unknown',bodyConditionScore:'',vetName:'',vetPhone:''}],episodes:[],observations:[],clinicalMeasurements:[],diets:[],diagnoses:[],treatments:[],studies:[],outcomes:[],settings:{...defaultState().settings,activePetId:'op'}};const oe=makeEpisode('op','Blinded case','2025-01-01T00:00:00Z');oe.id='oe';oe.trackingMode='retrospective';oe.analysisMode='as_of';oe.analysisCutoff='2025-01-10T23:59:00Z';state.episodes=[oe];state.settings.activeEpisodeId='oe';state.observations=[{id:'oo',episodeId:'oe',findingId:'weight_loss',status:'present',present:true,time:'2025-01-05T12:00:00Z',severity:'medium',confidence:'high',notes:''}];`);
const outcomeBaseline=run(`infer().map(x=>x.score).join(',')`);
run(`state.outcomes.push({id:'out-secret',petId:'op',episodeId:'oe',conditionId:'diabetes_mellitus',customLabel:'',date:'2025-02-01',certainty:'confirmed',source:'veterinarian',hiddenDuringReplay:true,notes:'SECRET GROUND TRUTH'});`);
const outcomeAfter=run(`infer().map(x=>x.score).join(',')`);assert(outcomeBaseline===outcomeAfter,'reference outcome cannot change inference');
assert(run(`modelEvidence().every(e=>e.sourceType!=='outcome')`),'reference outcomes never become model evidence');
assert(run(`visibleEpisodeOutcomes().length`)===0,'future hidden reference outcome stays blinded before its date');
const blindedHtml=run(`renderOutcomeEvaluation()`);assert(blindedHtml.includes('Blinded replay')&&!blindedHtml.includes('SECRET GROUND TRUTH'),'blinded outcome UI hides answer and notes');
run(`state.episodes[0].analysisCutoff='2025-02-02T23:59:00Z'`);assert(run(`visibleEpisodeOutcomes().length`)===1,'reference outcome becomes visible after recorded date');assert(run(`outcomeRank(state.outcomes[0],infer())`)>=1,'library reference outcome can report current model rank');const revealedHtml=run(`renderOutcomeEvaluation()`);assert(revealedHtml.includes('Diabetes mellitus')&&revealedHtml.includes('Current rank #'),'revealed reference outcome compares against current model rank');
run(`state.episodes[0].analysisCutoff='2025-01-10T23:59:00Z';state.outcomes[0].hiddenDuringReplay=false`);assert(run(`visibleEpisodeOutcomes().length`)===1,'user can explicitly reveal reference outcome during earlier replay');
const outcomeScoreStill=run(`infer().map(x=>x.score).join(',')`);assert(outcomeScoreStill===outcomeBaseline,'revealing validation label remains non-inferential');
assert(!run(`monitoringCandidates().some(x=>x.finding?.id==='diabetes_mellitus')`),'reference outcomes do not enter monitoring queue');assert(run(`urgencyAlerts().length`)===0,'reference outcome does not create urgency');
console.log('PASS blinded reference-outcome validation labels');

console.log('PASS urgency trigger-time aging');
console.log('PASS unit-safe quantitative trends');
