# Bayesian Symptom Tracker v0.7.1 — Validation Record

Date: 2026-09-26

## Static validation

Passed:

- `node --check app.js`
- `python -m json.tool data/cat-knowledge-v0.7.json`
- v0.7 knowledge-pack rebuild via `tools/upgrade_knowledge_v07.py`
- knowledge-pack monitoring metadata covers every owner-observable finding
- knowledge-pack condition/finding coverage counts remain internally consistent
- GitHub Pages uses relative local assets only
- service worker caches `cat-knowledge-v0.7.json`
- no server-side dependency introduced
- service-worker cache key bumped for v0.7.1 asset refresh

## Knowledge-pack / inference regression tests

`node tests/smoke.mjs` passes:

- schema/provenance integrity
- 95 named condition patterns plus explicit Other/unmodeled reserve retained
- broad canonical patterns across several systems, including hyperthyroidism, diabetes mellitus, FIP, urethral obstruction, congestive heart failure, pancreatitis, and CKD with renal clinical evidence
- repeated owner observations become saturating longitudinal evidence rather than independent duplicate tests
- state changes preserve earlier evidence while keeping the latest state primary
- explicit symptom resolution is retained without deleting the original event
- numeric clinical magnitude remains available to the clinical-evidence layer
- repeated clinical values saturate rather than multiply without bound
- serial body-weight measurements can derive measured weight-change evidence
- correlated findings remain visible but receive dependency discounts
- deterministic urgency rules remain separate from Bayesian inference

## Retrospective entry-date regression tests

v0.7.1 adds explicit tests that:

- legacy historical episodes migrate to `entryDateMode = latest_evidence`
- a retrospective episode prefills new observations from its latest recorded evidence timestamp rather than wall-clock time
- the observation form exposes one-click **Use latest episode entry** and **Use current time** controls
- changing the entry-date default does not change Bayesian condition scores
- live/default episodes retain current-time entry behavior unless the user explicitly chooses otherwise

## Monitoring / reassessment regression tests

v0.7 adds explicit tests that:

- 20 repeated observations of one persistent symptom produce one reassessment target, not 20 queue items
- the Bayesian evidence weight still saturates independently of monitoring frequency
- an explicitly resolved symptom leaves the ongoing reassessment queue while its history remains in the timeline
- a single event can later generate a recurrence check
- mutually exclusive state groups monitor only the latest current state rather than stale sibling states
- intensive/standard/sparse cadence changes monitoring timing only and does not change condition scores
- the new-information queue does not ask contradictory sibling-state questions after that state group has already been observed
- linked prior episodes never populate the current episode’s monitoring queue

## State / longitudinal regression tests

`node tests/state-smoke.mjs` passes:

- previous state migrates to state schema 7
- episode tracking mode and monitoring cadence are created without removing older records
- legacy clearly historical episodes migrate to retrospective tracking
- retrospective monitoring uses the latest episode evidence as its reference rather than wall-clock time
- diagnoses, treatments, studies, and linked-episode structures remain intact
- diet remains non-inferential
- treatments remain non-inferential
- diagnostic-study narrative context remains non-inferential
- confirmed diagnosis history changes prior context only when explicitly enabled
- prior episodes do not influence the current episode until explicitly linked
- linked-history evidence enters at reduced weight
- retrospective evidence bounds are derived from raw record timestamps
- demographic analysis start respects earlier retrospective evidence when episode metadata starts too late
- urgency age is calculated from the actual triggering red-flag observation rather than unrelated newer context
- numeric trend regression does not mix different units
- Context, History, Model, and Monitoring pages expose their controls in application-side rendering tests

## Supplied-case audit

The user-supplied historical JSON remains an **audit case**, not a target-answer regression test. No test asserts that diabetes, CKD, or any other condition must rank first.

Running the unchanged case through v0.7.1 gives the same inference ordering as v0.7 because the entry-date workflow does not alter priors, likelihoods, or existing evidence timestamps:

- Diabetes mellitus: **15.92%** relative pattern-consistency
- Diabetic ketoacidosis: **4.12%**
- Multicentric/systemic lymphoma: **3.44%**
- Chronic kidney disease: **3.21%**

These values are **not diagnostic probabilities** and their ordering is not treated as validation.

Migration identifies the supplied historical episode as retrospective. Its monitoring reference and default timestamp for newly prompted entries are based on the latest dated evidence in the episode rather than the current date. Existing historical timestamps are never rewritten.

## Browser rendering

A fresh end-to-end browser screenshot is not required for the v0.7.1 inference checks. Chromium can launch in this environment, but navigation to the local HTTP test server is blocked by the container/browser administrator policy (`ERR_BLOCKED_BY_ADMINISTRATOR`).

Application-side rendering and timestamp-default behavior are exercised through the Node VM regression suite.

## Important model limitations

v0.7.1 remains an experimental inference framework and is **not clinically validated**.

Important remaining work includes:

- calibration against a substantially larger blinded veterinary case set
- wider source-backed condition-specific priors and demographic modifiers
- validated negative-test evidence and test-specific likelihood-ratio support where veterinary evidence permits it
- more complete dependency/correlation structures rather than heuristic group discounts
- structured evidence mappings for imaging, pathology, physical examination, and other diagnostic studies
- treatment-response modeling that avoids indication and circularity bias
- robust scientific unit conversion/normalization where conversions are unambiguous
- additional quantitative trend mappings beyond body weight, creatinine, and SDMA
- configurable per-finding monitoring plans rather than only episode-level cadence density
- optional structured clinical-series monitoring without turning laboratory follow-up timing into medical advice
- calibration of the monitoring priority heuristic against real longitudinal use
- external prospective validation before any diagnostic or clinical-decision claim

The app deliberately preserves raw records and provenance so future inference and monitoring models can reprocess historical data without requiring re-entry.
