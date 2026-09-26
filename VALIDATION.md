# Bayesian Symptom Tracker v0.6.0 — Validation Record

Date: 2026-09-26

## Static validation

Passed:

- `node --check app.js`
- `python -m json.tool data/cat-knowledge-v0.6.json`
- v0.6 knowledge-pack rebuild via `tools/upgrade_knowledge_v06.py`
- knowledge-pack coverage counts agree with the actual arrays
- GitHub Pages uses relative local assets only
- service worker caches `cat-knowledge-v0.6.json`
- no server-side dependency introduced

## Knowledge-pack / inference regression tests

`node tests/smoke.mjs` passes:

- schema/provenance integrity
- 95 named condition patterns plus explicit Other/unmodeled reserve retained
- source references for demographic modifiers, quantitative anchors, and trend mappings resolve
- broad canonical patterns across several systems, including hyperthyroidism, diabetes mellitus, FIP, urethral obstruction, congestive heart failure, pancreatitis, and CKD with renal clinical evidence
- repeated owner observations become saturating longitudinal evidence rather than independent duplicate tests
- state changes preserve historical evidence while keeping the latest state primary
- explicit symptom resolution is retained without deleting the original event
- a 400 mg/dL glucose record retains greater quantitative evidence weight than a barely-above-anchor value, without being converted into a diagnosis
- repeated clinical values saturate rather than multiply without bound
- serial body-weight measurements can derive a measured weight-change trend
- correlated evidence remains visible but receives dependency discounts
- deterministic urgency rules remain separate from Bayesian inference

## State / longitudinal regression tests

`node tests/state-smoke.mjs` passes:

- previous state migrates to state schema 5
- diagnoses, treatments, studies, and linked-episode structures are created without removing old records
- diet remains non-inferential
- treatments remain non-inferential
- diagnostic-study narrative context remains non-inferential
- confirmed diagnosis history changes prior context only when explicitly enabled
- prior episodes do not influence the current episode until explicitly linked
- linked-history evidence enters at reduced weight
- retrospective evidence bounds are derived from raw record timestamps
- demographic analysis start automatically uses earlier retrospective evidence when episode metadata starts too late
- urgency age is calculated from the actual triggering red-flag observation rather than an unrelated newer study/result
- numeric trend regression does not mix different units
- same-unit serial measurements can still derive trend evidence
- Context, History, and Model pages expose the new controls and audit information in application-side rendering tests

## Supplied-case audit

The user's supplied v0.4 JSON is retained as an **audit case**, not as a target-answer regression test. No assertion says that diabetes, CKD, or any other condition must rank first.

Running that unchanged case through the generalized v0.6 inference pipeline currently gives approximately:

- Diabetes mellitus: **15.92%** relative pattern-consistency
- Diabetic ketoacidosis: **4.12%**
- Multicentric/systemic lymphoma: **3.44%**
- Chronic kidney disease: **3.21%**

These values are **not diagnostic probabilities** and the ordering is not treated as validation. The audit is useful because it confirms that the case is being reprocessed through the same general rules as every other case.

For that audit case, v0.6 derives owner evidence from persistence/recurrence rather than duplicate rows, preserves the 400 mg/dL glucose as quantitative clinical evidence, applies dependency discounting to related PU/PD evidence, and uses patient age at the effective retrospective analysis start.

## Browser rendering

A fresh Chromium CLI rendering pass is not claimed for v0.6. The Chromium binary in this container has been hanging before normal headless completion, including on a trivial page, which is an environment-level limitation observed during the prior release work.

Application-side render functions are exercised through the Node VM tests. Older-version screenshots are not presented as v0.6 screenshots.

## Important model limitations

v0.6 remains an experimental inference framework and is **not clinically validated**.

Important remaining work includes:

- calibration against a substantially larger blinded veterinary case set
- wider source-backed condition-specific priors and demographic modifiers
- validated negative-test evidence and test-specific likelihood-ratio support where veterinary evidence permits it
- more complete dependency/correlation structures rather than heuristic group discounts
- structured evidence mappings for imaging, pathology, physical examination, and other diagnostic studies
- treatment-response modeling that avoids indication and circularity bias
- robust unit conversion/normalization where conversions are scientifically unambiguous; v0.6 instead separates unlike units
- more quantitative trend mappings beyond body weight, creatinine, and SDMA
- a richer monitoring/question engine that can intentionally re-check persistent states over long episodes instead of treating every previously asked question as permanently complete
- external prospective validation before any diagnostic or clinical-decision claim

The app deliberately preserves raw records and provenance so later inference versions can reprocess historical data without requiring re-entry.
