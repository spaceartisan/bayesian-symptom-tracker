import fs from 'node:fs';
const k=JSON.parse(fs.readFileSync(new URL('../data/cat-knowledge-v0.2.json',import.meta.url),'utf8'));
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};
const ids=new Set(k.findings.map(f=>f.id));

const byId=Object.fromEntries(k.findings.map(f=>[f.id,f]));
assert(byId.appetite_increased,'Knowledge pack must include increased appetite');
assert(byId.urine_increased,'Knowledge pack must include increased urine volume');
assert(byId.urine_reduced,'Knowledge pack must include reduced urine volume');
assert(byId.appetite_normal.stateGroup==='appetite_state' && byId.appetite_increased.stateGroup==='appetite_state','Appetite direction states must share one state group');
assert(byId.urine_normal.stateGroup==='urine_volume_state' && byId.urine_increased.stateGroup==='urine_volume_state' && byId.urine_reduced.stateGroup==='urine_volume_state','Urine-volume states must share one state group');
assert(Math.abs(k.hypotheses.reduce((s,h)=>s+h.prior,0)-1)<1e-9,'Hypothesis priors must sum to 1');
for(const [hid,map] of Object.entries(k.likelihoods)){
  assert(k.hypotheses.some(h=>h.id===hid),`Unknown hypothesis in likelihoods: ${hid}`);
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
  return k.hypotheses.map(h=>({id:h.id,score:ex[h.id]/z})).sort((a,b)=>b.score-a.score);
}
function alerts(obs){
  const latest=new Map(); obs.forEach(o=>latest.set(o.findingId,o));
  return k.urgencyRules.filter(r=>{const vals=r.findings.map(id=>latest.get(id)?.present===true);return r.match==='all'?vals.every(Boolean):vals.some(Boolean)});
}
const base=infer();
assert(Math.abs(base.reduce((s,h)=>s+h.score,0)-1)<1e-12,'Posterior must normalize to 1');
const urinary=infer([{findingId:'urine_none',present:true,severity:'high'}]);
assert(urinary[0].id==='urinary','Unable-to-urinate pattern should rank urinary first in heuristic model');

const metabolic=infer([
  {findingId:'appetite_increased',present:true,severity:'medium'},
  {findingId:'urine_increased',present:true,severity:'medium'},
  {findingId:'thirst_increased',present:true,severity:'medium'},
  {findingId:'weight_loss',present:true,severity:'medium'}
]);
assert(metabolic[0].id==='metabolic_endocrine','Increased appetite + urine/thirst + weight loss should rank the broad metabolic/endocrine pattern first in the heuristic model');
assert(alerts([{findingId:'urine_none',present:true}]).some(a=>a.level==='emergency'),'Unable to urinate must trigger emergency rule');
assert(alerts([{findingId:'vomit_repeated',present:true},{findingId:'energy_low',present:true}]).some(a=>a.id==='repeated_vomit_low_energy'),'Repeated vomiting + lethargy must trigger combined urgent rule');
assert(!alerts([{findingId:'urine_none',present:true},{findingId:'urine_none',present:false}]).some(a=>a.id==='urinary_block'),'Later explicit negative finding must clear direct urinary-block alert');
console.log('PASS knowledge integrity');
console.log('PASS posterior normalization');
console.log('PASS directional-state coverage');
console.log('PASS heuristic ranking sanity');
console.log('PASS deterministic urgency rules');
