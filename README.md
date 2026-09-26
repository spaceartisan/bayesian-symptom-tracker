# Bayesian Symptom Tracker

A GitHub Pages–ready, local-first symptom, clinical-context, and observation tracker for cats.

## What it does

- Supports **multiple pets** with separate profiles, episodes, observations, clinical records, diet context, Bayesian state, and reports.
- Tracks timestamped owner observations inside discrete episodes.
- Records structured **clinical measurements and test results** such as glucose, fructosamine, creatinine, BUN, SDMA, phosphorus, total T4, PCV, urine findings, blood pressure, fPL, NT-proBNP, FeLV/FIV, and custom tests.
- Records **diet context** with food form plus protein, fat, fiber, carbohydrate, phosphorus, moisture, feeding notes, and nutrition-source notes.
- Stores data locally in the browser using IndexedDB.
- Computes transparent Bayesian **relative pattern-consistency scores** from a versioned knowledge pack.
- Shows which evidence raises or lowers the leading condition pattern.
- Aggregates condition scores by body-system / disease family.
- Suggests a potentially informative next **owner-observable** finding using expected entropy reduction.
- Runs deterministic urgency rules independently from the Bayesian model.
- Supports editing/deleting historical observations and context records, multiple episodes per pet, JSON backup/restore, and printable/PDF reports.
- Separates **symptom intensity** from **observation confidence**; confidence softens the evidence weight when the owner is uncertain.
- Works without a server-side backend and is suitable for GitHub Pages.

## v0.4.0 — clinical evidence and diet context

The app now has three deliberately separate information layers:

```text
Owner observations  ─┐
                     ├─> Bayesian pattern-consistency model
Selected clinical   ─┘
results

Diet / food composition ─> context, timeline, trends, and reports only
```

### Clinical measurements and tests

The knowledge pack defines **30 structured measurement/test templates** and **28 clinical findings**. A clinical record can include:

- date/time;
- measured or categorical result;
- unit;
- the laboratory's own low/high reference values;
- interpretation (`low`, `normal`, `high`, `negative`, `trace`, `positive`, or unspecified);
- source (veterinarian/lab, home, or other);
- confidence and notes;
- optional attachment to the active episode.

Mapped **abnormal or positive** results can be opted into Bayesian inference. Normal/negative results are retained as clinical context but are **not automatically converted into rule-out evidence**. This is intentionally conservative because interpretation depends on assay, laboratory range, persistence, patient context, and other diagnostic information.

The app does not hard-code one universal feline reference range. Users can enter the range supplied with the actual result.

### Diet / food context

Food records are pet-wide and date-ranged so the same food can overlap one or more episodes. The form supports:

- brand and product;
- wet/dry/other food form;
- start/end dates;
- protein, fat, fiber, carbohydrate, and moisture;
- phosphorus as either `%` or `mg/100 kcal`;
- as-fed or dry-matter nutrient basis;
- amount/feeding notes, nutrition-source notes, and free text.

When an as-fed percentage and moisture are available, the UI also displays the calculated dry-matter equivalent. **Diet composition does not alter Bayesian scores in v0.4.0.** It is preserved as context for longitudinal review and veterinarian reports rather than being treated as diagnostic evidence.

## Patient / episode architecture

The state model treats a pet as the top-level patient entity:

```text
Pet
 ├─ Episode
 │   ├─ Owner observation
 │   └─ Clinical result (optional episode attachment)
 └─ Diet record (date-ranged context)
```

Each episode belongs to exactly one pet. Bayesian inference uses owner observations from the **active episode only**, plus mapped clinical evidence explicitly attached to that episode and opted into the model. Switching pets also switches patient context, so evidence from one animal cannot leak into another animal's ranking.

Existing v0.1–v0.3 data is migrated automatically. Historical observations and episode relationships are retained; new v0.4 arrays for clinical measurements and diet records begin empty unless imported from a v0.4 backup.

## Practical feline differential library

The `cat-practical-differentials-v0.4` pack contains **95 named feline condition patterns plus an explicit Other / unmodeled reserve hypothesis** across 17 families.

The evidence vocabulary contains:

- **109 owner-observable findings**;
- **28 clinical findings**;
- **30 structured clinical measurement/test templates**.

Owner-observable findings include directional states for appetite, thirst, urine volume, activity/energy, weight, and stool consistency. Urine volume remains distinct from frequent-small-voiding behavior.

This is intended to be a **practical differential library**, not an exhaustive veterinary nosology. The model intentionally reserves baseline mass for `Other / unmodeled condition` so represented conditions are never treated as the only possibilities.

## Important limitation

The included Bayesian knowledge pack is a deliberately labeled, **non-clinically-validated experimental heuristic model**. Its percentages are normalized relative scores, not disease probabilities, diagnostic likelihoods, diagnoses, or rule-outs.

The numeric likelihood weights are not measured diagnostic sensitivity/specificity values. Named conditions share equal baseline prior weight; `Other / unmodeled condition` has a small reserve prior. Clinical mappings are broad heuristic associations intended to test the software architecture, not validated diagnostic rules.

Veterinary references in the knowledge pack support representative condition/sign/test relationships and emergency red-flag examples. They do **not** validate the model's numeric Bayesian weights.

## Run locally

Because the app fetches its JSON knowledge pack, serve the directory over HTTP rather than double-clicking `index.html`.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

Upload the contents of this directory to a repository, enable **Settings → Pages**, and publish from the branch/root containing `index.html`. All paths are relative, so project-site URLs such as `https://username.github.io/repository/` work without modification.

## Data architecture

- `index.html` — static application shell
- `styles.css` — responsive UI and print styles
- `app.js` — IndexedDB persistence, pet/episode/context management, migration, inference, information-value calculation, and reporting
- `data/cat-knowledge-v0.4.json` — hypotheses, owner/clinical findings, measurement templates, likelihood assumptions, urgency rules, and provenance
- `tools/build_knowledge.py` — reproducible knowledge-pack generator
- `service-worker.js` — offline cache
- `manifest.webmanifest` — installable web-app metadata

Raw owner observations, clinical records, diet context, and the model knowledge pack are stored as distinct data concepts so future model changes do not require rewriting historical records.

## Validation

Run both regression suites with:

```bash
node tests/smoke.mjs
node tests/state-smoke.mjs
```

See [`VALIDATION.md`](VALIDATION.md) for the current software validation record. Reviewed v0.4 captures are in `docs/screenshots/clinical-diet.png` and `docs/screenshots/add-clinical-result.png`.

## Version history

### v0.4.0

Added structured clinical measurements/test results, optional mapped clinical Bayesian evidence, conservative handling of normal/negative test results, date-ranged diet/nutrient context, dry-matter display conversion, clinical/diet report sections, and state schema v3 migration.

### v0.3.0

Added first-class multi-pet support, automatic migration of legacy single-pet data, active-pet switching, pet-specific episodes/reports, backup compatibility, Settings UI cleanup, and separate observation confidence weighting.

### v0.2.0

Expanded from broad system buckets to a 95-condition practical feline differential library; added 109 findings, family-level aggregation, explicit unmodeled-condition reserve, expanded deterministic urgency rules, knowledge-pack provenance, and canonical ranking regression cases.

### v0.1.1

Added increased appetite, increased urine volume, and reduced urine volume; separated urine volume from frequent-small-voiding behavior; and added mutually exclusive state groups for information-value prompts.
