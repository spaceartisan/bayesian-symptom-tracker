import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'data' / 'cat-knowledge-v0.4.json'

# The numeric values below are intentionally heuristic pattern weights, not
# measured sensitivities/specificities or epidemiologic probabilities.
S = 0.88   # strongly characteristic association in the pattern model
M = 0.74   # moderate association
W = 0.62   # weaker/supporting association
L = 0.38   # somewhat inconsistent
U = 0.24   # notably inconsistent

findings = []
def F(id, category, label, question, state=None, source_type='owner'):
    x = {'id':id,'category':category,'label':label,'question':question}
    if state: x['stateGroup']=state
    if source_type != 'owner': x['sourceType']=source_type
    findings.append(x)

# Directional / state observations
F('appetite_normal','Appetite','Appetite normal','Is appetite currently normal?','appetite_state')
F('appetite_reduced','Appetite','Appetite reduced','Is appetite reduced?','appetite_state')
F('appetite_absent','Appetite','Refusing food','Is the cat refusing food?','appetite_state')
F('appetite_increased','Appetite','Appetite increased','Is appetite clearly increased compared with normal?','appetite_state')
F('thirst_normal','Water','Thirst normal','Is water intake currently normal?','thirst_state')
F('thirst_increased','Water','Increased thirst','Has thirst clearly increased?','thirst_state')
F('thirst_decreased','Water','Decreased thirst','Has water intake clearly decreased?','thirst_state')
F('urine_normal','Urination','Urine volume normal','Is total urine output / litter-clump volume normal?','urine_volume_state')
F('urine_increased','Urination','Urine volume increased / larger clumps','Has urine output or litter-clump volume clearly increased?','urine_volume_state')
F('urine_reduced','Urination','Urine volume reduced / smaller output','Has total urine output clearly decreased?','urine_volume_state')
F('energy_normal','Energy','Energy normal','Is activity / energy normal?','energy_state')
F('energy_low','Energy','Low energy / lethargy','Is energy noticeably reduced?','energy_state')
F('energy_increased','Energy','Increased activity / hyperactivity','Is activity clearly increased or unusually restless?','energy_state')
F('weight_stable','Weight','Weight stable','Has body weight remained stable?','weight_state')
F('weight_loss','Weight','Unplanned weight loss','Has there been unplanned weight loss?','weight_state')
F('weight_gain','Weight','Unplanned weight gain','Has there been unplanned weight gain?','weight_state')
F('stool_normal','Stool','Stool normal','Is stool currently normal?','stool_consistency_state')
F('stool_diarrhea','Stool','Diarrhea / loose stool','Is there diarrhea or loose stool?','stool_consistency_state')
F('stool_hard_dry','Stool','Hard / dry stool','Is stool unusually hard or dry?','stool_consistency_state')

# GI / elimination
F('vomit_single','Vomiting','Single vomiting episode','Was there a single vomiting episode?')
F('vomit_repeated','Vomiting','Repeated vomiting / retching','Has vomiting or retching repeated?')
F('vomit_blood','Vomiting','Blood in vomit','Is there blood in the vomit?')
F('vomit_hairball','Vomiting','Hairball produced','Was a hairball produced or clearly present?')
F('stool_blood','Stool','Fresh blood in stool','Is there fresh blood in the stool?')
F('stool_black','Stool','Black / tarry stool','Is the stool black or tarry?')
F('stool_mucus','Stool','Mucus in stool','Is there visible mucus in the stool?')
F('stool_frequent','Stool','Frequent small bowel movements','Are bowel movements unusually frequent and small?')
F('stool_none','Stool','Little / no stool produced','Has little or no stool been produced despite expected bowel movements?')
F('stool_straining','Stool','Straining to defecate','Is the cat repeatedly straining to pass stool?')
F('abd_pain','Abdomen','Abdominal pain / guarding','Is there apparent abdominal pain or guarding?')
F('abd_distended','Abdomen','Abdominal enlargement / distension','Is the abdomen newly enlarged or distended?')

# Urinary
F('urine_small_frequent','Urination','Frequent small urinations','Are there frequent small urinations?')
F('urine_straining','Urination','Straining to urinate','Is the cat straining to urinate?')
F('urine_none','Urination','Unable to urinate / no urine','Is the cat unable to pass urine?')
F('urine_blood','Urination','Blood in urine','Is there visible blood in the urine?')
F('urine_outside_box','Urination','Urinating outside litter box','Is the cat urinating outside the litter box unusually?')
F('genital_licking','Urination','Increased genital licking','Is genital-area licking increased?')
F('urine_dark','Urination','Dark / brown urine','Is the urine unusually dark or brown?')

# Respiratory / ENT
F('resp_rapid','Breathing','Rapid resting breathing','Is resting breathing clearly faster than usual?')
F('resp_distress','Breathing','Labored / difficult breathing','Is breathing difficult or labored?')
F('open_mouth_breathing','Breathing','Open-mouth breathing / panting','Is there open-mouth breathing or panting?')
F('cough','Breathing','Coughing / hacking','Is there coughing or hacking?')
F('wheeze','Breathing','Wheezing','Is wheezing audible?')
F('sneeze','Nose / airway','Sneezing','Is sneezing increased?')
F('nasal_discharge','Nose / airway','Nasal discharge','Is there nasal discharge?')
F('nasal_blood','Nose / airway','Nosebleed / bloody nasal discharge','Is there blood from the nose?')
F('ocular_discharge','Eyes','Eye discharge / watery eyes','Is there new eye discharge or excessive tearing?')

# General appearance / systemic
F('fever_high','Temperature','Fever / elevated temperature','Is an elevated body temperature documented?','temperature_state')
F('temp_low','Temperature','Low body temperature','Is a low body temperature documented?','temperature_state')
F('dehydration','Hydration','Dehydration signs','Are dehydration signs present?')
F('pale_gums','Appearance','Pale gums / mucous membranes','Do the gums look unusually pale?')
F('yellow_gums','Appearance','Yellow gums / jaundice','Is there yellow discoloration of the gums, skin, or eyes?')
F('blue_gums','Appearance','Blue / gray gums','Are the gums or tongue blue-gray?')
F('poor_coat','Appearance','Poor / unkempt coat','Has the coat become unusually greasy, matted, or unkempt?')
F('enlarged_nodes','Appearance','Enlarged lymph nodes','Are enlarged lymph nodes or persistent swellings known?')
F('weakness','Energy','Generalized weakness','Is there generalized weakness?')
F('collapse','Neurologic','Collapse / unresponsive','Has the cat collapsed or become unresponsive?')
F('hiding','Behavior','Hiding / social withdrawal','Is hiding or social withdrawal increased?')
F('restless','Behavior','Restlessness / unable to settle','Is the cat unusually restless or unable to settle?')
F('vocalization','Behavior','Unusual crying / vocalization','Is there unusual crying, yowling, or pain vocalization?')
F('confusion','Behavior','Confusion / disorientation','Is there new confusion or disorientation?')
F('grooming_reduced','Behavior','Reduced grooming','Has normal grooming decreased?')
F('grooming_increased','Behavior','Excessive grooming','Has grooming or licking become excessive?')

# Oral / dental
F('drooling','Mouth','Drooling / excessive salivation','Is there new or excessive drooling?')
F('bad_breath','Mouth','Marked bad breath','Is breath markedly worse than usual?')
F('oral_pain','Mouth','Mouth pain / trouble eating','Does eating appear painful or is food dropped from the mouth?')
F('mouth_ulcers','Mouth','Mouth / tongue ulcers','Are ulcers or sores visible in the mouth or on the tongue?')
F('difficulty_swallowing','Mouth','Difficulty swallowing','Is swallowing difficult or abnormal?')
F('pawing_mouth','Mouth','Pawing at mouth / face','Is the cat repeatedly pawing at the mouth or face?')
F('oral_mass','Mouth','Oral mass / persistent mouth bleeding','Is there a visible oral mass or persistent oral bleeding?')

# Neurologic / mobility
F('seizure','Neurologic','Seizure activity','Has seizure activity occurred?')
F('ataxia','Neurologic','Ataxia / uncoordinated walking','Is walking newly uncoordinated or wobbly?')
F('head_tilt','Neurologic','Head tilt / balance problem','Is there a new head tilt or major balance problem?')
F('tremor','Neurologic','Tremor / twitching','Are tremors or abnormal twitching present?')
F('sudden_blindness','Eyes','Sudden apparent blindness','Has vision appeared to be lost suddenly?')
F('eye_red_pain','Eyes','Red / painful eye','Is an eye markedly red, squinting, or painful?')
F('cloudy_eye','Eyes','Cloudy eye','Has an eye become cloudy?')
F('limping','Mobility','Limping / not bearing weight','Is there limping or refusal to bear weight?')
F('stiffness','Mobility','Stiffness / difficulty rising','Is there stiffness or difficulty rising?')
F('reduced_jumping','Mobility','Reduced jumping / climbing','Has jumping or climbing ability decreased?')
F('hindlimb_weakness','Mobility','Hind-limb weakness','Is there new hind-limb weakness?')
F('hindlimb_paralysis','Mobility','Sudden hind-limb paralysis','Is there sudden inability to use one or both hind limbs?')
F('cold_painful_hindfeet','Mobility','Cold / painful hind feet','Are hind paws unusually cold and painful?')
F('neck_ventroflexion','Mobility','Neck ventroflexion / head held down','Is the neck weak so the head is held abnormally downward?')
F('pain_severe','Pain','Severe / obvious pain','Is there severe or obvious pain?')

# Skin / masses
F('itching','Skin','Itching / scratching','Is itching or scratching increased?')
F('hair_loss','Skin','Patchy hair loss','Is there patchy or unusual hair loss?')
F('skin_scaling','Skin','Scaly / crusted skin lesions','Are there scaly, crusted, or circular skin lesions?')
F('skin_swelling','Skin','Skin swelling / abscess / draining wound','Is there a painful swelling, abscess, or draining skin wound?')
F('skin_lump','Skin','New skin / subcutaneous lump','Is there a new persistent skin or subcutaneous lump?')
F('mammary_lump','Skin','Mammary-chain lump','Is there a lump along the mammary chain?')

# Reproductive / context / exposures
F('vaginal_discharge','Reproductive','Vaginal discharge','Is there abnormal vaginal discharge?')
F('food_change','Context','Recent food / treat change','Was food or treats recently changed?')
F('medication_recent','Context','Recent medication / treatment','Was medication or treatment recently given?')
F('stress_event','Context','Recent stress / environmental change','Was there a recent stressor or environmental change?')
F('toxin_possible','Exposure','Possible toxin exposure','Is toxin exposure known or possible?')
F('lily_exposure','Exposure','Possible lily exposure','Could the cat have contacted or ingested any part of a true lily or daylily?')
F('antifreeze_possible','Exposure','Possible antifreeze exposure','Could ethylene glycol / antifreeze exposure have occurred?')
F('acetaminophen_possible','Exposure','Possible acetaminophen exposure','Could acetaminophen / paracetamol exposure have occurred?')
F('permethrin_possible','Exposure','Possible dog flea-product / permethrin exposure','Could a permethrin-containing dog flea product have contacted the cat?')
F('foreign_object_possible','Exposure','Possible foreign-object ingestion','Could a foreign object have been swallowed?')
F('trauma','Exposure','Recent trauma / injury','Was there recent trauma or injury?')
F('new_cat_exposure','Context','Recent exposure to unfamiliar cats','Was there recent close exposure to unfamiliar cats?')
F('unvaccinated','Context','Vaccinations incomplete / unknown','Are core vaccinations incomplete or unknown?')
F('intact_female','Context','Unspayed / intact female','Is the cat an unspayed female?')
F('recurrent_infections','Context','Recurrent or unusual infections','Have recurrent or unusually persistent infections occurred?')
F('chronic_course','Context','Chronic / recurrent course','Has the problem persisted or recurred over weeks to months?')
F('acute_onset','Context','Sudden / acute onset','Did the problem begin suddenly?')
F('anorexia_2d','Context','Little or no food for ~2 days','Has the cat eaten little or nothing for roughly two days?')

# Clinical/laboratory evidence vocabulary. These are logged through the structured
# Clinical & diet screen rather than the owner-observation picker. Reference ranges
# are supplied by the user's laboratory/clinic; the app does not impose universal
# numeric cutoffs. Only explicitly interpreted abnormal/positive states can be
# converted into Bayesian evidence.
def CF(id, category, label):
    F(id, category, label, label, source_type='clinical')

CF('blood_glucose_high','Clinical · Chemistry','Blood glucose above reference range')
CF('blood_glucose_low','Clinical · Chemistry','Blood glucose below reference range')
CF('fructosamine_high','Clinical · Chemistry','Fructosamine above reference range')
CF('creatinine_high','Clinical · Chemistry','Creatinine above reference range')
CF('bun_high','Clinical · Chemistry','BUN / urea above reference range')
CF('sdma_high','Clinical · Chemistry','SDMA above reference range')
CF('phosphorus_high','Clinical · Chemistry','Phosphorus above reference range')
CF('alt_high','Clinical · Chemistry','ALT above reference range')
CF('alp_high','Clinical · Chemistry','ALP above reference range')
CF('bilirubin_high','Clinical · Chemistry','Total bilirubin above reference range')
CF('albumin_low','Clinical · Chemistry','Albumin below reference range')
CF('potassium_low','Clinical · Chemistry','Potassium below reference range')
CF('potassium_high','Clinical · Chemistry','Potassium above reference range')
CF('calcium_high','Clinical · Chemistry','Calcium above reference range')
CF('pcv_low','Clinical · Hematology','PCV / hematocrit below reference range')
CF('wbc_high','Clinical · Hematology','White blood cell count above reference range')
CF('total_t4_high','Clinical · Endocrine','Total T4 above reference range')
CF('urine_glucose_positive','Clinical · Urinalysis','Urine glucose positive')
CF('urine_ketones_positive','Clinical · Urinalysis','Urine ketones positive')
CF('urine_specific_gravity_low','Clinical · Urinalysis','Urine specific gravity interpreted as low / inadequately concentrated')
CF('urine_protein_positive','Clinical · Urinalysis','Urine protein / UPC interpreted as positive or elevated')
CF('urine_culture_positive','Clinical · Urinalysis','Urine culture positive')
CF('fpl_high','Clinical · Specialized','Feline pancreatic lipase result above reference range')
CF('ntprobnp_high','Clinical · Specialized','NT-proBNP above reference range')
CF('felv_positive','Clinical · Infectious testing','FeLV test positive')
CF('fiv_positive','Clinical · Infectious testing','FIV test positive')
CF('fecal_parasites_positive','Clinical · Infectious testing','Fecal parasite test positive')
CF('blood_pressure_high','Clinical · Vitals','Systolic blood pressure interpreted as high')

measurement_templates = [
    {'id':'body_weight','label':'Body weight','category':'Vitals','unit':'lb','kind':'numeric','modelMap':{}},
    {'id':'temperature','label':'Body temperature','category':'Vitals','unit':'°F','kind':'numeric','modelMap':{'high':'fever_high','low':'temp_low'}},
    {'id':'resting_resp_rate','label':'Resting respiratory rate','category':'Vitals','unit':'breaths/min','kind':'numeric','modelMap':{'high':'resp_rapid'}},
    {'id':'systolic_bp','label':'Systolic blood pressure','category':'Vitals','unit':'mmHg','kind':'numeric','modelMap':{'high':'blood_pressure_high'}},
    {'id':'blood_glucose','label':'Blood glucose','category':'Chemistry','unit':'mg/dL','kind':'numeric','modelMap':{'high':'blood_glucose_high','low':'blood_glucose_low'}},
    {'id':'fructosamine','label':'Fructosamine','category':'Chemistry','unit':'µmol/L','kind':'numeric','modelMap':{'high':'fructosamine_high'}},
    {'id':'creatinine','label':'Creatinine','category':'Chemistry','unit':'mg/dL','kind':'numeric','modelMap':{'high':'creatinine_high'}},
    {'id':'bun','label':'BUN / urea','category':'Chemistry','unit':'mg/dL','kind':'numeric','modelMap':{'high':'bun_high'}},
    {'id':'sdma','label':'SDMA','category':'Chemistry','unit':'µg/dL','kind':'numeric','modelMap':{'high':'sdma_high'}},
    {'id':'phosphorus','label':'Phosphorus','category':'Chemistry','unit':'mg/dL','kind':'numeric','modelMap':{'high':'phosphorus_high'}},
    {'id':'alt','label':'ALT','category':'Chemistry','unit':'U/L','kind':'numeric','modelMap':{'high':'alt_high'}},
    {'id':'alp','label':'ALP','category':'Chemistry','unit':'U/L','kind':'numeric','modelMap':{'high':'alp_high'}},
    {'id':'bilirubin','label':'Total bilirubin','category':'Chemistry','unit':'mg/dL','kind':'numeric','modelMap':{'high':'bilirubin_high'}},
    {'id':'albumin','label':'Albumin','category':'Chemistry','unit':'g/dL','kind':'numeric','modelMap':{'low':'albumin_low'}},
    {'id':'potassium','label':'Potassium','category':'Chemistry','unit':'mmol/L','kind':'numeric','modelMap':{'low':'potassium_low','high':'potassium_high'}},
    {'id':'calcium','label':'Calcium','category':'Chemistry','unit':'mg/dL','kind':'numeric','modelMap':{'high':'calcium_high'}},
    {'id':'pcv','label':'PCV / hematocrit','category':'Hematology','unit':'%','kind':'numeric','modelMap':{'low':'pcv_low'}},
    {'id':'wbc','label':'White blood cell count','category':'Hematology','unit':'K/µL','kind':'numeric','modelMap':{'high':'wbc_high'}},
    {'id':'total_t4','label':'Total T4','category':'Endocrine','unit':'µg/dL','kind':'numeric','modelMap':{'high':'total_t4_high'}},
    {'id':'urine_specific_gravity','label':'Urine specific gravity','category':'Urinalysis','unit':'','kind':'numeric','modelMap':{'low':'urine_specific_gravity_low'}},
    {'id':'urine_glucose','label':'Urine glucose','category':'Urinalysis','unit':'','kind':'categorical','choices':['negative','trace','positive'],'modelMap':{'trace':'urine_glucose_positive','positive':'urine_glucose_positive'}},
    {'id':'urine_ketones','label':'Urine ketones','category':'Urinalysis','unit':'','kind':'categorical','choices':['negative','trace','positive'],'modelMap':{'trace':'urine_ketones_positive','positive':'urine_ketones_positive'}},
    {'id':'urine_protein_upc','label':'Urine protein / UPC','category':'Urinalysis','unit':'','kind':'numeric','modelMap':{'high':'urine_protein_positive','positive':'urine_protein_positive'}},
    {'id':'urine_culture','label':'Urine culture','category':'Urinalysis','unit':'','kind':'categorical','choices':['negative','positive'],'modelMap':{'positive':'urine_culture_positive'}},
    {'id':'fpl','label':'Feline pancreatic lipase (fPL)','category':'Specialized','unit':'','kind':'numeric','modelMap':{'high':'fpl_high','positive':'fpl_high'}},
    {'id':'ntprobnp','label':'NT-proBNP','category':'Specialized','unit':'','kind':'numeric','modelMap':{'high':'ntprobnp_high','positive':'ntprobnp_high'}},
    {'id':'felv_test','label':'FeLV test','category':'Infectious testing','unit':'','kind':'categorical','choices':['negative','positive'],'modelMap':{'positive':'felv_positive'}},
    {'id':'fiv_test','label':'FIV test','category':'Infectious testing','unit':'','kind':'categorical','choices':['negative','positive'],'modelMap':{'positive':'fiv_positive'}},
    {'id':'fecal_parasites','label':'Fecal parasite test','category':'Infectious testing','unit':'','kind':'categorical','choices':['negative','positive'],'modelMap':{'positive':'fecal_parasites_positive'}},
    {'id':'custom','label':'Custom measurement / test','category':'Other','unit':'','kind':'custom','modelMap':{}},
]

# Helpers for condition definitions
conditions=[]
def C(id,label,family,description,sig,refs=()):
    conditions.append({'id':id,'label':label,'family':family,'description':description,'sig':sig,'sourceRefs':list(refs)})

# GI
C('acute_gastroenteritis','Acute gastroenteritis','Gastrointestinal','Acute stomach/intestinal inflammation pattern.',
  {'acute_onset':M,'vomit_repeated':M,'stool_diarrhea':M,'appetite_reduced':M,'energy_low':W,'dehydration':W,'abd_pain':W})
C('dietary_intolerance','Dietary intolerance / food reaction','Gastrointestinal','Pattern associated with food-related GI signs.',
  {'food_change':S,'vomit_single':W,'vomit_repeated':W,'stool_diarrhea':M,'stool_mucus':W,'appetite_reduced':W})
C('gi_foreign_body','Gastrointestinal foreign body / obstruction','Gastrointestinal','Pattern associated with obstructive ingested material.',
  {'foreign_object_possible':S,'vomit_repeated':S,'appetite_absent':M,'stool_none':M,'abd_pain':M,'energy_low':M,'dehydration':W,'acute_onset':M})
C('hairball_gi','Hairball-related GI irritation','Gastrointestinal','Retching/vomiting pattern with hairball evidence.',
  {'vomit_hairball':S,'vomit_single':M,'vomit_repeated':W,'appetite_reduced':W,'stool_normal':W})
C('ibd_chronic_enteropathy','Inflammatory bowel disease / chronic enteropathy','Gastrointestinal','Chronic inflammatory intestinal disease pattern.',
  {'chronic_course':S,'vomit_repeated':M,'stool_diarrhea':M,'weight_loss':M,'appetite_reduced':W,'stool_blood':W,'energy_low':W},('cornell_ibd',))
C('gi_lymphoma','Gastrointestinal lymphoma','Gastrointestinal','GI neoplasia pattern that can overlap strongly with chronic enteropathy.',
  {'chronic_course':S,'weight_loss':S,'appetite_reduced':M,'vomit_repeated':M,'stool_diarrhea':M,'energy_low':M,'abd_distended':W,'enlarged_nodes':W},('merck_gi_cancer','merck_lymphoma'))
C('intestinal_parasites','Gastrointestinal parasites','Gastrointestinal','Enteric parasite pattern, especially with exposure risk.',
  {'stool_diarrhea':M,'weight_loss':M,'abd_distended':W,'vomit_single':W,'poor_coat':W,'new_cat_exposure':W})
C('constipation','Constipation / obstipation','Gastrointestinal','Infrequent or difficult passage of hard stool.',
  {'stool_hard_dry':S,'stool_none':S,'stool_straining':S,'appetite_reduced':W,'vomit_single':W,'abd_pain':W},('merck_constipation',))
C('megacolon','Megacolon','Gastrointestinal','Chronic severe colonic hypomotility and obstipation pattern.',
  {'chronic_course':S,'stool_none':S,'stool_straining':S,'stool_hard_dry':S,'abd_distended':M,'appetite_reduced':M,'vomit_repeated':W,'weight_loss':W},('merck_megacolon',))
C('colitis','Colitis / large-bowel inflammation','Gastrointestinal','Large-bowel inflammatory pattern.',
  {'stool_diarrhea':M,'stool_mucus':S,'stool_blood':M,'stool_frequent':S,'stool_straining':M,'appetite_normal':W})
C('gi_ulcer_bleeding','GI ulceration / gastrointestinal bleeding','Gastrointestinal','Pattern associated with upper GI bleeding and systemic illness.',
  {'stool_black':S,'vomit_blood':S,'appetite_reduced':M,'pale_gums':W,'weakness':W,'abd_pain':W})
C('exocrine_pancreatic_insufficiency','Exocrine pancreatic insufficiency','Gastrointestinal','Maldigestion pattern with weight loss despite appetite.',
  {'weight_loss':S,'appetite_increased':M,'stool_diarrhea':M,'stool_frequent':W,'poor_coat':W,'chronic_course':M})

# Hepatobiliary / pancreatic
C('pancreatitis','Pancreatitis','Hepatobiliary / Pancreatic','Pancreatic inflammation pattern; feline signs are often nonspecific.',
  {'appetite_reduced':S,'energy_low':M,'vomit_repeated':W,'weight_loss':W,'abd_pain':W,'dehydration':W},('cornell_pancreatitis',))
C('triaditis','Triaditis pattern','Hepatobiliary / Pancreatic','Concurrent inflammatory disease involving pancreas, intestine, and biliary tract.',
  {'appetite_reduced':S,'vomit_repeated':M,'stool_diarrhea':M,'weight_loss':M,'yellow_gums':W,'abd_pain':W,'energy_low':M,'chronic_course':W})
C('cholangitis','Cholangitis / cholangiohepatitis','Hepatobiliary / Pancreatic','Inflammatory biliary/liver pattern.',
  {'fever_high':M,'energy_low':M,'dehydration':W,'appetite_reduced':S,'vomit_repeated':M,'yellow_gums':M,'abd_pain':W},('merck_cholangitis',))
C('hepatic_lipidosis','Hepatic lipidosis','Hepatobiliary / Pancreatic','Fatty liver syndrome pattern often following marked anorexia and weight loss.',
  {'anorexia_2d':S,'appetite_absent':S,'weight_loss':S,'yellow_gums':M,'energy_low':M,'vomit_repeated':W,'drooling':W,'dehydration':W,'neck_ventroflexion':W},('merck_hepatic_lipidosis',))
C('chronic_hepatopathy','Chronic liver disease / hepatopathy','Hepatobiliary / Pancreatic','Chronic liver dysfunction pattern.',
  {'chronic_course':M,'appetite_reduced':M,'weight_loss':M,'energy_low':M,'yellow_gums':W,'vomit_repeated':W,'abd_distended':W})
C('biliary_obstruction','Biliary obstruction','Hepatobiliary / Pancreatic','Obstructive cholestatic pattern.',
  {'yellow_gums':S,'appetite_reduced':M,'vomit_repeated':W,'abd_pain':M,'energy_low':M,'acute_onset':W})

# Renal / urinary
C('chronic_kidney_disease','Chronic kidney disease','Renal / Urinary','Progressive renal dysfunction pattern common in older cats.',
  {'chronic_course':M,'thirst_increased':S,'urine_increased':S,'weight_loss':M,'appetite_reduced':M,'energy_low':M,'vomit_repeated':W,'dehydration':W,'bad_breath':W},('cornell_ckd',))
C('acute_kidney_injury','Acute kidney injury','Renal / Urinary','Sudden renal dysfunction pattern with variable urine output.',
  {'acute_onset':M,'appetite_absent':M,'energy_low':S,'vomit_repeated':M,'dehydration':M,'urine_reduced':M,'urine_none':W,'urine_increased':W,'mouth_ulcers':W},('merck_aki',))
C('pyelonephritis','Kidney infection / pyelonephritis','Renal / Urinary','Upper urinary tract infection pattern.',
  {'fever_high':M,'energy_low':M,'appetite_reduced':M,'thirst_increased':W,'urine_increased':W,'urine_blood':W,'abd_pain':W})
C('bacterial_uti','Bacterial urinary tract infection','Renal / Urinary','Lower urinary infection pattern.',
  {'urine_small_frequent':S,'urine_straining':M,'urine_blood':M,'urine_outside_box':M,'genital_licking':W,'fever_high':W})
C('feline_idiopathic_cystitis','Feline idiopathic cystitis','Renal / Urinary','Sterile lower urinary tract inflammation pattern often associated with stress.',
  {'urine_small_frequent':S,'urine_straining':S,'urine_blood':M,'urine_outside_box':M,'genital_licking':M,'stress_event':M},('cornell_flutd',))
C('urolithiasis','Urinary stones / urolithiasis','Renal / Urinary','Lower urinary signs associated with urinary calculi.',
  {'urine_small_frequent':M,'urine_straining':S,'urine_blood':S,'urine_outside_box':W,'pain_severe':W})
C('urethral_obstruction','Urethral obstruction','Renal / Urinary','Life-threatening urinary outflow obstruction pattern.',
  {'urine_none':S,'urine_straining':S,'vocalization':M,'pain_severe':M,'vomit_repeated':W,'energy_low':M,'collapse':W,'acute_onset':S},('cornell_flutd',))
C('renal_neoplasia','Renal neoplasia','Renal / Urinary','Kidney tumor pattern, including lymphoma or other renal masses.',
  {'weight_loss':M,'appetite_reduced':M,'energy_low':M,'thirst_increased':W,'urine_increased':W,'abd_distended':W,'chronic_course':M})

# Endocrine / metabolic
C('diabetes_mellitus','Diabetes mellitus','Endocrine / Metabolic','Hyperglycemic metabolic pattern.',
  {'thirst_increased':S,'urine_increased':S,'weight_loss':S,'appetite_increased':M,'weakness':W,'hindlimb_weakness':W,'dehydration':W},('cornell_diabetes',))
C('diabetic_ketoacidosis','Diabetic ketoacidosis','Endocrine / Metabolic','Acute decompensated diabetes pattern.',
  {'thirst_increased':M,'urine_increased':M,'weight_loss':M,'appetite_absent':S,'vomit_repeated':S,'energy_low':S,'dehydration':S,'weakness':M,'acute_onset':M},('cornell_diabetes',))
C('hyperthyroidism','Hyperthyroidism','Endocrine / Metabolic','Thyroid hormone excess pattern, especially in middle-aged and older cats.',
  {'weight_loss':S,'appetite_increased':S,'thirst_increased':M,'urine_increased':M,'energy_increased':M,'restless':W,'vomit_repeated':W,'stool_diarrhea':W,'poor_coat':W},('cornell_hyperthyroidism',))
C('hypersomatotropism','Hypersomatotropism / acromegaly','Endocrine / Metabolic','Growth-hormone excess pattern often associated with difficult diabetes control.',
  {'thirst_increased':M,'urine_increased':M,'appetite_increased':M,'weight_gain':W,'weakness':W,'chronic_course':M})
C('hyperaldosteronism','Primary hyperaldosteronism','Endocrine / Metabolic','Mineralocorticoid excess pattern that can cause weakness and hypertension.',
  {'weakness':S,'neck_ventroflexion':M,'thirst_increased':W,'urine_increased':W,'sudden_blindness':W,'chronic_course':W})
C('hypercalcemia','Hypercalcemia syndrome','Endocrine / Metabolic','Elevated-calcium pattern with GI, urinary, and weakness signs.',
  {'appetite_reduced':M,'vomit_repeated':W,'stool_hard_dry':W,'thirst_increased':M,'urine_increased':M,'weakness':W,'weight_loss':W})
C('hypokalemia','Hypokalemia / potassium depletion','Endocrine / Metabolic','Low-potassium pattern with characteristic muscle weakness.',
  {'weakness':S,'neck_ventroflexion':S,'appetite_reduced':W,'energy_low':M,'stiffness':W})

# Cardiovascular
C('hypertrophic_cardiomyopathy','Hypertrophic cardiomyopathy','Cardiovascular','Common feline cardiomyopathy; may be silent or present with CHF/thromboembolism.',
  {'resp_rapid':M,'resp_distress':M,'open_mouth_breathing':W,'energy_low':W,'appetite_reduced':W,'collapse':W,'hindlimb_paralysis':W},('cornell_hcm',))
C('congestive_heart_failure','Congestive heart failure','Cardiovascular','Clinical heart-failure pattern with fluid accumulation affecting breathing.',
  {'resp_rapid':S,'resp_distress':S,'open_mouth_breathing':M,'energy_low':M,'appetite_reduced':W,'blue_gums':W,'collapse':W},('cornell_hcm',))
C('arterial_thromboembolism','Arterial thromboembolism / saddle thrombus','Cardiovascular','Acute arterial clot pattern, often affecting hind limbs.',
  {'acute_onset':S,'hindlimb_paralysis':S,'cold_painful_hindfeet':S,'pain_severe':S,'vocalization':M,'resp_rapid':W},('cornell_hcm',))
C('systemic_hypertension','Systemic hypertension','Cardiovascular','High blood pressure pattern, often secondary to renal or endocrine disease.',
  {'sudden_blindness':S,'confusion':W,'seizure':W,'restless':W,'thirst_increased':W,'urine_increased':W})
C('arrhythmia','Clinically significant arrhythmia','Cardiovascular','Abnormal cardiac rhythm pattern with weakness, collapse, or exercise intolerance.',
  {'weakness':M,'collapse':M,'energy_low':M,'resp_rapid':W,'acute_onset':W})

# Respiratory
C('feline_asthma','Feline asthma','Respiratory','Inflammatory lower-airway disease pattern.',
  {'cough':S,'wheeze':S,'resp_rapid':M,'resp_distress':M,'open_mouth_breathing':W},('cornell_asthma',))
C('upper_respiratory_infection','Upper respiratory infection','Respiratory','Common infectious upper-airway pattern.',
  {'sneeze':S,'nasal_discharge':S,'ocular_discharge':M,'appetite_reduced':W,'fever_high':W,'energy_low':W})
C('pneumonia','Pneumonia','Respiratory','Lower respiratory infection/inflammation pattern.',
  {'fever_high':M,'cough':M,'resp_rapid':S,'resp_distress':S,'energy_low':M,'appetite_reduced':M,'blue_gums':W})
C('pleural_effusion','Pleural effusion','Respiratory','Fluid around the lungs causing restrictive breathing.',
  {'resp_rapid':S,'resp_distress':S,'open_mouth_breathing':M,'energy_low':M,'blue_gums':W,'abd_distended':W})
C('pulmonary_edema','Pulmonary edema','Respiratory','Fluid within lung tissue, often cardiogenic.',
  {'resp_rapid':S,'resp_distress':S,'open_mouth_breathing':M,'blue_gums':W,'energy_low':M})
C('lungworm','Lungworm / pulmonary parasitism','Respiratory','Parasitic respiratory pattern.',
  {'cough':M,'wheeze':M,'resp_rapid':M,'resp_distress':W,'weight_loss':W,'outdoor_exposure':W} if False else {'cough':M,'wheeze':M,'resp_rapid':M,'resp_distress':W,'weight_loss':W})
C('nasal_neoplasia','Nasal tumor / chronic nasal mass','Respiratory','Chronic upper-airway neoplasia pattern.',
  {'chronic_course':S,'sneeze':M,'nasal_discharge':M,'nasal_blood':S,'appetite_reduced':W,'weight_loss':W})
C('heartworm_respiratory_disease','Feline heartworm-associated respiratory disease','Respiratory','Heartworm-associated respiratory pattern that can mimic asthma.',
  {'cough':M,'wheeze':W,'resp_rapid':M,'resp_distress':M,'vomit_single':W,'collapse':W})

# Infectious / immune
C('fip','Feline infectious peritonitis (FIP)','Infectious / Immune','Systemic coronavirus-associated inflammatory disease pattern.',
  {'fever_high':S,'appetite_reduced':M,'weight_loss':S,'energy_low':S,'abd_distended':M,'resp_distress':W,'seizure':W,'ataxia':W,'ocular_discharge':W,'chronic_course':M},('cornell_fip',))
C('felv_related','FeLV-associated disease','Infectious / Immune','Feline leukemia virus–associated systemic disease pattern.',
  {'appetite_reduced':M,'weight_loss':S,'poor_coat':M,'enlarged_nodes':M,'fever_high':M,'pale_gums':M,'mouth_ulcers':W,'stool_diarrhea':W,'recurrent_infections':S,'seizure':W},('cornell_felv',))
C('fiv_related','FIV-associated disease','Infectious / Immune','Feline immunodeficiency virus–associated immunocompromise pattern.',
  {'weight_loss':M,'fever_high':W,'appetite_reduced':M,'recurrent_infections':S,'bad_breath':M,'oral_pain':M,'mouth_ulcers':M,'seizure':W,'chronic_course':M},('cornell_fiv',))
C('panleukopenia','Feline panleukopenia','Infectious / Immune','Acute severe viral GI/systemic disease pattern.',
  {'acute_onset':S,'fever_high':S,'stool_diarrhea':S,'vomit_repeated':S,'energy_low':S,'appetite_absent':S,'dehydration':S,'unvaccinated':M},('cornell_panleukopenia',))
C('toxoplasmosis','Clinical toxoplasmosis','Infectious / Immune','Multisystem protozoal disease pattern.',
  {'fever_high':M,'stool_diarrhea':W,'cough':W,'resp_distress':W,'yellow_gums':W,'seizure':M,'ataxia':M,'eye_red_pain':W,'energy_low':M},('merck_toxoplasmosis',))
C('abscess_cellulitis','Abscess / cellulitis','Infectious / Immune','Localized bacterial infection pattern, often after bite or wound.',
  {'skin_swelling':S,'fever_high':M,'pain_severe':W,'energy_low':M,'appetite_reduced':W,'new_cat_exposure':W})
C('sepsis','Sepsis / severe systemic infection','Infectious / Immune','Critical systemic infection pattern.',
  {'fever_high':M,'temp_low':M,'energy_low':S,'appetite_absent':M,'weakness':S,'collapse':M,'resp_rapid':M,'dehydration':M,'acute_onset':M})
C('cryptococcosis','Cryptococcosis','Infectious / Immune','Systemic fungal disease often involving nasal, neurologic, or ocular signs.',
  {'chronic_course':M,'nasal_discharge':M,'sneeze':W,'nasal_blood':W,'ataxia':W,'seizure':W,'eye_red_pain':W,'weight_loss':W})
C('feline_calicivirus','Feline calicivirus infection','Infectious / Immune','Viral upper-respiratory/oral disease pattern.',
  {'sneeze':M,'nasal_discharge':M,'ocular_discharge':W,'mouth_ulcers':S,'oral_pain':M,'fever_high':W,'appetite_reduced':M})
C('feline_herpesvirus','Feline herpesvirus respiratory disease','Infectious / Immune','Viral upper respiratory and ocular disease pattern.',
  {'sneeze':S,'nasal_discharge':S,'ocular_discharge':S,'eye_red_pain':M,'fever_high':W,'appetite_reduced':W})

# Hematologic / oncologic
C('anemia','Anemia','Hematologic / Oncologic','Reduced red-cell mass pattern regardless of cause.',
  {'pale_gums':S,'energy_low':M,'weakness':M,'resp_rapid':M,'collapse':W,'appetite_reduced':W})
C('hemolytic_anemia','Hemolytic anemia','Hematologic / Oncologic','Red-cell destruction pattern.',
  {'pale_gums':S,'yellow_gums':M,'urine_dark':M,'energy_low':M,'weakness':M,'resp_rapid':M,'fever_high':W})
C('multicentric_lymphoma','Multicentric / systemic lymphoma','Hematologic / Oncologic','Systemic lymphoid neoplasia pattern.',
  {'weight_loss':S,'appetite_reduced':M,'energy_low':M,'enlarged_nodes':S,'fever_high':W,'resp_distress':W,'thirst_increased':W,'urine_increased':W,'chronic_course':M},('merck_lymphoma',))
C('leukemia','Leukemia / marrow neoplasia','Hematologic / Oncologic','Blood/marrow neoplasia pattern.',
  {'pale_gums':M,'energy_low':M,'weight_loss':M,'appetite_reduced':M,'fever_high':W,'recurrent_infections':W,'enlarged_nodes':W,'chronic_course':M})
C('mast_cell_disease','Mast cell tumor / systemic mast cell disease','Hematologic / Oncologic','Cutaneous or visceral mast-cell neoplasia pattern.',
  {'skin_lump':M,'vomit_repeated':W,'stool_black':W,'weight_loss':W,'appetite_reduced':W,'chronic_course':W})
C('mammary_carcinoma','Mammary carcinoma','Hematologic / Oncologic','Mammary-chain neoplasia pattern.',
  {'mammary_lump':S,'weight_loss':W,'appetite_reduced':W,'energy_low':W,'chronic_course':M})
C('oral_squamous_cell_carcinoma','Oral squamous cell carcinoma','Hematologic / Oncologic','Aggressive oral neoplasia pattern.',
  {'oral_mass':S,'drooling':S,'oral_pain':S,'bad_breath':M,'difficulty_swallowing':M,'weight_loss':S,'appetite_reduced':M,'chronic_course':M})
C('multiple_myeloma','Multiple myeloma / plasma-cell neoplasia','Hematologic / Oncologic','Systemic plasma-cell malignancy pattern.',
  {'weight_loss':M,'energy_low':M,'weakness':W,'appetite_reduced':M,'chronic_course':M,'pale_gums':W})

# Neurologic
C('seizure_disorder','Primary or recurrent seizure disorder','Neurologic','Pattern dominated by recurrent seizure activity.',
  {'seizure':S,'chronic_course':W,'energy_normal':W})
C('vestibular_disease','Vestibular disease','Neurologic','Balance-system disorder pattern.',
  {'head_tilt':S,'ataxia':S,'vomit_single':W,'acute_onset':M})
C('intracranial_mass','Intracranial mass / brain tumor','Neurologic','Progressive intracranial disease pattern.',
  {'seizure':M,'confusion':M,'ataxia':M,'head_tilt':W,'sudden_blindness':W,'chronic_course':S,'weight_loss':W})
C('encephalitis_meningitis','Encephalitis / meningoencephalitis','Neurologic','Inflammatory central nervous system pattern.',
  {'fever_high':M,'seizure':M,'ataxia':M,'confusion':M,'energy_low':M,'acute_onset':W})
C('cognitive_dysfunction','Cognitive dysfunction syndrome','Neurologic','Age-related cognitive/behavioral decline pattern.',
  {'confusion':S,'vocalization':M,'restless':M,'chronic_course':S,'grooming_reduced':W})
C('spinal_neurologic_disease','Spinal cord / peripheral neurologic disease','Neurologic','Spinal or peripheral nerve dysfunction pattern.',
  {'hindlimb_weakness':M,'hindlimb_paralysis':M,'ataxia':M,'pain_severe':W,'stiffness':W})
C('thiamine_deficiency','Thiamine deficiency','Neurologic','Nutritional neurologic syndrome pattern.',
  {'ataxia':M,'seizure':M,'weakness':M,'neck_ventroflexion':W,'appetite_reduced':M,'vomit_repeated':W})

# Oral / dental
C('periodontal_disease','Periodontal / dental disease','Oral / Dental','Dental inflammation and infection pattern.',
  {'bad_breath':S,'oral_pain':M,'appetite_reduced':W,'drooling':W,'pawing_mouth':W})
C('gingivostomatitis','Feline chronic gingivostomatitis','Oral / Dental','Severe chronic oral inflammatory disease pattern.',
  {'oral_pain':S,'mouth_ulcers':S,'drooling':M,'bad_breath':M,'appetite_reduced':M,'weight_loss':W,'chronic_course':M})
C('tooth_resorption','Tooth resorption','Oral / Dental','Painful feline dental resorptive lesion pattern.',
  {'oral_pain':S,'pawing_mouth':M,'appetite_reduced':W,'drooling':W,'bad_breath':W})
C('oral_foreign_body','Oral foreign body','Oral / Dental','Foreign material lodged in the mouth or pharynx.',
  {'acute_onset':M,'drooling':S,'pawing_mouth':S,'difficulty_swallowing':M,'oral_pain':M,'foreign_object_possible':M})

# Musculoskeletal / pain
C('osteoarthritis','Osteoarthritis / degenerative joint disease','Musculoskeletal / Pain','Chronic mobility-pain pattern.',
  {'chronic_course':M,'stiffness':S,'reduced_jumping':S,'limping':M,'grooming_reduced':W,'hiding':W})
C('trauma_fracture','Trauma / fracture','Musculoskeletal / Pain','Acute injury pattern.',
  {'trauma':S,'acute_onset':S,'limping':S,'pain_severe':M,'collapse':W,'resp_rapid':W})
C('soft_tissue_pain','Soft-tissue pain / sprain','Musculoskeletal / Pain','Localized pain without obvious fracture pattern.',
  {'trauma':M,'limping':M,'pain_severe':W,'reduced_jumping':M,'stiffness':W})

# Dermatologic
C('allergic_dermatitis','Allergic dermatitis','Dermatologic','Pruritic allergic skin disease pattern.',
  {'itching':S,'grooming_increased':M,'hair_loss':M,'skin_scaling':W,'chronic_course':W})
C('flea_allergy','Flea allergy dermatitis','Dermatologic','Pruritic flea-associated hypersensitivity pattern.',
  {'itching':S,'grooming_increased':S,'hair_loss':M,'skin_scaling':W})
C('ringworm','Dermatophytosis / ringworm','Dermatologic','Fungal skin disease pattern.',
  {'hair_loss':S,'skin_scaling':S,'itching':W,'new_cat_exposure':W})
C('eosinophilic_granuloma','Eosinophilic granuloma complex','Dermatologic','Allergic/inflammatory skin and oral lesion pattern.',
  {'skin_lump':W,'skin_scaling':M,'itching':M,'mouth_ulcers':W,'grooming_increased':W})

# Toxic / environmental
C('general_toxin_exposure','Toxin exposure / poisoning','Toxic / Environmental','General acute toxic exposure pattern.',
  {'toxin_possible':S,'acute_onset':S,'vomit_repeated':M,'drooling':M,'tremor':M,'seizure':W,'collapse':W,'energy_low':M})
C('lily_toxicity','Lily toxicity','Toxic / Environmental','True-lily/daylily exposure pattern causing acute kidney injury.',
  {'lily_exposure':S,'acute_onset':M,'vomit_repeated':M,'appetite_absent':M,'energy_low':M,'dehydration':M,'urine_reduced':W,'urine_none':W,'urine_increased':W})
C('ethylene_glycol_toxicity','Ethylene glycol / antifreeze toxicity','Toxic / Environmental','Antifreeze exposure pattern causing neurologic signs and acute kidney injury.',
  {'antifreeze_possible':S,'acute_onset':S,'vomit_repeated':M,'ataxia':M,'energy_low':M,'dehydration':M,'urine_reduced':M,'urine_none':W})
C('acetaminophen_toxicity','Acetaminophen toxicity','Toxic / Environmental','Oxidative toxin pattern in cats.',
  {'acetaminophen_possible':S,'acute_onset':S,'energy_low':M,'resp_distress':M,'blue_gums':S,'pale_gums':W,'yellow_gums':W,'collapse':W})
C('permethrin_toxicity','Permethrin toxicity','Toxic / Environmental','Pyrethroid toxicity pattern in cats.',
  {'permethrin_possible':S,'acute_onset':S,'tremor':S,'seizure':M,'restless':M,'weakness':M})
C('heatstroke','Heatstroke / hyperthermia','Toxic / Environmental','Severe environmental hyperthermia pattern.',
  {'fever_high':S,'open_mouth_breathing':M,'resp_rapid':M,'weakness':M,'collapse':M,'vomit_repeated':W,'acute_onset':S})

# Reproductive
C('pyometra','Pyometra','Reproductive','Uterine infection pattern in intact females.',
  {'intact_female':S,'energy_low':M,'appetite_reduced':M,'thirst_increased':M,'urine_increased':M,'vomit_repeated':W,'vaginal_discharge':S,'abd_distended':M,'fever_high':W},('merck_pyometra',))
C('mastitis','Mastitis','Reproductive','Inflammation/infection of mammary tissue.',
  {'mammary_lump':M,'skin_swelling':M,'fever_high':M,'energy_low':M,'appetite_reduced':W,'pain_severe':W})

# Ophthalmic
C('glaucoma_uveitis','Glaucoma / uveitis pattern','Ophthalmic','Painful intraocular disease pattern.',
  {'eye_red_pain':S,'cloudy_eye':M,'sudden_blindness':M,'hiding':W,'appetite_reduced':W})
C('retinal_detachment','Retinal detachment','Ophthalmic','Acute vision-loss pattern, often associated with hypertension.',
  {'sudden_blindness':S,'acute_onset':M,'confusion':W})
C('corneal_ulcer','Corneal ulcer / ocular surface injury','Ophthalmic','Painful corneal surface disease pattern.',
  {'eye_red_pain':S,'ocular_discharge':M,'cloudy_eye':W,'pawing_mouth':U})

# Behavioral / iatrogenic
C('stress_behavioral','Stress / environmental behavior change','Behavioral / Iatrogenic','Behavioral and appetite/elimination changes associated with stress.',
  {'stress_event':S,'hiding':M,'appetite_reduced':M,'grooming_increased':W,'urine_outside_box':W,'energy_low':W})
C('medication_adverse_effect','Medication / treatment adverse effect','Behavioral / Iatrogenic','Temporal pattern after a medication or treatment.',
  {'medication_recent':S,'appetite_reduced':W,'vomit_single':W,'vomit_repeated':W,'stool_diarrhea':W,'energy_low':W,'restless':W})

# Structured clinical evidence associations. These are deliberately broad,
# heuristic pattern weights, not diagnostic sensitivity/specificity. They are
# applied only when the user explicitly elects to use an abnormal/positive
# clinical result as model evidence.
clinical_associations = {
    'diabetes_mellitus': {'blood_glucose_high':S,'fructosamine_high':S,'urine_glucose_positive':S},
    'diabetic_ketoacidosis': {'blood_glucose_high':S,'fructosamine_high':M,'urine_glucose_positive':S,'urine_ketones_positive':S,'potassium_low':W},
    'hypersomatotropism': {'blood_glucose_high':M,'fructosamine_high':M},
    'chronic_kidney_disease': {'creatinine_high':S,'bun_high':M,'sdma_high':S,'phosphorus_high':M,'urine_specific_gravity_low':M,'urine_protein_positive':M,'pcv_low':W,'potassium_low':W,'blood_pressure_high':W},
    'acute_kidney_injury': {'creatinine_high':S,'bun_high':S,'sdma_high':M,'phosphorus_high':M,'potassium_high':M},
    'pyelonephritis': {'creatinine_high':W,'wbc_high':M,'urine_culture_positive':M,'urine_protein_positive':W},
    'bacterial_uti': {'urine_culture_positive':S,'wbc_high':W,'urine_protein_positive':W},
    'urethral_obstruction': {'creatinine_high':M,'bun_high':M,'potassium_high':S},
    'renal_neoplasia': {'creatinine_high':M,'sdma_high':W,'pcv_low':W},
    'hyperthyroidism': {'total_t4_high':S,'alt_high':W,'alp_high':W,'blood_pressure_high':W},
    'hyperaldosteronism': {'potassium_low':S,'blood_pressure_high':M},
    'hypercalcemia': {'calcium_high':S},
    'hypokalemia': {'potassium_low':S},
    'systemic_hypertension': {'blood_pressure_high':S},
    'hypertrophic_cardiomyopathy': {'ntprobnp_high':M},
    'congestive_heart_failure': {'ntprobnp_high':S},
    'pancreatitis': {'fpl_high':S},
    'triaditis': {'fpl_high':M,'alt_high':W,'bilirubin_high':W},
    'cholangitis': {'alt_high':M,'alp_high':M,'bilirubin_high':M,'wbc_high':W},
    'hepatic_lipidosis': {'alt_high':M,'alp_high':M,'bilirubin_high':S},
    'chronic_hepatopathy': {'alt_high':M,'alp_high':W,'bilirubin_high':M,'albumin_low':M},
    'biliary_obstruction': {'alp_high':M,'bilirubin_high':S},
    'gi_ulcer_bleeding': {'pcv_low':M,'bun_high':W},
    'gi_lymphoma': {'pcv_low':W,'albumin_low':W},
    'ibd_chronic_enteropathy': {'albumin_low':W},
    'intestinal_parasites': {'fecal_parasites_positive':S,'pcv_low':W},
    'felv': {'felv_positive':S,'pcv_low':M},
    'fiv': {'fiv_positive':S},
    'lymphoma_multicentric': {'pcv_low':W,'calcium_high':W,'felv_positive':W},
    'anemia_general': {'pcv_low':S},
    'hemolytic_anemia': {'pcv_low':S,'bilirubin_high':M},
    'skin_abscess': {'wbc_high':W},
    'pneumonia': {'wbc_high':M},
    'lily_toxicity': {'creatinine_high':M,'bun_high':M,'phosphorus_high':W,'potassium_high':W},
    'ethylene_glycol_toxicity': {'creatinine_high':M,'bun_high':M,'potassium_high':W},
}
for c in conditions:
    c['sig'].update(clinical_associations.get(c['id'], {}))

# Reserve hypothesis intentionally neutral.
other = {'id':'other_unmodeled','label':'Other / unmodeled condition','family':'Other','description':'Reserve hypothesis for conditions not represented in this experimental library.','sig':{},'sourceRefs':[]}

# 2% reserve mass; remaining condition priors are equal by design to avoid
# pretending that these are measured prevalence estimates.
reserve_prior = 0.02
base_prior = (1.0-reserve_prior)/len(conditions)

hypotheses=[]
likelihoods={}
for c in conditions:
    hypotheses.append({k:c[k] for k in ('id','label','family','description','sourceRefs')} | {'prior':base_prior})
    likelihoods[c['id']] = c['sig']
hypotheses.append({k:other[k] for k in ('id','label','family','description','sourceRefs')} | {'prior':reserve_prior})
likelihoods[other['id']] = {}

urgency_rules = [
    {'id':'breathing','level':'emergency','findings':['resp_distress','open_mouth_breathing','blue_gums'],'match':'any','title':'Breathing difficulty','message':'Labored breathing, open-mouth breathing, or blue-gray mucous membranes warrants immediate veterinary assessment.'},
    {'id':'urinary_block','level':'emergency','findings':['urine_none'],'match':'any','title':'Unable to urinate','message':'Inability to pass urine is an emergency.'},
    {'id':'collapse_seizure','level':'emergency','findings':['collapse','seizure'],'match':'any','title':'Collapse or seizure','message':'Collapse, unresponsiveness, or seizure activity warrants emergency veterinary care.'},
    {'id':'thromboembolism','level':'emergency','findings':['hindlimb_paralysis','cold_painful_hindfeet'],'match':'any','title':'Sudden hind-limb paralysis / cold painful paws','message':'Sudden hind-limb paralysis or cold painful hind paws can represent a vascular emergency.'},
    {'id':'toxin','level':'emergency','findings':['toxin_possible','lily_exposure','antifreeze_possible','acetaminophen_possible','permethrin_possible'],'match':'any','title':'Possible toxin exposure','message':'Known or suspected toxin exposure should be discussed with a veterinarian or animal poison service immediately.'},
    {'id':'blood_vomit_stool','level':'urgent','findings':['vomit_blood','stool_black'],'match':'any','title':'Possible gastrointestinal bleeding','message':'Blood in vomit or black/tarry stool can require urgent veterinary assessment.'},
    {'id':'urinary_straining','level':'urgent','findings':['urine_straining'],'match':'any','title':'Straining to urinate','message':'Repeated urinary straining can progress to or represent obstruction and warrants prompt veterinary assessment.'},
    {'id':'jaundice','level':'urgent','findings':['yellow_gums'],'match':'any','title':'Jaundice observed','message':'Yellow discoloration of the gums, skin, or eyes warrants prompt veterinary assessment.'},
    {'id':'repeated_vomit_low_energy','level':'urgent','findings':['vomit_repeated','energy_low'],'match':'all','title':'Repeated vomiting with lethargy','message':'Repeated vomiting together with lethargy can indicate significant illness and warrants prompt veterinary assessment.'},
    {'id':'severe_pain','level':'urgent','findings':['pain_severe'],'match':'any','title':'Severe pain','message':'Severe or persistent pain warrants prompt veterinary assessment.'}
]

sources = [
    {'id':'cornell_urgent','name':'Cornell University College of Veterinary Medicine — Urgent Care','url':'https://www.vet.cornell.edu/hospitals/services/urgent-care','role':'Emergency red-flag examples'},
    {'id':'cornell_hyperthyroidism','name':'Cornell Feline Health Center — Hyperthyroidism in Cats','url':'https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/hyperthyroidism-cats','role':'Hyperthyroidism clinical-sign pattern'},
    {'id':'cornell_diabetes','name':'Cornell Feline Health Center — Feline Diabetes','url':'https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feline-diabetes','role':'Diabetes clinical-sign pattern'},
    {'id':'cornell_ckd','name':'Cornell Feline Health Center — Chronic Kidney Disease','url':'https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/chronic-kidney-disease','role':'CKD clinical-sign pattern'},
    {'id':'cornell_pancreatitis','name':'Cornell Feline Health Center — Feline Pancreatitis','url':'https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feline-pancreatitis','role':'Pancreatitis clinical-sign pattern'},
    {'id':'cornell_flutd','name':'Cornell Feline Health Center — Feline Lower Urinary Tract Disease','url':'https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feline-lower-urinary-tract-disease','role':'Lower urinary tract and obstruction signs'},
    {'id':'cornell_hcm','name':'Cornell Feline Health Center — Hypertrophic Cardiomyopathy','url':'https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/hypertrophic-cardiomyopathy','role':'HCM, heart failure, and thromboembolism signs'},
    {'id':'cornell_asthma','name':'Cornell Feline Health Center — Feline Asthma','url':'https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feline-asthma-what-you-need-know','role':'Asthma clinical-sign pattern'},
    {'id':'cornell_fip','name':'Cornell Feline Health Center — Feline Infectious Peritonitis','url':'https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feline-infectious-peritonitis','role':'FIP clinical-sign pattern'},
    {'id':'cornell_ibd','name':'Cornell Feline Health Center — Inflammatory Bowel Disease','url':'https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/inflammatory-bowel-disease','role':'Chronic enteropathy / IBD signs'},
    {'id':'cornell_felv','name':'Cornell Feline Health Center — Feline Leukemia Virus','url':'https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feline-leukemia-virus','role':'FeLV-associated disease signs'},
    {'id':'cornell_fiv','name':'Cornell Feline Health Center — Feline Immunodeficiency Virus','url':'https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feline-immunodeficiency-virus','role':'FIV-associated disease signs'},
    {'id':'cornell_panleukopenia','name':'Cornell Feline Health Center — Feline Panleukopenia Virus','url':'https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feline-panleukopenia-virus','role':'Panleukopenia clinical-sign pattern'},
    {'id':'merck_hepatic_lipidosis','name':'Merck Veterinary Manual — Feline Hepatic Lipidosis','url':'https://www.merckvetmanual.com/digestive-system/hepatic-diseases-of-small-animals/feline-hepatic-lipidosis','role':'Hepatic lipidosis clinical signs'},
    {'id':'merck_cholangitis','name':'Merck Veterinary Manual — Feline Cholangitis / Cholangiohepatitis Syndrome','url':'https://www.merckvetmanual.com/digestive-system/hepatic-diseases-of-small-animals/feline-cholangitis-cholangiohepatitis-syndrome','role':'Cholangitis clinical signs'},
    {'id':'merck_constipation','name':'Merck Veterinary Manual — Constipation, Obstipation, and Megacolon','url':'https://www.merckvetmanual.com/digestive-system/diseases-of-the-large-intestine-in-small-animals/constipation-obstipation-and-megacolon-in-small-animals','role':'Constipation/obstipation clinical signs'},
    {'id':'merck_megacolon','name':'Merck Veterinary Manual — Megacolon in Cats','url':'https://www.merckvetmanual.com/digestive-system/surgical-problems-of-the-gastrointestinal-tract-in-small-animals/megacolon-in-cats','role':'Megacolon clinical signs'},
    {'id':'merck_gi_cancer','name':'Merck Veterinary Manual — Disorders of the Stomach and Intestines in Cats','url':'https://www.merckvetmanual.com/cat-owners/digestive-disorders-of-cats/disorders-of-the-stomach-and-intestines-in-cats','role':'GI neoplasia clinical signs'},
    {'id':'merck_lymphoma','name':'Merck Veterinary Manual — Immune System Tumors in Cats','url':'https://www.merckvetmanual.com/cat-owners/immune-disorders-of-cats/immune-system-tumors-in-cats','role':'Lymphoma clinical signs'},
    {'id':'merck_pyometra','name':'Merck Veterinary Manual — Reproductive Disorders of Female Cats','url':'https://www.merckvetmanual.com/cat-owners/reproductive-disorders-of-cats/reproductive-disorders-of-female-cats','role':'Pyometra clinical signs'},
    {'id':'merck_aki','name':'Merck Veterinary Manual — Renal Dysfunction in Small Animals','url':'https://www.merckvetmanual.com/urinary-system/noninfectious-diseases-of-the-urinary-system-in-small-animals/renal-dysfunction-in-small-animals','role':'Acute kidney injury clinical signs'},
    {'id':'merck_toxoplasmosis','name':'Merck Veterinary Manual — Toxoplasmosis in Cats','url':'https://www.merckvetmanual.com/cat-owners/disorders-affecting-multiple-body-systems-of-cats/toxoplasmosis-in-cats','role':'Toxoplasmosis clinical signs'},
    {'id':'merck_common_labs','name':'Merck Veterinary Manual — Common Laboratory Tests in Veterinary Medicine','url':'https://www.merckvetmanual.com/special-pet-topics/diagnostic-tests-and-imaging/common-laboratory-tests-in-veterinary-medicine','role':'General interpretation context for chemistry, CBC, and urinalysis measurements'},
    {'id':'merck_clinical_biochem','name':'Merck Veterinary Manual — Clinical Biochemistry','url':'https://www.merckvetmanual.com/clinical-pathology-and-procedures/diagnostic-procedures-for-the-private-practice-laboratory/clinical-biochemistry','role':'Clinical chemistry interpretation context'},
    {'id':'iris_ckd','name':'International Renal Interest Society — IRIS Staging System','url':'https://www.iris-kidney.com/iris-staging-system','role':'Renal biomarkers, proteinuria, and blood-pressure context'},
    {'id':'cornell_thyroid_tests','name':'Cornell Animal Health Diagnostic Center — Feline Thyroid Tests','url':'https://www.vet.cornell.edu/animal-health-diagnostic-center/testing/testing-protocols-interpretations/feline-thyroid-tests','role':'Feline thyroid-test interpretation context'},
]

pack = {
    'schemaVersion': 4,
    'packId': 'cat-practical-differentials-v0.4',
    'species': 'cat',
    'modelStatus': 'experimental-heuristic',
    'modelNotice': (
        'Experimental feline differential library. Scores are relative pattern-consistency values, not disease probabilities or diagnoses. '
        'Condition priors are deliberately not epidemiologic prevalence estimates; 2% of baseline model mass is reserved for Other / unmodeled condition.'
    ),
    'coverage': {
        'scope': 'Practical feline differential library combining owner observations with optional structured clinical evidence; not an exhaustive veterinary nosology.',
        'conditionCount': len(hypotheses),
        'namedConditionCount': len(conditions),
        'findingCount': len(findings),
        'ownerFindingCount': len([f for f in findings if f.get('sourceType','owner') == 'owner']),
        'clinicalFindingCount': len([f for f in findings if f.get('sourceType') == 'clinical']),
        'measurementTemplateCount': len(measurement_templates),
        'familyCount': len({h['family'] for h in hypotheses}),
        'priorPolicy': 'Named conditions share equal baseline prior weight; Other / unmodeled condition holds a 2% reserve prior.'
    },
    'hypotheses': hypotheses,
    'findings': findings,
    'measurementTemplates': measurement_templates,
    'likelihoods': likelihoods,
    'urgencyRules': urgency_rules,
    'sources': sources,
}

OUT.write_text(json.dumps(pack, indent=2) + '\n', encoding='utf-8')
print(f'Wrote {OUT}')
print(f"{len(hypotheses)} hypotheses ({len(conditions)} named + reserve), {len(findings)} findings, {len(sources)} sources")
