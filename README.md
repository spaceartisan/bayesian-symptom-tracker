# Bayesian Symptom Tracker v0.8.0

A local-first, GitHub Pages–compatible feline longitudinal health record and transparent Bayesian differential-pattern tracker.

This project is intentionally **not a casual symptom checker**. It is designed to retain large amounts of raw patient information over time, keep episodes analytically distinct, preserve provenance, derive longitudinal state from repeated records, and make the inference path inspectable. It does not diagnose disease and its numerical model is not clinically validated.

## Design principles

1. **Preserve raw information.** A recorded event remains part of the history even if it never happens again.
2. **Separate records from evidence.** Hundreds of timeline rows are not treated as hundreds of independent diagnostic tests.
3. **Keep episodes separate by default.** Prior episodes influence a newer episode only when the user explicitly links them.
4. **Retain known history.** Previous diagnoses can be stored with status, certainty/source, date, stage/grade, and provenance, and can optionally modify prior context.
5. **Distinguish evidence types.** Owner observations, clinical measurements, quantitative trends, diagnoses, treatments, studies, and diet are stored differently because they do not carry the same evidentiary meaning.
6. **Separate inference from monitoring.** The Bayesian engine estimates relative pattern consistency; the monitoring engine decides which already-recorded findings may be worth reassessing. Monitoring cadence never changes disease likelihoods.
7. **Keep everything auditable.** Derived evidence, temporal summaries, dependency discounts, quantitative weighting, prior adjustments, and monitoring priorities are inspectable.

The inference pipeline is:

`raw longitudinal records → temporal/quantitative summaries → dependency-aware evidence → prior/history context → relative Bayesian pattern scores`

The monitoring pipeline is separate:

`raw observations → current symptom/state summary → elapsed time + uncertainty + discriminatory value → reassessment queue`


## v0.8 case replay / as-of analysis

v0.8 adds a **case replay** layer for rigorous retrospective reconstruction. This is designed for situations where a complete historical case is already stored but the user wants to ask, “What would the model have known at this point in time?” without allowing later evidence to leak backward.

Each episode can now use either:

- **Use all episode evidence** — the normal longitudinal analysis.
- **Replay / analyze as of a date** — only dated evidence at or before the cutoff is allowed into inference.

When replay is active, the cutoff applies consistently to:

- owner-observation evidence
- clinical measurements and quantitative trends
- monitoring/reassessment state
- urgency-rule state
- expected-information-gain / useful-next-observation prompts
- dated prior diagnoses
- explicitly linked historical episode evidence

Later records remain stored and visible in the full timeline. They are excluded from inference rather than deleted or copied.

The Model page provides **First evidence**, **Previous**, **Next**, and **Latest evidence** controls plus a direct cutoff date/time field. It also shows a read-only **differential trajectory** that replays selected evidence timestamps and reports the leading three condition-pattern scores at each snapshot. While replay is active, that trajectory stops at the current cutoff so it cannot reveal future snapshots. The trajectory does not mutate the saved episode or the current cutoff.

For retrospective data entry, `entryDateMode = analysis_cutoff` can make new observation, clinical-result, treatment, and diagnostic-study forms default to the current replay point. If **advance replay cutoff on save** is enabled, saving a record at or after the current replay point advances the analysis to that record; backfilling an older record does not rewind the replay automatically.

This creates a reproducible blinded-case workflow:

`set replay point → inspect differential → ask useful next question → enter only evidence known by then → advance replay → repeat`

The replay feature changes **which evidence is in scope**, not any disease prior, likelihood, or evidence weight. v0.8 intentionally leaves the v0.7 knowledge pack unchanged.

## Reference outcomes and blinded validation

v0.8 also adds a deliberately separate **reference-outcome** record for retrospective model evaluation. A reference outcome is the known final diagnosis or other case label used to check how the differential behaved; it is **not** a diagnosis-prior record and never enters Bayesian inference.

A reference outcome can store:

- a condition from the differential library or a custom outcome label
- outcome date
- certainty (confirmed / probable / suspected / historical record)
- source (veterinarian, specialist, pathology, necropsy, medical record, other, or owner-entered)
- notes / provenance
- whether the answer should remain hidden during replay until its recorded date

When **Hide this answer during replay** is enabled, the Model page reports that a validation outcome exists but does not reveal its label before the outcome date. After the replay reaches that date—or when all-evidence analysis is restored—the outcome is revealed together with the condition's current differential rank when it maps to the condition library.

Reference outcomes are intentionally non-inferential. They do **not** alter:

- priors
- condition likelihoods
- owner or clinical evidence weights
- useful-next-observation / information-gain calculations
- monitoring or reassessment queues
- urgency rules

This makes a historical case usable as a reproducible audit case without teaching the model the answer it is being evaluated against. Blinding is a UI/workflow aid, not encryption; exported backups still contain the reference-outcome record.

## Retrospective entry-date workflow

Retrospective reconstruction now has an explicit **new-entry date default** per episode:

- **Latest episode entry** — prefill new observations, clinical results, treatment starts, and diagnostic-study dates from the most recent dated record in the active episode.
- **Current date & time** — retain live-entry behavior.

Historical episodes migrated into retrospective mode default to **Latest episode entry**. Live episodes default to **Current date & time**. The setting controls only the timestamp prefilled in new-entry forms; it never rewrites existing records and never changes Bayesian weights.

Observation, clinical-result, treatment, and diagnostic-study forms expose one-click **Use latest episode entry** and **Use current time** buttons. In retrospective mode, answers from the monitoring / useful-next-observation prompts open the detailed observation form rather than silently stamping the current wall-clock time.

This makes it practical to work through an old case sequentially without accidentally mixing 2025 evidence with 2026 entry timestamps. The user still controls the exact date and time of every saved record.

## v0.7 longitudinal monitoring engine

v0.7 replaces the old one-shot “next useful observation” behavior with two explicit lanes:

- **Reassess ongoing/recurrent evidence.** Findings already observed can return to the queue as time passes. A repeated daily symptom is therefore monitored as persistence rather than treated as permanently “done.”
- **Seek new information.** Unrecorded findings remain ranked by expected information gain, separately from follow-up of an existing symptom.

The monitoring page exposes:

- reassessments currently due
- upcoming reassessments
- last observation time
- heuristic logging cadence
- expected discriminatory value
- current derived owner-evidence state
- top unrecorded information opportunities
- live vs retrospective monitoring reference

Reassessment cadence is deliberately labeled a **data-quality heuristic**. It is not a veterinary follow-up recommendation and does not alter Bayesian likelihoods, priors, or urgency rules.

### Monitoring actions

For an ongoing state, the app can record that it is still present, has resolved, or has changed. For an event-type finding, the app can record recurrence or an explicit no-recurrence check. For previously absent findings, the app can record continued absence or a new occurrence.

All of those actions append new raw observations. Earlier records remain intact.

## Live vs retrospective episodes

Episodes now have an explicit tracking mode:

- **Live monitoring** uses the current clock for reassessment timing.
- **Retrospective reconstruction** uses the latest evidence timestamp in the episode as its monitoring reference, so historical cases do not appear hundreds of days overdue merely because they are being entered later.

Legacy episodes with evidence substantially predating their recorded episode start, or clearly historical open episodes, are conservatively migrated to retrospective mode. The user can change the mode at any time.

Each episode also has a monitoring-density preference:

- intensive
- standard
- sparse

These preferences only change the reassessment queue. They have no effect on Bayesian scores.

## Longitudinal observations

The tracker supports three explicit observation outcomes:

- **Observed / present**
- **Checked and not observed**
- **Previously present — now resolved**

Repeated entries are aggregated into temporal evidence. For example, daily increased-thirst observations can establish persistence and duration while still retaining every raw timestamp. Repeated rows use saturating weights rather than unlimited multiplication.

Mutually exclusive state groups such as appetite, thirst, urine volume, energy, and weight preserve earlier states as historical evidence while giving the latest state primary weight.

## Correlation-aware evidence

Related evidence remains visible, but evidence in the same physiological dependency group is discounted rather than assumed independent.

Current groups include examples such as increased thirst + increased urine volume, blood glucose + urine glucose + fructosamine, creatinine + BUN + SDMA, hepatic markers, respiratory findings, and weight-change evidence.

The correlation factors are inspectable in the versioned knowledge pack. They are heuristic dependency controls, not validated covariance estimates.

## Quantitative clinical trends

Repeated numeric measurements are retained as full raw records and can also generate longitudinal trend summaries.

The trend engine currently supports mappings for body weight, creatinine, and SDMA. A derived trend requires multiple measurements, a minimum time span, sufficient net change, and a minimum linear-fit quality. Unlike units are never silently mixed in one regression.

## Clinical measurements

Structured results can store actual value and unit, date/time, laboratory reference interval, interpretation, source, confidence, episode association, notes, and whether the mapped result may enter the model.

Numeric clinical evidence retains magnitude when an appropriate quantitative anchor or supplied reference interval exists. Repeated mapped results are summarized as serial clinical evidence with saturating weight rather than multiplied as independent tests.

A numeric result is never automatically converted into a diagnosis.

## Prior diagnoses and linked episodes

A diagnosis record can store a library or custom condition, active/historical/ruled-out status, date, source, stage/grade, linked episode, notes/provenance, and an explicit **Use as prior context** switch.

Diagnosis history modifies prior context rather than pretending the diagnosis is a current symptom.

Episodes remain independent unless explicitly linked from **History**. Linked evidence is derived separately and enters the current model at a reduced historical weight; raw records are never copied into the new episode. Linked episodes never populate the current episode’s monitoring queue.

## Treatments, diagnostic studies, and diet

Treatments/interventions retain timing, dose, route, frequency, indication, source, adherence, response, adverse effects, provenance, and optional episode association.

Diagnostic studies retain ultrasound, radiograph, echocardiogram, CT/MRI, cytology, histopathology, endoscopy, examination findings, and other narrative results with provenance.

Diet records retain food form, product, date range, moisture, protein, fat, fiber, carbohydrate, phosphorus, nutrient basis, amount, and source.

These records are preserved as context. Treatment response, free-text studies, and diet do not silently change the differential in v0.8.0.

## Urgency rules

Urgency remains deterministic and independent of Bayesian ranking. Each urgency flag is timestamped from the actual triggering observation. Closed episodes and sufficiently old triggers are labeled historical.

Monitoring cadence is also independent of urgency; a “reassessment due” item is never presented as an emergency warning.

## Knowledge pack

`data/cat-knowledge-v0.7.json` currently contains:

- **95 named feline condition patterns**
- **1 Other / unmodeled reserve hypothesis**
- **109 owner-observable findings**
- **30 clinical findings** including derived trend findings
- **30 structured measurement templates**
- **17 family labels** including the reserve/Other family
- explicit owner-finding monitoring classes and monitoring configuration
- provenance references and inspectable inference settings

The numerical priors, likelihoods, dependency factors, trend weights, demographic adjustments, and monitoring cadence values are heuristic research values. They are **not** validated disease probabilities, diagnostic likelihood ratios, or clinical follow-up schedules.

## Data storage and reports

The app requires no server:

- static HTML/CSS/JavaScript
- IndexedDB local storage
- service-worker offline support
- JSON backup/restore
- multiple pets
- print / Save-to-PDF reports
- `.nojekyll` for GitHub Pages

Reports can optionally include the Bayesian model, urgency history, clinical results, treatments, studies, diet, diagnoses/linked history, notes, and the derived longitudinal monitoring summary.

## Migration

v0.8.0 migrates earlier state automatically to **state schema 8**. Existing pets, episodes, observations, clinical measurements, diets, diagnoses, treatments, studies, reference outcomes, settings, and linked history are preserved.

New episode fields are:

- `trackingMode`: `live` or `retrospective`
- `monitoringCadence`: `intensive`, `standard`, or `sparse`
- `entryDateMode`: `analysis_cutoff`, `latest_evidence`, or `current_time`
- `analysisMode`: `all_evidence` or `as_of`
- `analysisCutoff`: optional ISO timestamp used by retrospective replay
- `advanceReplayOnSave`: whether a newly saved record at/after the replay point advances the cutoff

Always export a JSON backup before replacing a deployed version.

## Reproducible knowledge-pack build

`tools/upgrade_knowledge_v07.py` rebuilds the v0.7 knowledge pack from the retained v0.6 pack. The script adds monitoring metadata/configuration and does **not** modify priors or condition likelihoods.

## Development validation

Run:

```bash
node --check app.js
node tests/smoke.mjs
node tests/state-smoke.mjs
python -m json.tool data/cat-knowledge-v0.7.json > /dev/null
python tools/upgrade_knowledge_v07.py
```

See `VALIDATION.md` for regression coverage, the blinded supplied-case audit, rendering limitations, and remaining model work.
