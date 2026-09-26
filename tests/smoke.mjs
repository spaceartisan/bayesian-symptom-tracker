import fs from 'node:fs';
const k=JSON.parse(fs.readFileSync(new URL('../data/cat-knowledge-v0.3.json',import.meta.url),'utf8'));
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};
const ids=new Set(k.findings.map(f=>f.id));
const hids=new Set(k.hypotheses.map(h=>h.id));
const sourceIds=new Set(k.sources.map(s=>s.id));
const byId=Object.fromEntries(k.findings.map(f=>[f.id,f]));

assert(k.schemaVersion===3,'Expected schema version 3');
assert(k.hypotheses.length>=80,'Practical differential library should contain at least 80 hypotheses');
assert(k.coverage.namedConditionCount>=75,'Practical differential library should contain at least 75 named conditions');
assert(k.findings.length>=90,'Expanded tracker should contain at least 90 findings');
assert(hids.has('other_unmodeled'),'Knowledge pack must reserve an Other / unmodeled hypothesis');
assert(hids.has('hyperthyroidism') && hids.has('diabetes_mellitus') && hids.has('fip') && hids.has('hypertrophic_cardiomyopathy'),'Core feline differentials must be represented');

for(const id of ['appetite_increased','appetite_reduced','appetite_absent','urine_increased','urine_reduced','thirst_increased','thirst_decreased','energy_increased','weight_gain','weight_loss']) assert(byId[id],`Missing directional finding ${id}`);
assert(byId.appetite_normal.stateGroup==='appetite_state' && byId.appetite_increased.stateGroup==='appetite_state','Appetite states must share one state group');
assert(byId.urine_normal.stateGroup==='urine_volume_state' && byId.urine_increased.stateGroup==='urine_volume_state' && byId.urine_reduced.stateGroup==='urine_volume_state','Urine-volume states must share one state group');
assert(byId.thirst_normal.stateGroup==='thirst_state' && byId.thirst_increased.stateGroup==='thirst_state' && byId.thirst_decreased.stateGroup==='thirst_state','Thirst states must share one state group');
assert(byId.energy_normal.stateGroup==='energy_state' && byId.energy_increased.stateGroup==='energy_state','Energy states must share one state group');
assert(byId.weight_stable.stateGroup==='weight_state' && byId.weight_loss.stateGroup==='weight_state' && byId.weight_gain.stateGroup==='weight_state','Weight states must share one state group');

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
for(const r of k.urgencyRules) for(const fid of r.findings) assert(ids.has(fid),`Urgency rule ${r.id} references unknown finding ${fid}`);

function infer(obs=[]){
  const count={}; const logs={};
  k.hypotheses.forEach(h=>logs[h.id]=Math.log(h.prior));
  for(const o of obs){
    const n=count[o.findingId]||0; count[o.findingId]=n+1;
    const w=Math.pow(.5,n)*(o.severity==='high'?1.15:o.severity==='low'?.9:1);
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
function O(...ids){return ids.map(findingId=>({findingId,present:true,severity:'medium'}));}
function alerts(obs){
  const latest=new Map(); obs.forEach(o=>latest.set(o.findingId,o));
  return k.urgencyRules.filter(r=>{const vals=r.findings.map(id=>latest.get(id)?.present===true);return r.match==='all'?vals.every(Boolean):vals.some(Boolean)});
}

const base=infer();
assert(Math.abs(base.reduce((s,h)=>s+h.score,0)-1)<1e-12,'Posterior must normalize to 1');
assert(rankOf('hyperthyroidism',O('appetite_increased','weight_loss','thirst_increased','urine_increased','energy_increased'))===1,'Classic hyperthyroid pattern should rank hyperthyroidism first');
assert(rankOf('diabetes_mellitus',O('thirst_increased','urine_increased','weight_loss','appetite_increased','hindlimb_weakness'))<=2,'Classic diabetes pattern should rank diabetes in top 2');
assert(rankOf('fip',O('fever_high','weight_loss','energy_low','appetite_reduced','abd_distended'))===1,'Classic FIP pattern should rank FIP first');
assert(rankOf('urethral_obstruction',O('urine_none','urine_straining','vocalization','acute_onset','pain_severe'))===1,'Urinary obstruction pattern should rank urethral obstruction first');
assert(rankOf('hepatic_lipidosis',O('anorexia_2d','appetite_absent','weight_loss','yellow_gums','energy_low'))===1,'Hepatic lipidosis pattern should rank first');
assert(rankOf('ibd_chronic_enteropathy',O('chronic_course','vomit_repeated','stool_diarrhea','weight_loss'))<=3,'Chronic IBD pattern should rank IBD in top 3');
assert(rankOf('congestive_heart_failure',O('resp_rapid','resp_distress','open_mouth_breathing','energy_low'))<=2,'CHF pattern should rank CHF in top 2');

assert(alerts(O('urine_none')).some(a=>a.level==='emergency'),'Unable to urinate must trigger emergency rule');
assert(alerts(O('hindlimb_paralysis')).some(a=>a.id==='thromboembolism'),'Sudden hind-limb paralysis must trigger vascular emergency rule');
assert(alerts(O('vomit_repeated','energy_low')).some(a=>a.id==='repeated_vomit_low_energy'),'Repeated vomiting + lethargy must trigger combined urgent rule');
assert(!alerts([{findingId:'urine_none',present:true},{findingId:'urine_none',present:false}]).some(a=>a.id==='urinary_block'),'Later explicit negative finding must clear direct urinary-block alert');

console.log(`PASS knowledge integrity: ${k.coverage.namedConditionCount} named conditions + reserve, ${k.findings.length} findings`);
console.log('PASS posterior normalization');
console.log('PASS directional-state coverage');
console.log('PASS canonical differential ranking scenarios');
console.log('PASS deterministic urgency rules');
