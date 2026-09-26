# Bayesian Symptom Tracker v0.5.0

A local-first, GitHub Pages–compatible feline longitudinal health-record and Bayesian differential-pattern tracker.

The project is intentionally **not a casual symptom checker**. It is designed to retain large amounts of raw information over time while keeping episodes analytically distinct, preserving provenance, and making every inferential step inspectable.

## Core architecture

The app now separates five layers:

1. **Raw longitudinal record** — timestamped owner observations are never discarded just because the current model cannot use every detail.
2. **Current episode** — the primary analytical unit. Episodes have editable start/end dates and remain separate by default.
3. **Linked history** — prior episodes can be explicitly linked to a newer episode. Their evidence stays separate and is down-weighted rather than merged.
4. **Known patient history** — previous diagnoses can be recorded with date, status, source, stage/grade, linked episode, notes, and an explicit “use as prior context” switch.
5. **Context** — diet and nutrient composition are retained as contextual data and do not silently alter Bayesian scores.

Inference pipeline:

`raw observations → temporal summaries → clinical/history/prior context → relative Bayesian pattern scores`

## Longitudinal observation model

v0.5 no longer treats repeated symptom rows as independent duplicate tests.

Examples:

- One observation of increased thirst remains valid evidence indefinitely within its episode; it does not need to be deleted if it never recurs.
- Repeated thirst observations across days become evidence of **persistence/duration**, with a saturating evidence weight.
- Repeated vomiting observations become **recurrence** information rather than unlimited multiplicative evidence.
- A later state change (for example `appetite reduced → appetite normal`) preserves the old state as historical evidence while making the newer state primary.
- Explicit “checked and not observed” entries become negative/non-persistence evidence only when they occur after a prior positive or when no positive was recorded. Intensity is not used to strengthen an absence.

All raw rows remain in the timeline and JSON backup.

## Clinical measurements

Structured clinical results retain:

- actual numeric/categorical value
- units
- date/time
- lab reference interval
- interpretation
- source
- confidence
- episode association
- notes
- whether the mapped result may enter the model

Numeric results now retain **magnitude**. When a user-supplied lab reference interval exists, degree of abnormality modestly changes evidence strength. A small number of source-backed measurement anchors are also included where useful for interpretation. These anchors are not treated as diagnostic cutoffs. Repeated mapped results of the same clinical finding are summarized as a **serial clinical pattern** with a saturating weight, so daily glucose or creatinine measurements do not become dozens of independent tests.

Examples in the current pack include blood glucose, creatinine and SDMA. A single high glucose value remains compatible with stress hyperglycemia and is not converted into a diabetes diagnosis.

## Prior diagnoses

A diagnosis record can store:

- condition (library condition or custom)
- status: confirmed active, probable active, suspected active, confirmed resolved/historical, or ruled out
- date
- source: veterinarian, specialist, pathology, imaging, lab-supported, owner-entered, other
- stage/grade/qualifier
- linked episode
- notes/provenance
- explicit use-as-prior-context toggle

Diagnosis history changes **prior context**, not the current episode's observed likelihood evidence. Owner-entered diagnoses are automatically given less prior influence than veterinarian/specialist/pathology-supported records.

## Demographic context

The inference engine can apply small, transparent source-backed risk modifiers using patient data such as age and sex. These are intentionally limited and capped; they are not prevalence estimates.

The v0.5 pack currently includes examples for CKD, diabetes, hyperthyroidism, idiopathic cystitis, and urethral obstruction. Age is calculated at the **episode start**, which matters for historical cases.

## Episode linking

Episodes remain independent unless the user explicitly links them from **History**.

Linked episodes:

- remain separate in storage and reporting
- are not copied into the current episode
- contribute derived evidence at a reduced historical weight
- are visibly labeled as linked-history evidence in the model audit

This allows recurrent/chronic history to matter without contaminating unrelated episodes.

## Diet context

Food records support:

- wet/dry/raw/freeze-dried/home-cooked/treat/other
- brand and product
- date range
- moisture
- protein
- fat
- fiber
- carbohydrate
- phosphorus (% or mg/100 kcal)
- as-fed or dry-matter basis
- amount/feeding notes
- nutrition-data source

Diet remains **context-only** in v0.5. It is intentionally not used as a disease-likelihood shortcut.

## Condition library

The feline pack contains 95 named condition patterns plus an explicit **Other / unmodeled condition** reserve across 16 major families and more than 100 owner-observable findings, plus structured clinical findings.

The numerical priors and likelihood values are heuristic pattern weights. They are not validated sensitivities, specificities, likelihood ratios, or diagnostic probabilities.

## Transparency

The Model screen shows:

- condition-level relative pattern scores
- family aggregates
- derived evidence items
- temporal summary for repeated observations
- clinical evidence weight
- linked-history labels
- demographic/prior-diagnosis adjustments for the top condition
- evidence contribution to the current top score

This is intended to make disagreement auditable rather than opaque.

## Deterministic urgency rules

Urgency remains separate from Bayesian inference. Retrospective or closed episodes are labeled as **historical** when a red-flag rule is present so old data are not presented as a current emergency.

## Data storage / GitHub Pages

No server is required.

- Static HTML/CSS/JavaScript
- IndexedDB for local records
- Service worker for offline use
- JSON backup/restore
- Print / Save-to-PDF report
- `.nojekyll` included

Deploy the folder contents directly to a GitHub Pages branch/site.

## Migration

v0.5 migrates v0.4 state automatically:

- schema 3 → schema 4
- adds `diagnoses: []`
- adds `linkedEpisodeIds: []` to existing episodes
- preserves pets, observations, clinical results, diets and settings
- adds newer optional patient fields without removing old data

Always export a JSON backup before replacing a deployed version.

## Knowledge/provenance anchors

The included pack cites veterinary sources including Cornell University College of Veterinary Medicine, the Merck Veterinary Manual, and IRIS. Representative v0.5 additions use those sources for diabetes chronic-course/appetite context, age/risk context, CKD age context, lower urinary risk context, and renal/glucose measurement interpretation anchors.

These citations support qualitative relationships and clinical context; they **do not validate the app's numerical Bayesian weights**.

## Development validation

Run:

```bash
node tests/smoke.mjs
node tests/state-smoke.mjs
node --check app.js
python -m json.tool data/cat-knowledge-v0.5.json > /dev/null
```

See `VALIDATION.md` for the v0.5 validation record and remaining limitations.
