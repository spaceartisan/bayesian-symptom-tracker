#!/usr/bin/env python3
"""Build cat-knowledge-v0.6.json from v0.5.

This script changes only the versioned knowledge pack. Application/state/UI changes
for v0.6 live in app.js and are intentionally not replayed by this tool.
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "cat-knowledge-v0.5.json"
DST = ROOT / "data" / "cat-knowledge-v0.6.json"

with SRC.open(encoding="utf-8") as f:
    d = json.load(f)

d["schemaVersion"] = 6
d["packId"] = "cat-practical-differentials-v0.6"
d["modelStatus"] = "experimental / research-oriented, not clinically validated"
d["modelNotice"] = (
    "Longitudinal, correlation-aware evidence model with quantitative trend summaries, "
    "linked history, prior diagnoses and structured clinical context. Scores are relative "
    "pattern-consistency values, not diagnostic probabilities."
)
d["coverage"]["scope"] = (
    "Practical feline differential library with owner observations, longitudinal symptom states, "
    "quantitative clinical trends, structured measurements, prior diagnoses, linked historical "
    "episodes, treatment/study context, demographic context, and an explicit unmodeled reserve."
)
d["coverage"]["priorPolicy"] = (
    "Base hypothesis priors remain deliberately broad. Small source-backed demographic modifiers "
    "and explicit prior-diagnosis modifiers are applied transparently. Correlated evidence is "
    "conservatively discounted rather than assumed independent. These remain heuristic context "
    "adjustments, not epidemiologic disease probabilities."
)
d["coverage"]["inferenceArchitecture"] = (
    "Raw records are preserved. Inference uses temporal summaries, quantitative trends, "
    "correlation-aware evidence weighting, clinical/history context and transparent prior "
    "adjustments rather than treating every row as an independent test."
)

cfg = d.setdefault("inferenceConfig", {})
cfg.update(
    {
        "resolutionBaseWeight": 0.82,
        "correlationGroupFactors": [1.0, 0.68, 0.45, 0.30, 0.22],
        "trendEvidenceBaseWeight": 0.82,
        "trendMinPoints": 3,
        "trendMinSpanDays": 7,
        "trendMinRelativeChange": 0.05,
        "trendMinR2": 0.45,
    }
)

sources = {s["id"]: s for s in d["sources"]}
if "aaha_aafp_lifestage" not in sources:
    d["sources"].append(
        {
            "id": "aaha_aafp_lifestage",
            "name": "2021 AAHA/AAFP Feline Life Stage Guidelines — Medical History and Physical Examination Focus",
            "url": "https://www.aaha.org/resources/2021-aaha-aafp-feline-life-stage-guidelines/pe-and-history-focus/",
            "role": "Supports retaining previous medical/surgical history, medications/supplements, diet, body weight/condition and longitudinal trend information across feline life stages",
        }
    )
if "merck_renal_dysfunction" not in sources:
    d["sources"].append(
        {
            "id": "merck_renal_dysfunction",
            "name": "Merck Veterinary Manual — Renal Dysfunction in Dogs and Cats",
            "url": "https://www.merckvetmanual.com/urinary-system/noninfectious-diseases-of-the-urinary-system-in-small-animals/renal-dysfunction-in-small-animals",
            "role": "Supports serial creatinine/SDMA trend interpretation and the use of repeated renal laboratory evaluation in CKD assessment",
        }
    )

correlation_groups = {
    "thirst_increased": "polyuria_polydipsia",
    "urine_increased": "polyuria_polydipsia",
    "weight_loss": "weight_change",
    "weight_gain": "weight_change",
    "blood_glucose_high": "glycemic_dysregulation",
    "fructosamine_high": "glycemic_dysregulation",
    "urine_glucose_positive": "glycemic_dysregulation",
    "creatinine_high": "renal_filtration",
    "bun_high": "renal_filtration",
    "sdma_high": "renal_filtration",
    "alt_high": "hepatobiliary",
    "alp_high": "hepatobiliary",
    "bilirubin_high": "hepatobiliary",
    "resp_rapid": "respiratory_distress",
    "resp_distress": "respiratory_distress",
    "open_mouth_breathing": "respiratory_distress",
}
for finding in d["findings"]:
    group = correlation_groups.get(finding["id"])
    if group:
        finding["evidenceGroup"] = group

existing = {f["id"] for f in d["findings"]}
for finding in (
    {
        "id": "creatinine_rising",
        "category": "Clinical · Trend",
        "label": "Creatinine rising over serial measurements",
        "question": "Is creatinine rising over serial measurements?",
        "sourceType": "clinical",
        "temporalMode": "trend",
        "evidenceGroup": "renal_filtration",
    },
    {
        "id": "sdma_rising",
        "category": "Clinical · Trend",
        "label": "SDMA rising over serial measurements",
        "question": "Is SDMA rising over serial measurements?",
        "sourceType": "clinical",
        "temporalMode": "trend",
        "evidenceGroup": "renal_filtration",
    },
):
    if finding["id"] not in existing:
        d["findings"].append(finding)

for template in d.get("measurementTemplates", []):
    if template["id"] == "body_weight":
        template["trendMap"] = {"decreasing": "weight_loss", "increasing": "weight_gain"}
        template["trendSourceRef"] = "aaha_aafp_lifestage"
        template["trendRole"] = "Measured body-weight change is retained and summarized as a longitudinal trend."
    elif template["id"] == "creatinine":
        template["trendMap"] = {"increasing": "creatinine_rising"}
        template["trendSourceRef"] = "merck_renal_dysfunction"
        template["trendRole"] = "Serial increases can be clinically relevant even when individual values remain within a reference interval."
    elif template["id"] == "sdma":
        template["trendMap"] = {"increasing": "sdma_rising"}
        template["trendSourceRef"] = "merck_renal_dysfunction"
        template["trendRole"] = "Serial SDMA trends can reveal declining renal function over time."

for hypothesis_id, likelihoods in d["likelihoods"].items():
    if hypothesis_id == "chronic_kidney_disease":
        likelihoods["creatinine_rising"] = 0.84
        likelihoods["sdma_rising"] = 0.84
    elif hypothesis_id == "acute_kidney_injury":
        likelihoods["creatinine_rising"] = 0.74
        likelihoods["sdma_rising"] = 0.68
    elif hypothesis_id == "renal_neoplasia":
        likelihoods["creatinine_rising"] = 0.62
        likelihoods["sdma_rising"] = 0.58

coverage = d["coverage"]
coverage["conditionCount"] = len(d["hypotheses"])
coverage["namedConditionCount"] = sum(h["id"] != "other_unmodeled" for h in d["hypotheses"])
coverage["findingCount"] = len(d["findings"])
coverage["ownerFindingCount"] = sum(f.get("sourceType") != "clinical" for f in d["findings"])
coverage["clinicalFindingCount"] = sum(f.get("sourceType") == "clinical" for f in d["findings"])
coverage["measurementTemplateCount"] = len(d.get("measurementTemplates", []))
coverage["familyCount"] = len({h.get("family", "Other") for h in d["hypotheses"]})

with DST.open("w", encoding="utf-8") as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"wrote {DST}")
