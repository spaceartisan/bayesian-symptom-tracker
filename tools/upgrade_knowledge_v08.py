import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
src=ROOT/'data'/'cat-knowledge-v0.7.json'
out=ROOT/'data'/'cat-knowledge-v0.8.json'
d=json.loads(src.read_text(encoding='utf-8'))
d['packId']='cat-practical-differentials-v0.8'
d['coverage']['scope']='Practical feline differential library combining owner observations, structured clinical measurements, and opt-in structured diagnostic-study findings; not an exhaustive veterinary nosology.'
d['coverage']['inferenceArchitecture']='Raw records → temporal/quantitative summaries → correlation-aware evidence, including explicitly selected structured diagnostic-study findings → clinical/history context → Bayesian pattern scores.'
fid='pleural_effusion_identified'
if not any(f.get('id')==fid for f in d['findings']):
    d['findings'].append({'id':fid,'category':'Clinical · Imaging','label':'Pleural effusion identified','question':'Pleural effusion identified on diagnostic evaluation','sourceType':'clinical','studyEligible':True,'evidenceGroup':'thoracic_effusion'})
d['coverage']['findingCount']=len(d['findings'])
d['coverage']['ownerFindingCount']=len([f for f in d['findings'] if f.get('sourceType','owner')=='owner'])
d['coverage']['clinicalFindingCount']=len([f for f in d['findings'] if f.get('sourceType')=='clinical'])
d['coverage']['studyFindingCount']=len([f for f in d['findings'] if f.get('studyEligible')])
d.setdefault('inferenceConfig',{})['studyEvidenceBaseWeight']=1.45
d['inferenceConfig']['maxStudyEvidenceWeight']=1.95
for hid,val in {
    'pleural_effusion':0.97,
    'congestive_heart_failure':0.88,
    'hypertrophic_cardiomyopathy':0.74,
    'fip':0.74,
    'multicentric_lymphoma':0.74,
}.items():
    if hid in d['likelihoods']:
        d['likelihoods'][hid][fid]=val
sources=d.setdefault('sources',[])
new_sources=[
    {'id':'cornell_pleural_effusion','name':'Cornell Feline Health Center — Lung Ailments: A Widespread Source of Feline Woe','url':'https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/lung-ailments-widespread-source-feline-woe','role':'Feline pleural-effusion causes and respiratory consequences'},
    {'id':'merck_chest_cavity','name':'Merck Veterinary Manual — Disorders of the Chest Cavity of Cats','url':'https://www.merckvetmanual.com/cat-owners/lung-and-airway-disorders-of-cats/disorders-of-the-chest-cavity-of-cats','role':'Pleural-effusion/chest-cavity disorder context'},
]
for s in new_sources:
    if not any(x.get('id')==s['id'] for x in sources): sources.append(s)
for h in d['hypotheses']:
    if h['id']=='pleural_effusion':
        h['sourceRefs']=sorted(set(h.get('sourceRefs') or [])|{'cornell_pleural_effusion','merck_chest_cavity'})
out.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8')
print(f'Wrote {out}')
