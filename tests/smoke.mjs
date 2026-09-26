import fs from 'node:fs';
const k=JSON.parse(fs.readFileSync(new URL('../data/cat-knowledge-v0.4.json',import.meta.url),'utf8'));
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};
const ids=new Set(k.findings.map(f=>f.id));
const hids=new Set(k.hypotheses.map(h=>h.id));
const sourceIds=new Set(k.sources.map(s=>s.id));
const byId=Object.fromEntries(k.findings.map(f=>[f.id,f]));
const templates=Object.fromEntries((k.measurementTemplates||[]).map(t=>[t.id,t]));

assert(k.schemaVersion===4,'Expected knowledge schema version 4');
assert(k.hypotheses.length>=80,'Practical differential library should contain at least 80 hypotheses');
assert(k.coverage.namedConditionCount>=75,'Practical differential library should contain at least 75 named conditions');
assert(k.coverage.ownerFindingCount>=100,'Owner observation vocabulary should remain broad');
assert(k.coverage.clinicalFindingCount>=20,'Clinical evidence vocabulary should contain at least 20 mapped findings');
assert(k.coverage.measurementTemplateCount>=25,'Structured measurement library should contain at least 25 templates');
assert(hids.has('other_unmodeled'),'Knowledge pack must reserve an Other / unmodeled hypothesis');
assert(hids.has('hyperthyroidism') && hids.has('diabetes_mellitus') && hids.has('fip') && hids.has('hypertrophic_cardiomyopathy'),'Core feline differentials must be represented');

for(const id of ['appetite_increased','appetite_reduced','appetite_absent','urine_increased','urine_reduced','thirst_increased','thirst_decreased','energy_increased','weight_gain','weight_loss']) assert(byId[id],`Missing directional finding ${id}`);
for(const id of ['blood_glucose_high','fructosamine_high','creatinine_high','sdma_high','total_t4_high','fpl_high','ntprobnp_high','felv_positive']) assert(byId[id]?.sourceType==='clinical',`Missing clinical finding ${id}`);
for(const id of ['blood_glucose','creatinine','total_t4','urine_glucose','fpl','ntprobnp','custom']) assert(templates[id],`Missing measurement template ${id}`);
assert(byId.appetite_normal.stateGroup==='appetite_state' && byId.appetite_increased.stateGroup==='appetite_state','Appetite states must share one state group');
assert(byId.urine_normal.stateGroup==='urine_volume_state' && byId.urine_increased.stateGroup==='urine_volume_state' && byId.urine_reduced.stateGroup==='urine_volume_state','Urine-volume states must share one state group');

assert(Math.abs(k.hypotheses.reduce((s,h)=>s+h.prior,0)-1)<1e-9,'Hypothesis priors must sum to 1');
for(const h of k.hypotheses){
  assert(h.family,`Hypothesis ${h.id} must have a family`);
  for(const sid of h.sourceRefs||[]) assert(sourceIds.has(sid),`Hypothesis ${h.id} references unknown source ${sid}`);
}
for(const [hid,map] of Object.entries(k.likelihoods)){
  assert(hids.has(hid),`Unknown hypothesis in likelihoods: ${hid}`);
  for(const [fid,p] of Object.entries(map)){
    assert(ids.has(fid),`Unknown finding in likelihood table: ${fid}`);
    assert(p>0 && p<1,`Likelihood must be between 0 and 1: ${hid}/${fid}`);
  }
}
for(const t of k.measurementTemplates||[]) for(const fid of Object.values(t.modelMap||{})) assert(ids.has(fid),`Measurement ${t.id} maps to unknown finding ${fid}`);
for(const r of k.urgencyRules) for(const fid of r.findings) assert(ids.has(fid),`Urgency rule ${r.id} references unknown finding ${fid}`);

function infer(obs=[]){
  const count={}; const logs={};
  k.hypotheses.forEach(h=>logs[h.id]=Math.log(h.prior));
  for(const o of obs){
    const n=count[o.findingId]||0; count[o.findingId]=n+1;
    const w=Math.pow(.5,n)*(o.severity==='high'?1.15:o.severity==='low'?.9:1)*(o.confidence==='low'?.4:o.confidence==='medium'?.72:1);
    for(const h of k.hypotheses){
      const p=Math.min(.97,Math.max(.03,k.likelihoods[h.id]?.[o.findingId]??.5));
      logs[h.id]+=w*Math.log(o.present===false?1-p:p);
    }
  }
  const mx=Math.max(...Object.values(logs));
  const ex=Object.fromEntries(Object.entries(logs).map(([id,v])=>[id,Math.exp(v-mx)]));
  const z=Object.values(ex).reduce((a,b)=>a+b,0);
  return k.hypotheses.map(h=>({id:h.id,label:h.label,score:ex[h.id]/z})).sort((a,b)=>b.score-a.score);
}
function rankOf(id,obs){return infer(obs).findIndex(x=>x.id===id)+1;}
function O(...ids){return ids.map(findingId=>({findingId,present:true,severity:'medium',confidence:'high'}));}
function alerts(obs){
  const latest=new Map(); obs.forEach(o=>latest.set(o.findingId,o));
  return k.urgencyRules.filter(r=>{const vals=r.findings.map(id=>latest.get(id)?.present===true);return r.match==='all'?vals.every(Boolean):vals.some(Boolean)});
}

const base=infer();
assert(Math.abs(base.reduce((s,h)=>s+h.score,0)-1)<1e-12,'Posterior must normalize to 1');
assert(rankOf('hyperthyroidism',O('appetite_increased','weight_loss','thirst_increased','urine_increased','energy_increased'))===1,'Classic hyperthyroid owner pattern should rank hyperthyroidism first');
assert(rankOf('diabetes_mellitus',O('thirst_increased','urine_increased','weight_loss','appetite_increased','hindlimb_weakness'))<=2,'Classic diabetes owner pattern should rank diabetes in top 2');
assert(rankOf('fip',O('fever_high','weight_loss','energy_low','appetite_reduced','abd_distended'))===1,'Classic FIP pattern should rank FIP first');
assert(rankOf('urethral_obstruction',O('urine_none','urine_straining','vocalization','acute_onset','pain_severe'))===1,'Urinary obstruction pattern should rank urethral obstruction first');
assert(rankOf('hepatic_lipidosis',O('anorexia_2d','appetite_absent','weight_loss','yellow_gums','energy_low'))===1,'Hepatic lipidosis pattern should rank first');
assert(rankOf('ibd_chronic_enteropathy',O('chronic_course','vomit_repeated','stool_diarrhea','weight_loss'))<=3,'Chronic IBD pattern should rank IBD in top 3');
assert(rankOf('congestive_heart_failure',O('resp_rapid','resp_distress','open_mouth_breathing','energy_low'))<=2,'CHF pattern should rank CHF in top 2');

// Clinical evidence should discriminate several unrelated systems rather than only one test case.
assert(rankOf('diabetes_mellitus',O('thirst_increased','urine_increased','weight_loss','blood_glucose_high','fructosamine_high','urine_glucose_positive'))===1,'Mapped diabetic clinical evidence should lift diabetes to first');
assert(rankOf('chronic_kidney_disease',O('thirst_increased','urine_increased','weight_loss','creatinine_high','sdma_high','phosphorus_high','urine_specific_gravity_low'))===1,'Mapped renal clinical evidence should lift CKD to first');
assert(rankOf('hyperthyroidism',O('weight_loss','appetite_increased','total_t4_high'))===1,'High T4 plus matching signs should lift hyperthyroidism to first');
assert(rankOf('pancreatitis',O('appetite_reduced','energy_low','fpl_high'))===1,'Elevated fPL plus compatible signs should lift pancreatitis to first');

assert(alerts(O('urine_none')).some(a=>a.level==='emergency'),'Unable to urinate must trigger emergency rule');
assert(alerts(O('hindlimb_paralysis')).some(a=>a.id==='thromboembolism'),'Sudden hind-limb paralysis must trigger vascular emergency rule');
assert(alerts(O('vomit_repeated','energy_low')).some(a=>a.id==='repeated_vomit_low_energy'),'Repeated vomiting + lethargy must trigger combined urgent rule');
assert(!alerts([{findingId:'urine_none',present:true},{findingId:'urine_none',present:false}]).some(a=>a.id==='urinary_block'),'Later explicit negative finding must clear direct urinary-block alert');

console.log(`PASS knowledge integrity: ${k.coverage.namedConditionCount} named conditions + reserve, ${k.coverage.ownerFindingCount} owner findings, ${k.coverage.clinicalFindingCount} clinical findings`);
console.log('PASS posterior normalization');
console.log('PASS owner-observation canonical scenarios');
console.log('PASS broad clinical-evidence scenarios');
console.log('PASS deterministic urgency rules');
