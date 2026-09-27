import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';
const assert=(c,m)=>{if(!c)throw new Error(m)};
let code=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'\n');
const k=JSON.parse(fs.readFileSync(new URL('../data/cat-knowledge-v0.8.json',import.meta.url),'utf8'));
const ctx={console,crypto:crypto.webcrypto,setTimeout,clearTimeout,structuredClone,Intl,Date,Math,JSON,Map,Set,URL,Blob};vm.createContext(ctx);vm.runInContext(code,ctx);const run=s=>vm.runInContext(s,ctx);run(`knowledge=${JSON.stringify(k)};`);
run(`state=migrateState({schemaVersion:3,pets:[{id:'p',name:'Cat',species:'cat',sex:'male',birthDate:'2020-01-01'}],episodes:[{id:'e',petId:'p',title:'Old',start:'2025-01-01T00:00:00Z',end:null,status:'open'}],observations:[],clinicalMeasurements:[],diets:[],settings:{activePetId:'p',activeEpisodeId:'e'}});`);
assert(run('state.schemaVersion')===10,'state schema v10');assert(run('Array.isArray(state.diagnoses)'),'diagnoses created');assert(run('Array.isArray(state.treatments)'),'treatments created');assert(run('Array.isArray(state.studies)'),'studies created');assert(run('Array.isArray(state.outcomes)'),'reference outcomes created');assert(run('Array.isArray(state.workupEvents)'),'workup events created');assert(run('Array.isArray(state.episodes[0].linkedEpisodeIds)'),'episode links created');assert(['live','retrospective'].includes(run('state.episodes[0].trackingMode')),'tracking mode created');assert(run('state.episodes[0].monitoringCadence')==='standard','monitoring cadence created');assert(run("['latest_evidence','current_time','analysis_cutoff'].includes(state.episodes[0].entryDateMode)"),'entry date mode created');assert(run("['all_evidence','as_of'].includes(state.episodes[0].analysisMode)"),'analysis mode created');assert(run('state.episodes[0].advanceReplayOnSave')===true,'replay advance preference created');assert(run(`state.settings.validationScope`)==='all_pets','validation scope created');
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
assert(run(`studyFormHtml(null)`).includes('Pleural effusion identified'),'structured pleural-effusion finding discoverable in diagnostic study form');
const historyHtml=run(`renderHistoryPage()`);assert(historyHtml.includes('data-add-diagnosis')&&historyHtml.includes('data-link-episode')&&historyHtml.includes('data-add-outcome')&&historyHtml.includes('data-add-workup'),'history UI exposes diagnosis, linked-episode, workup, and reference-outcome controls');
const modelHtml=run(`renderModelPage()`);assert(modelHtml.includes('Derived evidence contribution')&&modelHtml.includes('Inference architecture')&&modelHtml.includes('CASE REPLAY / EVIDENCE SCOPE'),'model UI exposes inference audit and replay controls');
const monitoringHtml=run(`renderMonitoringPage()`);assert(monitoringHtml.includes('REASSESSMENT QUEUE')&&monitoringHtml.includes('NEW INFORMATION'),'monitoring UI exposes reassessment and new-information lanes');
console.log('PASS migration to state schema v10');
console.log('PASS diet/treatment/narrative-study context isolation');
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



// v0.10 differential workup is a separate, explicit clinical-narrowing layer.
run(`state={...defaultState(),pets:[{id:'wp',name:'WorkupCat',species:'cat',sex:'female',birthDate:'2018-01-01',weight:'',breed:'',neuterStatus:'unknown',bodyConditionScore:'',vetName:'',vetPhone:''}],episodes:[],observations:[],clinicalMeasurements:[],diets:[],diagnoses:[],treatments:[],studies:[],outcomes:[],workupEvents:[],settings:{...defaultState().settings,activePetId:'wp'}};const we=makeEpisode('wp','Workup case','2025-01-01T00:00:00Z');we.id='we';we.trackingMode='retrospective';state.episodes=[we];state.settings.activeEpisodeId='we';state.observations=[{id:'wo',episodeId:'we',findingId:'weight_loss',status:'present',present:true,time:'2025-01-02T00:00:00Z',severity:'medium',confidence:'high',notes:''}];`);
const workupBase=run(`infer().map(x=>x.score).join(',')`);
run(`state.workupEvents.push({id:'wr',petId:'wp',episodeId:'we',conditionId:'chronic_kidney_disease',customLabel:'',status:'ruled_out',time:'2025-01-03T00:00:00Z',source:'specialist',certainty:'high',useInModel:false,strength:'strong',basisType:'none',basisId:'',rationale:'demo',notes:''})`);
assert(run(`infer().map(x=>x.score).join(',')`)===workupBase,'record-only workup does not change inference');
run(`state.workupEvents[0].useInModel=true`);const constrainedCkd=run(`infer().find(x=>x.id==='chronic_kidney_disease').score`), unconstrainedCkd=run(`infer(modelEvidence(),{applyWorkup:false}).find(x=>x.id==='chronic_kidney_disease').score`);assert(constrainedCkd<unconstrainedCkd,'explicit ruled-out constraint suppresses mapped condition');
assert(run(`workupAdjustments().chronic_kidney_disease.factor`)===.18,'strong ruled-out factor applied transparently');
// A later workup state replaces, rather than multiplies, an earlier status for the same condition.
run(`state.workupEvents.push({id:'wr2',petId:'wp',episodeId:'we',conditionId:'chronic_kidney_disease',customLabel:'',status:'under_consideration',time:'2025-01-04T00:00:00Z',source:'veterinarian',certainty:'medium',useInModel:false,strength:'moderate',basisType:'none',basisId:'',rationale:'reopened',notes:''})`);assert(run(`workupAdjustments().chronic_kidney_disease.factor`)===1,'latest workup state supersedes earlier constraint');
// Replay excludes future workup milestones.
run(`state.episodes[0].analysisMode='as_of';state.episodes[0].analysisCutoff='2025-01-03T12:00:00Z'`);assert(run(`analysisEpisodeWorkupEvents().length`)===1,'future workup milestone excluded by replay cutoff');assert(run(`workupAdjustments().chronic_kidney_disease.factor`)===.18,'as-of analysis restores earlier in-scope workup constraint');
run(`state.episodes[0].analysisMode='all_evidence'`);
// Clinical workup from a linked prior episode never silently constrains the current episode.
run(`const wold=makeEpisode('wp','Prior workup','2024-01-01T00:00:00Z');wold.id='wold';state.episodes.push(wold);state.workupEvents.push({id:'old-w',petId:'wp',episodeId:'wold',conditionId:'diabetes_mellitus',status:'ruled_out',time:'2024-01-02T00:00:00Z',source:'veterinarian',certainty:'high',useInModel:true,strength:'definitive',basisType:'none',basisId:'',rationale:'old episode',notes:''});state.episodes.find(e=>e.id==='we').linkedEpisodeIds=['wold']`);assert(run(`workupAdjustments().diabetes_mellitus.factor`)===1,'linked prior-episode workup does not become current constraint');
const differentialHtml=run(`renderDifferentialPage()`);assert(differentialHtml.includes('MODEL BEFORE WORKUP')&&differentialHtml.includes('CURRENT DIFFERENTIAL')&&differentialHtml.includes('DIAGNOSTIC JOURNEY'),'differential workspace renders evidence-only and clinical-narrowing layers');
console.log('PASS differential-workup separation, replay isolation, and explicit constraints');

// v0.9 cohort validation evaluates mapped outcomes without leaking labels into inference.
run(`state={...defaultState(),pets:[{id:'vp',name:'Validator',species:'cat',sex:'male',birthDate:'2019-01-01',weight:'',breed:'',neuterStatus:'unknown',bodyConditionScore:'',vetName:'',vetPhone:''}],episodes:[],observations:[],clinicalMeasurements:[],diets:[],diagnoses:[],treatments:[],studies:[],outcomes:[],settings:{...defaultState().settings,activePetId:'vp',validationScope:'all_pets'}};const ve=makeEpisode('vp','Validation case','2025-01-01T00:00:00Z');ve.id='ve';ve.trackingMode='retrospective';ve.analysisMode='all_evidence';state.episodes=[ve];state.settings.activeEpisodeId='ve';state.observations=[
{id:'v1',episodeId:'ve',findingId:'thirst_increased',status:'present',present:true,time:'2025-01-02T12:00:00Z',severity:'high',confidence:'high',notes:''},
{id:'v2',episodeId:'ve',findingId:'urine_increased',status:'present',present:true,time:'2025-01-03T12:00:00Z',severity:'high',confidence:'high',notes:''},
{id:'v3',episodeId:'ve',findingId:'weight_loss',status:'present',present:true,time:'2025-01-04T12:00:00Z',severity:'high',confidence:'high',notes:''},
{id:'vfuture',episodeId:'ve',findingId:'hindlimb_weakness',status:'present',present:true,time:'2025-02-10T12:00:00Z',severity:'high',confidence:'high',notes:''}
];state.clinicalMeasurements=[{id:'vg',petId:'vp',episodeId:'ve',templateId:'blood_glucose',time:'2025-01-05T12:00:00Z',value:'400',unit:'mg/dL',refLow:'',refHigh:'',interpretation:'high',source:'vet_lab',confidence:'high',useInModel:true,notes:''}];state.outcomes=[{id:'vo',petId:'vp',episodeId:'ve',conditionId:'diabetes_mellitus',customLabel:'',date:'2025-01-06',certainty:'confirmed',source:'veterinarian',evaluationCutoff:'',strictDiagnosisBlind:true,hiddenDuringReplay:false,notes:''}];`);
const validationInferenceBefore=run(`infer().map(x=>x.score).join(',')`);
const validationActiveBefore=run(`state.settings.activePetId+'|'+state.settings.activeEpisodeId`);
const vr=run(`validationResultForOutcome(state.outcomes[0],state.episodes[0],{maxPoints:50})`);
assert(vr.status==='evaluated','mapped visible outcome is evaluable');
assert(vr.cutoff.startsWith('2025-01-05'),'default validation cutoff uses latest evidence on/before outcome date');
assert(vr.trajectory.every(x=>new Date(x.time)<=new Date(vr.cutoff)),'validation trajectory excludes future evidence');
assert(Number.isFinite(vr.finalRank)&&vr.finalRank>=1,'validation final rank computed');
assert(run(`infer().map(x=>x.score).join(',')`)===validationInferenceBefore,'validation calculation does not mutate current inference');assert(run(`state.settings.activePetId+'|'+state.settings.activeEpisodeId`)===validationActiveBefore,'validation calculation restores active pet and episode');
// A diagnosis recorded on the evaluation day is conservatively blinded from the validation prior.
run(`state.diagnoses=[{id:'same-day-dx',petId:'vp',conditionId:'diabetes_mellitus',status:'confirmed_active',date:'2025-01-05',source:'veterinarian',useInModel:true,notes:''}]`);
const strictRank=run(`validationResultForOutcome(state.outcomes[0],state.episodes[0]).finalRank`);
run(`state.outcomes[0].strictDiagnosisBlind=false`);
const permissiveRank=run(`validationResultForOutcome(state.outcomes[0],state.episodes[0]).finalRank`);
assert(permissiveRank<=strictRank,'allowing same-day diagnosis prior cannot make its mapped outcome rank worse in this audit case');
run(`state.outcomes[0].strictDiagnosisBlind=true;state.diagnoses=[];state.workupEvents=[{id:'answer-workup',petId:'vp',episodeId:'ve',conditionId:'diabetes_mellitus',status:'confirmed',time:'2025-01-05T12:00:00Z',source:'specialist',certainty:'high',useInModel:true,strength:'definitive',basisType:'none',basisId:'',rationale:'same-time answer',notes:''}]`);const strictWorkupRank=run(`validationResultForOutcome(state.outcomes[0],state.episodes[0]).finalRank`);run(`state.outcomes[0].strictDiagnosisBlind=false`);const permissiveWorkupRank=run(`validationResultForOutcome(state.outcomes[0],state.episodes[0]).finalRank`);assert(permissiveWorkupRank<=strictWorkupRank,'strict validation blindness excludes confirming workup answer at cutoff');run(`state.outcomes[0].strictDiagnosisBlind=true;state.workupEvents=[]`);
// Blinded saved replay cases are excluded from aggregate cohort metrics.
run(`state.episodes[0].analysisMode='as_of';state.episodes[0].analysisCutoff='2025-01-04T23:59:00Z';state.outcomes[0].hiddenDuringReplay=true`);
const blindedCohort=run(`validationCohort()`);assert(blindedCohort.metrics.n===0&&blindedCohort.blinded===1,'blinded outcome excluded from cohort metrics');
run(`state.episodes[0].analysisMode='all_evidence';state.outcomes[0].hiddenDuringReplay=true`);
const cohort=run(`validationCohort()`);assert(cohort.metrics.n===1&&cohort.evaluated[0].finalRank===run('validationResultForOutcome(state.outcomes[0],state.episodes[0]).finalRank'),'visible mapped outcome enters cohort metrics');
assert(run(`validationCsv()`).includes('model_only_rank')&&run(`validationCsv()`).includes('combined_rank'),'validation CSV export contains separate model-only and combined rank metrics');
const validationHtml=run(`renderValidationPage()`);assert(validationHtml.includes('BLINDED CASE LIBRARY')&&validationHtml.includes('combined top-5')&&validationHtml.includes('model-only top-5')&&validationHtml.includes('ACTIVE CASE VALIDATION'),'validation workspace renders cohort and case detail');
console.log('PASS v0.10 blinded cohort validation metrics, diagnosis/workup answer isolation');


// v0.10.1 dashboard compact monitoring and temporal-integrity display.
run(`state={...defaultState(),pets:[{id:'ui-p',name:'UI Cat',species:'cat',sex:'unknown',birthDate:'',weight:'',breed:'',neuterStatus:'unknown',bodyConditionScore:'',vetName:'',vetPhone:''}],episodes:[],observations:[],clinicalMeasurements:[],diets:[],diagnoses:[],treatments:[],studies:[],outcomes:[],workupEvents:[],settings:{...defaultState().settings,activePetId:'ui-p'}};const ue=makeEpisode('ui-p','UI episode',new Date(Date.now()-24*36e5).toISOString());ue.id='ui-e';ue.trackingMode='live';state.episodes=[ue];state.settings.activeEpisodeId='ui-e';state.observations=[{id:'ui-old',episodeId:'ui-e',findingId:'cough',status:'present',present:true,time:'2015-09-26T23:40:00Z',severity:'medium',confidence:'high',notes:''}];`);
const compactQueueHtml=run(`renderMonitoringQueue(monitoringCandidates().slice(0,1),{compact:true})`);assert(compactQueueHtml.includes('monitor-list compact'),'compact dashboard monitoring queue has dedicated stacked-layout hook');
const uiDash=run(`renderDashboard()`);assert(uiDash.includes('Check episode dates.'),'dashboard surfaces temporal integrity warning when evidence predates episode start');assert(uiDash.includes('Evidence begins')&&uiDash.includes('2015'),'historical timestamp displays its year');const uiModel=run(`renderModelPage()`);assert(uiModel.includes('data-condition-search')&&uiModel.includes('pleural effusion'),'model condition library exposes searchable discoverability');
console.log('PASS v0.10.3 compact monitoring/date integrity, structured diagnostic-study UI, and install surface');
