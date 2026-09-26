# Bayesian Symptom Tracker v0.5.0 — Validation Record

Date: 2026-09-26

## Static validation

Passed:

- `node --check app.js`
- `python -m json.tool data/cat-knowledge-v0.5.json`
- GitHub Pages uses only relative local paths
- service worker cache updated to `cat-knowledge-v0.5.json`
- no server-side dependency introduced

## Knowledge-pack regression tests

`node tests/smoke.mjs` passes:

- knowledge schema/provenance integrity
- 95 named feline condition patterns + unmodeled reserve retained
- source references for demographic modifiers and quantitative anchors resolve
- posterior normalization
- broad canonical patterns across multiple systems, including:
  - hyperthyroidism
  - diabetes mellitus
  - FIP
  - urethral obstruction
  - congestive heart failure
  - pancreatitis with clinical evidence
  - CKD in an older cat with creatinine/SDMA evidence
- deterministic urgency rules remain separate from Bayesian inference
- repeated raw observations are aggregated into a saturating temporal evidence weight
- state transitions preserve prior historical evidence without leaving two states equally “current”
- a 400 mg/dL glucose result carries more clinical-evidence weight than a barely-above-anchor result while remaining a mapped finding rather than a diagnosis
- repeated mapped clinical values are summarized into a saturating serial-evidence weight rather than multiplied as independent tests

## State / longitudinal regression tests

`node tests/state-smoke.mjs` passes:

- v0.4 state schema migrates to v0.5 schema without losing existing records
- diagnosis-history collection is created on migration
- old episodes receive an empty linked-history list
- diet context remains non-inferential
- confirmed diagnosis history changes prior context only when explicitly enabled
- prior episodes do not influence the current episode until explicitly linked
- linked history is visibly/reliably down-weighted
- retrospective episode evidence bounds are derived from the actual raw observation/clinical timestamps

## Supplied-case audit

The user's supplied v0.4 JSON was loaded into the v0.5 inference engine **without hard-coding an expected diagnosis**.

Audit findings:

- the 400 mg/dL blood glucose record remains attached to the same episode and retains its raw value
- v0.5 converts repeated owner entries into longitudinal summaries rather than independent duplicates
- the clinical glucose record receives quantitative magnitude weighting
- age is evaluated at episode start
- source-backed diabetes pattern representation now includes chronic course and recognizes that decreased appetite can occur in diabetic cats
- source-backed CKD age context modestly lowers CKD prior consistency in a young cat without excluding CKD

The supplied case is intentionally **not encoded as a pass/fail expected-winner test**. It is used as an audit case so future model changes cannot simply be tuned to produce a desired condition.

## Browser rendering

A fresh Chromium CLI rendering pass could not be completed in this container because the installed Chromium process hangs before normal headless completion, including on a trivial `data:` page. This appears environment-level rather than app-specific. No successful browser screenshot is claimed for v0.5.

The application-side rendering functions are exercised in the Node VM regression tests, and previous v0.4 browser rendering was successful before the container-level Chromium issue appeared.

Older-version screenshots are intentionally excluded from the v0.5 package so they cannot be mistaken for fresh v0.5 visual validation.

## Important model limitations

v0.5 is still an experimental inference framework, not a clinically validated diagnostic model.

Remaining work includes:

- systematic calibration against larger blinded veterinary case sets
- more condition-specific demographic/risk modifiers where good evidence exists
- validated negative-test evidence mappings
- correlation/dependency handling for clinical tests that share physiology
- better representation of medications/treatments and response-to-treatment evidence
- longitudinal quantitative trend fitting for weight, glucose, creatinine, SDMA and other serial measurements
- imaging/pathology result structures
- source-specific diagnostic-test sensitivity/specificity or likelihood-ratio support where high-quality veterinary evidence is available

The design intentionally preserves raw data so later inference versions can reprocess old records without requiring the user to re-enter them.
