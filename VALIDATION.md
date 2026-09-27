# Bayesian Symptom Tracker v0.10.3 — Validation Record

Date: 2026-09-27

## Release purpose

v0.10.3 completes the Progressive Web App packaging so the GitHub Pages deployment is installable on supported desktop and mobile browsers while preserving local-first IndexedDB behavior. No Bayesian inference parameters, knowledge-pack mappings, or state schema values change in this release.


## v0.10.3 PWA validation

Passed:

- `manifest.webmanifest` parses as valid JSON and contains GitHub Pages-safe relative `id`, `start_url`, and `scope` values
- 192×192 and 512×512 install icons exist with declared dimensions
- a 512×512 maskable icon exists and is declared with `purpose: maskable`
- Apple touch icon and 32×32 favicon exist
- `index.html` links the manifest, favicon, Apple touch icon, theme color, and standalone-capable metadata
- service-worker cache key advanced to `bst-v10-3` and precaches the manifest/icons along with the existing offline shell
- service-worker navigation fallback remains scoped to the GitHub Pages project path
- Settings renders an install card and binds the install action without changing application state or Bayesian inference
- app version advanced to `0.10.3`; state schema remains 10 and knowledge pack remains `cat-practical-differentials-v0.8`

## Static validation

Passed:

- `node --check app.js`
- `node tests/smoke.mjs`
- `node tests/state-smoke.mjs`
- `python tests/pwa-smoke.py`
- `python -m json.tool data/cat-knowledge-v0.8.json`
- GitHub Pages relative/local asset inspection
- service-worker cache key bumped to `bst-v10-3`
- state migration bumped to schema 10


## v0.10.2 structured diagnostic-study evidence

New regression checks verify that:

- `Pleural effusion identified` exists as a clinical/imaging finding distinct from the `Pleural effusion` hypothesis
- the structured finding is discoverable in the Diagnostic Study form
- a narrative diagnostic study remains non-inferential by default
- a structured finding remains non-inferential until the user explicitly enables **Use in model**
- a present, enabled pleural-effusion study creates one structured-study evidence item
- the matching Pleural effusion hypothesis rises when that evidence is enabled
- `Not identified` does not silently become negative Bayesian evidence
- repeated structured-study records are summarized rather than multiplied as independent evidence
- the Model page includes a condition-library search hook so Pleural effusion is directly discoverable
- linked historical structured-study findings enter only through explicit linked-history logic and at reduced historical weight

The knowledge-pack mapping uses source-backed qualitative associations from Cornell's feline lung/pleural-effusion guidance and the Merck Veterinary Manual's feline chest-cavity guidance. Numerical weights remain heuristic and unvalidated.

## v0.10.1 dashboard/date-integrity hotfix

This point release does **not** change priors, likelihoods, clinical multipliers, temporal evidence weights, correlation discounts, or any other Bayesian inference parameter.

Additional checks verify that:

- compact Dashboard reassessment cards emit a dedicated stacked-layout hook so their action buttons cannot crush the prompt text into a narrow column
- the Dashboard's **Episode Duration** uses the explicit episode start rather than silently substituting the earliest evidence timestamp
- evidence that predates the recorded episode start raises an explicit temporal-integrity warning instead of only producing an implausibly large duration
- timestamps outside the current calendar year display their year, reducing ambiguity during retrospective reconstruction
- the service-worker cache key is bumped so GitHub Pages clients receive the CSS/JS hotfix

## Rendering note

The dashboard hotfix was validated through application-side HTML generation and regression assertions. A fresh Chromium screenshot attempt in the container stalled at the Chromium process level, so this release does not claim a new interactive-browser screenshot.

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

## Differential-workup separation

New tests verify that:

- a record-only workup milestone does **not** change Bayesian scores
- `Under consideration` is always non-constraining
- only a mapped library condition can become an inferential workup constraint
- a mapped, explicitly enabled `Ruled out` / `Less likely` milestone can suppress that condition in the **combined** differential
- a mapped, explicitly enabled `Supported` / `Confirmed` / `Final diagnosis` milestone can support that condition in the combined differential
- the unconstrained/model-before-workup ranking remains separately reproducible
- the latest eligible milestone for one condition supersedes older milestones for that same condition rather than multiplying the whole workup history together
- later record-only state can supersede an earlier active constraint without deleting the earlier event
- workup milestones from a linked historical episode do not silently constrain the current episode
- Differential-page rendering exposes model-before-workup and combined ranks separately
- workup milestones are retained in the episode timeline/history and reports

The workup strength multipliers are intentionally finite and inspectable:

| Strength | Support | Suppress |
| --- | ---: | ---: |
| Weak | 1.35× | 0.74× |
| Moderate | 1.90× | 0.50× |
| Strong | 4.00× | 0.18× |
| Definitive | 12.00× | 0.03× |

These are **heuristic clinical-reasoning controls, not validated likelihood ratios**. They represent an explicit user/clinician workup decision and are never reported as native performance of the Bayesian evidence model.

## Replay / as-of regression coverage

Replay tests verify that:

- observations after the cutoff are excluded
- clinical results after the cutoff are excluded
- workup milestones after the cutoff are excluded
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

## v0.10 blinded validation metrics

Validation now deliberately reports **two performance layers**:

1. **Model-only / model-before-workup** — differential rank with workup constraints disabled.
2. **Combined** — differential rank after eligible, explicitly enabled clinical-workup constraints known by that point in time.

Tests verify that:

- mapped visible reference outcomes become evaluable validation targets
- the default validation cutoff is the latest episode evidence on or before the recorded outcome date
- an explicit evaluation cutoff can override that default
- evidence after the validation cutoff cannot improve retrospective rank
- validation calculations restore the previously active pet, episode, replay mode, and replay cutoff
- strict diagnosis blindness excludes diagnosis-prior records dated on the evaluation-cutoff day or later
- strict blindness also excludes confirming/final-diagnosis workup milestones at/after the cutoff where they could reveal the target answer
- still-blinded saved replay cases are excluded from aggregate metrics
- custom/unmapped outcomes are excluded from top-k/MRR denominators rather than counted as model failures
- top-1, top-3, top-5 capture, reciprocal rank, median final rank, best rank, and first-top-5 timing are computed independently for the model-only and combined layers where applicable
- final-rank evaluation is exact at the selected cutoff
- dense trajectory display can be sampled for performance and reports that fact
- cohort CSV export includes both model-only and combined rank/score fields
- the Validation page exposes the paired ranks so clinical narrowing is not falsely credited to the model

## Supplied-case audit

The user's historical diabetes case remains an **audit case**, not a target-answer regression test. No assertion requires diabetes, CKD, or any other condition to rank first.

v0.10.2 changes only the new structured-study finding path and the specific source-backed pleural-effusion associations in knowledge pack v0.8. Existing v0.7 owner-observation, lab, trend, prior, temporal, and workup weights are otherwise unchanged. Therefore, **when no differential-workup constraints are added**, the underlying evidence-model ranking is expected to remain the same as v0.9 for the same saved case and replay scope. The workup layer can only modify the separately identified combined differential when the user explicitly enables a mapped constraint.

The known outcome is never inserted as an automatic workup constraint.

## Rendering evidence

The Node VM regression suite exercises application-side rendering for Dashboard/Model/Monitoring/History/Differential/Validation behavior.

A v0.10 Differential-workup static render is generated from the actual `renderDifferentialPage()` output for layout inspection when the container renderer is available. Static render evidence is not represented as an interactive browser smoke test.

## Remaining scientific/model work

v0.10.2 remains an experimental inference framework and is **not clinically validated**. Important remaining work includes:

- calibration against a much larger blinded veterinary case library
- source-backed test-specific likelihood ratios/distributions where defensible
- broader and better-sourced epidemiologic/demographic priors
- stronger dependency structures and conditional relationships
- explicit ontology/family-proximity scoring for near-hit validation
- structured imaging, cytology, histopathology, necropsy, and examination evidence
- treatment-response modeling that avoids indication/circularity bias
- broader unit normalization and quantitative trend support
- explicit modeling of comorbidity/multiple simultaneous conditions
- external prospective validation before any diagnostic or clinical-decision claim

The app preserves raw records, workup chronology, provenance, and model-before-workup rankings so future inference models can reprocess historical cases without requiring re-entry and without confusing clinician narrowing with model performance.
