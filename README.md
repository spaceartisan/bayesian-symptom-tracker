# Bayesian Symptom Tracker v0.6.0

A local-first, GitHub Pages–compatible feline longitudinal health record and transparent Bayesian differential-pattern tracker.

This project is intentionally **not a casual symptom checker**. It is designed to retain a large amount of raw patient information over time, keep episodes analytically distinct, preserve provenance, and make the inference path inspectable. It does not diagnose disease and its numerical model is not clinically validated.

## Design principles

1. **Preserve raw information.** A recorded event remains part of the history even if it never happens again.
2. **Separate records from evidence.** The timeline can contain hundreds of entries without treating hundreds of correlated entries as hundreds of independent diagnostic tests.
3. **Keep episodes separate by default.** Prior episodes influence a newer episode only when the user explicitly links them.
4. **Retain known history.** Previous diagnoses can be stored with status, certainty/source, date, stage/grade, and provenance, and can optionally modify prior context.
5. **Distinguish evidence types.** Owner observations, clinical measurements, quantitative trends, diagnoses, treatments, studies, and diet are stored differently because they do not carry the same evidentiary meaning.
6. **Keep inference auditable.** The app exposes derived evidence, correlation discounts, temporal summaries, prior adjustments, and contribution to the leading condition.

The current pipeline is:

`raw longitudinal records → temporal/quantitative summaries → dependency-aware evidence → prior/history context → relative Bayesian pattern scores`

## Longitudinal observations

v0.6 supports three explicit observation outcomes:

- **Observed / present**
- **Checked and not observed**
- **Previously present — now resolved**

This allows an event to stay historically true without forcing the user to delete it when it stops.

Repeated entries are aggregated into temporal evidence. For example, repeated increased-thirst observations can establish persistence and duration, while a single vomiting event remains an isolated event. Repeated rows use saturating weights rather than unlimited multiplication.

Mutually exclusive state groups such as appetite, thirst, urine volume, energy, and weight preserve earlier states as historical evidence while giving the latest state primary weight.

## Correlation-aware evidence

v0.6 adds conservative dependency handling. Related evidence remains visible, but later evidence in the same physiological group is discounted rather than assumed independent.

Current groups include examples such as:

- increased thirst + increased urine volume
- blood glucose + urine glucose + fructosamine
- creatinine + BUN + SDMA
- ALT + ALP + bilirubin
- rapid/labored/open-mouth breathing
- weight gain/loss evidence

The correlation factors are inspectable in the versioned knowledge pack. They are heuristic dependency controls, not validated statistical covariance estimates.

## Quantitative clinical trends

Repeated numeric measurements are retained as full raw records and can also generate longitudinal trend summaries.

The trend engine currently supports mappings for:

- body weight → sustained gain/loss trend
- creatinine → rising renal-marker trend
- SDMA → rising renal-marker trend

A derived trend requires multiple measurements, a minimum time span, sufficient net change, and a minimum linear-fit quality. Thresholds are deliberately conservative and inspectable in `data/cat-knowledge-v0.6.json`.

**Units are never mixed in a regression.** Measurements with different units are kept as separate series unless a future version supplies an explicit validated conversion. This prevents, for example, lb and kg values from producing a meaningless slope.

## Clinical measurements

Structured results can store:

- actual value and unit
- date/time
- lab reference interval
- interpretation
- source
- confidence
- episode association
- notes
- whether the mapped result may enter the model

Numeric clinical evidence retains magnitude where an appropriate quantitative anchor or user-supplied reference interval exists. Repeated mapped results are summarized as serial clinical evidence with a saturating weight rather than multiplied as independent tests.

A numeric result is never automatically treated as a diagnosis. The model preserves competing explanations and the Model screen shows how much weight the record contributed.

## Prior diagnoses and linked episodes

A diagnosis record can store:

- library condition or custom condition
- confirmed/probable/suspected active status, historical/resolved status, or ruled-out status
- diagnosis date
- veterinarian/specialist/pathology/imaging/lab/owner/other source
- stage, grade, or qualifier
- linked episode
- notes and provenance
- explicit **Use as prior context** switch

Diagnosis history modifies prior context rather than pretending the diagnosis is a current symptom.

Episodes remain independent unless explicitly linked from **History**. Linked episode evidence is derived separately and enters the current model at a reduced historical weight; raw records are never copied into the new episode.

For retrospective cases, demographic age is calculated from the earlier of the episode start or the earliest attached evidence. A mistaken later episode creation date therefore does not silently make the patient older in the inference model. The History screen still warns when episode metadata begins after its evidence and offers an alignment control.

## Treatments and medications

v0.6 adds structured treatment/intervention history:

- medication, fluid therapy, procedure, supplement, diet therapy, or other
- start/end time
- dose
- route
- frequency
- reason/indication
- prescribing/directing source
- adherence
- observed response
- adverse effects
- notes/provenance
- optional episode link

Treatments and response are **context-only in v0.6**. They are intentionally not used as automatic diagnostic evidence because treatment choice and response can create circular reasoning without a carefully defined model.

## Diagnostic studies

Structured study records can retain ultrasound, radiograph, echocardiogram, CT, MRI, cytology, histopathology, endoscopy, examination findings, and other studies with date, body site, interpretation, source, result summary, provenance, and optional episode link.

Free-text study results are **context-only in v0.6**. A future version can add structured evidence mappings without discarding the original report text.

## Diet context

Food records support food form, brand/product, date range, moisture, protein, fat, fiber, carbohydrate, phosphorus, nutrient basis, feeding amount, and nutrition-data source.

Diet remains **context-only**. A low-carbohydrate food does not automatically increase or decrease a diabetes score, and a phosphorus value does not automatically push CKD. The raw context is preserved for longitudinal review and future defensible models.

## Urgency rules

Urgency is deterministic and independent of Bayesian ranking.

v0.6 timestamps each urgency flag from the actual finding that triggered it. A newer unrelated lab result or diagnostic study can no longer make an old emergency observation look current. Closed episodes and sufficiently old triggering observations are labeled historical.

## Knowledge pack

`data/cat-knowledge-v0.6.json` currently contains:

- **95 named feline condition patterns**
- **1 Other / unmodeled reserve hypothesis**
- **109 owner-observable findings**
- **30 clinical findings** including derived trend findings
- **30 structured measurement templates**
- **17 family labels** including the reserve/Other family
- provenance references and inspectable inference settings

The numerical priors, likelihoods, correlation factors, and trend weights are heuristic research values. They are **not** validated disease probabilities, sensitivities, specificities, or diagnostic likelihood ratios.

## Data storage and reports

The app requires no server:

- static HTML/CSS/JavaScript
- IndexedDB local storage
- service-worker offline support
- JSON backup/restore
- multi-pet records
- print / Save-to-PDF reports
- `.nojekyll` for GitHub Pages

Reports can optionally include Bayesian model output, urgency flags, clinical results, treatments, studies, diet, notes, and historical context.

## Migration

v0.6 migrates earlier state automatically to **state schema 5**. It preserves existing pets, episodes, observations, clinical measurements, diets, diagnoses, and settings, while adding:

- explicit observation `status`
- `treatments: []`
- `studies: []`
- newer report settings
- linked-history structures where needed

Legacy `present: true/false` observations remain compatible and are converted to explicit present/checked-absent status.

Always export a JSON backup before replacing a deployed version.

## Reproducible knowledge-pack build

`tools/upgrade_knowledge_v06.py` rebuilds the v0.6 knowledge pack from the retained v0.5 pack. It only transforms the knowledge pack; application/UI changes are not replayed by the script.

## Development validation

Run:

```bash
node --check app.js
node tests/smoke.mjs
node tests/state-smoke.mjs
python -m json.tool data/cat-knowledge-v0.6.json > /dev/null
```

See `VALIDATION.md` for the regression coverage, supplied-case audit, browser-rendering limitation, and remaining model limitations.
