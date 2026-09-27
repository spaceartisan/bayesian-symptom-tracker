#!/usr/bin/env python3
"""Rebuild the v0.7 feline knowledge pack from v0.6.

v0.7 adds explicit non-clinical monitoring metadata used only to prioritize
longitudinal re-checks. These cadence values are data-quality heuristics, not
veterinary follow-up recommendations and do not change disease likelihoods.
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src = ROOT / "data" / "cat-knowledge-v0.6.json"
dst = ROOT / "data" / "cat-knowledge-v0.7.json"
k = json.loads(src.read_text(encoding="utf-8"))

k["schemaVersion"] = 7
k["packId"] = "cat-practical-differentials-v0.7"
k["modelNotice"] = (
    "Experimental, non-clinically validated feline differential-pattern model. "
    "Relative scores are not disease probabilities. Longitudinal monitoring prompts "
    "are data-quality heuristics, not veterinary recheck recommendations."
)
k["coverage"]["scope"] = (
    "Practical feline differential library with owner observations, longitudinal symptom states, "
    "quantitative clinical trends, structured measurements, prior diagnoses, linked historical "
    "episodes, treatment/study context, demographic context, monitoring/reassessment metadata, "
    "and an explicit unmodeled reserve."
)
k["coverage"]["inferenceArchitecture"] = (
    "Raw records are preserved. Inference uses temporal summaries, quantitative trends, "
    "correlation-aware evidence weighting, clinical/history context and transparent prior adjustments. "
    "A separate monitoring engine prioritizes longitudinal re-checks without treating repeated checks "
    "as independent diagnostic evidence."
)

k["monitoringConfig"] = {
    "policy": (
        "Monitoring cadence is an application data-quality heuristic. It prioritizes when a recorded "
        "state may be worth updating; it is not a veterinary follow-up interval or medical recommendation."
    ),
    "stateRecheckHours": 24,
    "eventRecheckHours": 48,
    "absenceRecheckHours": 72,
    "baselineStateMultiplier": 3.0,
    "cadenceFactors": {"intensive": 0.5, "standard": 1.0, "sparse": 3.0},
    "confidenceCadenceFactors": {"low": 0.55, "medium": 0.78, "high": 1.0},
    "severityCadenceFactors": {"low": 1.25, "medium": 1.0, "high": 0.70},
    "monitoringVirtualWeight": 0.45,
    "maxOverduePriorityFactor": 3.0,
    "queueLimit": 12,
    "newQuestionLimit": 6
}

for f in k["findings"]:
    if f.get("sourceType") == "clinical":
        continue
    mode = f.get("temporalMode") or ("state" if f.get("stateGroup") else "event")
    if mode == "context":
        f["monitoringClass"] = "context_once"
    elif f.get("stateGroup"):
        label = (f.get("label") or "").lower()
        fid = f.get("id", "")
        is_baseline = fid.endswith("_normal") or "normal" in label
        f["monitoringClass"] = "baseline_state" if is_baseline else "state"
    else:
        f["monitoringClass"] = "event"

# monitoring metadata does not alter likelihoods, priors, risk modifiers, or urgency rules.
dst.write_text(json.dumps(k, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(dst)
