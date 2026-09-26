import json
from pathlib import Path
src=Path(__file__).resolve().parents[1]/'data'/'cat-knowledge-v0.4.json'
out=Path(__file__).resolve().parents[1]/'data'/'cat-knowledge-v0.5.json'
d=json.load(open(src,encoding='utf-8'))
d['schemaVersion']=5
d['packId']='cat-practical-differentials-v0.5'
d['modelStatus']='experimental / research-oriented, not clinically validated'
d['modelNotice']='Longitudinal, linked-history, demographic and quantitative-clinical evidence model. Scores are relative pattern-consistency values, not diagnostic probabilities.'
d['coverage']['scope']='Practical feline differential library with owner observations, longitudinal evidence summaries, structured clinical measurements, prior diagnoses, linked historical episodes, demographic context, and an explicit unmodeled reserve.'
d['coverage']['priorPolicy']='Base hypothesis priors remain deliberately broad. Small source-backed demographic modifiers and explicit prior-diagnosis modifiers are applied transparently at inference time; these are heuristic context adjustments, not epidemiologic disease probabilities.'
d['inferenceConfig']={
  'ownerEvidenceBaseWeight':1.0,
  'clinicalEvidenceBaseWeight':1.35,
  'linkedHistoryWeight':0.38,
  'historicalStateWeight':0.28,
  'negativeCheckBaseWeight':0.60,
  'maxTemporalWeight':1.65,
  'maxClinicalMagnitudeWeight':1.85,
  'diagnosisModifiers':{
    'confirmed_active':4.0,
    'probable_active':2.2,
    'suspected_active':1.35,
    'confirmed_resolved':1.15,
    'ruled_out':0.25
  }
}
# Add source for chronic course and glucose threshold context.
sources={s['id']:s for s in d['sources']}
if 'merck_diabetes' not in sources:
    d['sources'].append({
      'id':'merck_diabetes','name':'Merck Veterinary Manual — Diabetes Mellitus in Dogs and Cats',
      'url':'https://www.merckvetmanual.com/endocrine-system/the-pancreas/diabetes-mellitus-in-dogs-and-cats',
      'role':'Feline diabetes chronic course, appetite variability, polyuria/polydipsia, and glucose-threshold context'
    })
# Quantitative anchors. They guide magnitude weighting but are not diagnostic cutoffs.
for t in d.get('measurementTemplates',[]):
    if t['id']=='blood_glucose':
        t['quantitativeAnchor']={'direction':'high','value':280,'unit':'mg/dL','sourceRef':'merck_diabetes','role':'renal glucose threshold context; not a diagnostic cutoff'}
    elif t['id']=='sdma':
        t['quantitativeAnchor']={'direction':'high','value':14,'unit':'µg/dL','sourceRef':'iris_ckd','role':'IRIS persistent elevation context; interpret with clinical findings'}
    elif t['id']=='creatinine':
        t['quantitativeAnchor']={'direction':'high','value':1.6,'unit':'mg/dL','sourceRef':'iris_ckd','role':'feline IRIS staging context; stable CKD only'}
# Demographic risk modifiers are intentionally mild and capped.
d['riskModifiers']={
  'chronic_kidney_disease':[
    {'kind':'age_years','op':'gte','value':10,'factor':1.8,'sourceRef':'cornell_ckd','note':'CKD is highly prevalent in cats over 10.'},
    {'kind':'age_years','op':'lt','value':5,'factor':0.55,'sourceRef':'cornell_ckd','note':'Young age lowers, but does not eliminate, CKD consistency.'}
  ],
  'diabetes_mellitus':[
    {'kind':'sex','op':'eq','value':'male','factor':1.18,'sourceRef':'cornell_diabetes','note':'Male sex is a reported risk factor.'},
    {'kind':'age_years','op':'gte','value':10,'factor':1.35,'sourceRef':'cornell_diabetes','note':'Increasing age is a reported risk factor.'},
    {'kind':'age_years','op':'lt','value':5,'factor':0.82,'sourceRef':'cornell_diabetes','note':'Younger age modestly lowers consistency because risk increases with age.'}
  ],
  'hyperthyroidism':[
    {'kind':'age_years','op':'gte','value':10,'factor':1.65,'sourceRef':'cornell_hyperthyroidism','note':'Hyperthyroidism occurs mainly in middle-aged to older cats.'},
    {'kind':'age_years','op':'lt','value':7,'factor':0.45,'sourceRef':'cornell_hyperthyroidism','note':'Young age substantially lowers consistency.'}
  ],
  'feline_idiopathic_cystitis':[
    {'kind':'sex','op':'eq','value':'male','factor':1.12,'sourceRef':'cornell_flutd','note':'Male cats may be at increased lower-urinary-tract risk.'}
  ],
  'urethral_obstruction':[
    {'kind':'sex','op':'eq','value':'male','factor':1.35,'sourceRef':'cornell_flutd','note':'Male anatomy materially increases obstruction risk.'}
  ]
}
# Source-backed corrections to diabetes pattern representation. These are not tuned to a test case.
L=d['likelihoods']['diabetes_mellitus']
L['chronic_course']=0.88
L['appetite_reduced']=0.58
L['energy_low']=0.62
# A single high glucose is supportive but stress hyperglycemia remains an alternative; keep categorical p unchanged.
# Add source ref to hypothesis.
h=next(x for x in d['hypotheses'] if x['id']=='diabetes_mellitus')
h['sourceRefs']=sorted(set(h.get('sourceRefs',[])+['merck_diabetes']))
# Annotate findings with temporal semantics.
state_groups={f['id'] for f in d['findings'] if f.get('stateGroup')}
event_prefixes=('vomit_','stool_blood','stool_black','collapse','seizure','urine_none','urine_blood','nasal_blood','hindlimb_paralysis')
for f in d['findings']:
    if f.get('sourceType')=='clinical':
        f['temporalMode']='clinical'
    elif f.get('stateGroup'):
        f['temporalMode']='state'
    elif f['id'] in ('chronic_course','acute_onset','stress_event','food_change','med_change','toxin_possible','trauma_event','new_cat_exposure'):
        f['temporalMode']='context'
    elif f['id'].startswith(event_prefixes) if False else False:
        pass
    else:
        f['temporalMode']='event'
# Fix event-prefix annotation explicitly.
for f in d['findings']:
    if f.get('sourceType')!='clinical' and not f.get('stateGroup') and f['id'] not in ('chronic_course','acute_onset','stress_event','food_change','med_change','toxin_possible','trauma_event','new_cat_exposure'):
        f['temporalMode']='event'
# Version coverage metadata.
d['coverage']['inferenceArchitecture']='Raw observations are retained. Inference uses derived longitudinal summaries so repeated observations add persistence/recurrence information without being treated as independent duplicates.'
json.dump(d,open(out,'w',encoding='utf-8'),indent=2,ensure_ascii=False)
print(out)
