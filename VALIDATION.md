# Bayesian Symptom Tracker v0.9.0 — Validation Record

Date: 2026-09-26

## Release purpose

v0.9.0 adds a blinded historical-case validation workspace without changing the v0.7 knowledge pack, disease priors, condition likelihoods, temporal weighting, clinical weighting, or correlation discounts. Reference outcomes remain evaluation labels only and never feed back into inference.

## Static validation

Passed:

- `node --check app.js`
- `node tests/smoke.mjs`
- `node tests/state-smoke.mjs`
- `python -m json.tool data/cat-knowledge-v0.7.json`
- GitHub Pages relative/local asset inspection
- service-worker cache key bumped to `bst-v9-0`
- state migration bumped to schema 9

## Core inference regression coverage

The existing regression suite still verifies:

- 95 named feline condition patterns plus the explicit Other/unmodeled reserve
- broad canonical patterns across endocrine, renal/urinary, infectious, cardiovascular, gastrointestinal, and other systems
- longitudinal owner-observation aggregation rather than naïve duplicate multiplication
- symptom resolution and state transitions without deleting earlier history
- quantitative clinical-result magnitude handling
- serial clinical-result saturation
- body-weight, creatinine, and SDMA trend derivation where source data permit it
- dependency/correlation discounts
- deterministic urgency independent from Bayesian ranking
- diet, treatment response, and free-text diagnostic-study context remaining non-inferential
- prior diagnoses affecting priors only when explicitly enabled
- linked prior episodes remaining separate until explicitly linked
- linked-history evidence entering at reduced weight
- unit-safe quantitative trends
- retrospective timestamp defaults and monitoring behavior

## Replay / as-of regression coverage

Replay tests verify that:

- observations after the cutoff are excluded
- clinical results after the cutoff are excluded
- future emergency findings cannot trigger the as-of urgency state
- future dated diagnoses cannot alter priors before their date
- undated diagnoses are excluded from strict as-of priors
- advancing the cutoff makes later evidence available without rewriting raw records
- useful-next-observation calculations use only in-scope evidence
- future observations do not suppress questions that were still unknown at the replay point
- replay trajectory calculations do not mutate the saved cutoff
- replay trajectory rows never extend beyond the current cutoff
- demographic analysis uses the in-scope replay evidence bound rather than unrestricted future episode records

## Reference-outcome isolation

Tests verify that:

- reference outcomes never become model evidence
- adding, revealing, editing, or blinding a reference outcome does not change Bayesian scores
- hidden outcomes remain invisible during replay before their recorded outcome date
- mapped visible outcomes can report their current differential rank
- reference outcomes do not enter monitoring or urgency logic

## v0.9 validation-workspace coverage

The new validation tests verify that:

- mapped visible reference outcomes become evaluable validation targets
- the default validation cutoff is the latest episode evidence on or before the recorded outcome date
- an explicit evaluation cutoff can override that default
- evidence after the validation cutoff cannot improve the retrospective rank
- validation calculations restore the previously active pet, episode, replay mode, and replay cutoff
- strict diagnosis blindness excludes diagnosis-prior records dated on the evaluation-cutoff day or later
- still-blinded saved replay cases are excluded from aggregate metrics
- custom/unmapped outcomes are excluded from top-k/MRR denominators rather than counted as model failures
- top-1, top-3, top-5 capture, mean reciprocal rank, median final rank, best rank, and first-top-5 timing are computed from reference-outcome rank
- final-rank evaluation is exact at the selected cutoff
- dense trajectory display can be sampled for performance and reports that fact
- cohort CSV export contains visible/evaluable mapped outcomes and rank metrics
- the Validation page exposes cohort metrics and active-case trajectory details

## Supplied-case audit

The user's historical diabetes case remains an **audit case**, not a target-answer regression test. No assertion requires diabetes, CKD, or any other condition to rank first.

Running the unchanged supplied JSON through v0.9.0 with all evidence produces approximately:

- Diabetes mellitus: **15.92%** relative pattern-consistency
- Diabetic ketoacidosis: **4.12%**
- Multicentric/systemic lymphoma: **3.44%**
- Chronic kidney disease: **3.21%**

These are not disease probabilities and the ordering is not treated as proof of a diagnosis. v0.9.0 intentionally leaves the underlying condition model unchanged while adding tools to evaluate it across many historical cases.

## Rendering evidence

The Node VM regression suite exercises application-side rendering for Dashboard/Model/Monitoring/History/Validation behavior. Chromium continues to hang or be blocked in this container, so this release does not claim an interactive Chromium smoke test.

A static visual render of the **actual `renderValidationPage()` output** was generated with the project's CSS via WeasyPrint and rasterized to `docs/screenshots/validation-v09.png`. This is useful for layout inspection but is not presented as a live-browser interaction test.

## Remaining scientific/model work

v0.9.0 remains an experimental inference framework and is **not clinically validated**. Important remaining work includes calibration against a much larger blinded veterinary case library, broader source-backed priors and demographic modifiers, validated test-specific likelihood-ratio support where evidence permits it, stronger dependency structures, structured imaging/pathology/exam evidence, treatment-response modeling that avoids indication/circularity bias, broader unit normalization and quantitative trends, and external prospective validation before any diagnostic or clinical-decision claim.

The app preserves raw records and provenance so future models can reprocess historical data without requiring re-entry.
