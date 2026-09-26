# Bayesian Symptom Tracker

A GitHub Pages–ready, local-first symptom and observation tracker for cats.

## What it does

- Supports **multiple pets** with separate profiles, episodes, observations, Bayesian state, and reports.
- Tracks timestamped observations inside discrete episodes.
- Stores data locally in the browser using IndexedDB.
- Computes transparent Bayesian **relative pattern-consistency scores** from a versioned knowledge pack.
- Shows which evidence raises or lowers the leading condition pattern.
- Aggregates condition scores by body-system / disease family.
- Suggests a potentially informative next observation using expected entropy reduction.
- Runs deterministic urgency rules independently from the Bayesian model.
- Supports editing/deleting historical observations, multiple episodes per pet, JSON backup/restore, and printable/PDF reports.
- Separates **symptom intensity** from **observation confidence**; confidence softens the evidence weight when the owner is uncertain.
- Works without a server-side backend and is suitable for GitHub Pages.

## v0.3.0 multi-pet release

The state model now treats a pet as the top-level patient entity:

```text
Pet
 └─ Episode
     └─ Observation
```

Each episode belongs to exactly one pet, and Bayesian inference uses observations from the **active episode only**. Switching pets also switches to that pet's most recent open/recent episode, so evidence from one animal cannot leak into another animal's ranking.

Existing v0.1/v0.2 single-pet browser data is migrated automatically. The legacy `profile` becomes the first pet and all existing episodes are assigned to that pet.

The Settings screen now provides pet tabs, Add pet, pet-specific profile editing, and explicit pet removal. The top bar has a pet selector so the active patient is always visible. JSON export/import includes every pet and remains backward-compatible with legacy single-profile backups.

The previous combined `Intensity / confidence` field has also been corrected. Intensity and confidence are now stored independently. Legacy observations migrate with `high` confidence so an upgrade does not silently reduce existing evidence.

## Practical feline differential library

The `cat-practical-differentials-v0.3` pack contains **95 named feline condition patterns plus an explicit Other / unmodeled reserve hypothesis**, across gastrointestinal, hepatobiliary/pancreatic, renal/urinary, endocrine/metabolic, cardiovascular, respiratory, infectious/immune, hematologic/oncologic, neurologic, oral/dental, musculoskeletal, dermatologic, toxic/environmental, reproductive, ophthalmic, and behavioral/iatrogenic families.

The observation vocabulary contains **109 owner-observable findings**, including directional states for appetite, thirst, urine volume, activity/energy, weight, and stool consistency. Urine volume remains distinct from frequent-small-voiding behavior.

This is intended to be a **practical differential library**, not an exhaustive veterinary nosology. The model intentionally reserves baseline mass for `Other / unmodeled condition` so represented conditions are never treated as the only possibilities.

## Important limitation

The included Bayesian knowledge pack is a deliberately labeled, **non-clinically-validated experimental heuristic model**. Its percentages are normalized relative scores, not disease probabilities, diagnostic likelihoods, diagnoses, or rule-outs.

The numeric likelihood weights are not measured diagnostic sensitivity/specificity values. Named conditions share equal baseline prior weight; `Other / unmodeled condition` has a small reserve prior. This avoids presenting unsupported prevalence estimates as fact.

Veterinary references in the knowledge pack support representative condition/sign relationships and emergency red-flag examples. They do **not** validate the model's numeric Bayesian weights.

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
- `app.js` — IndexedDB persistence, pet/episode management, migration, inference, information-value calculation, reporting
- `data/cat-knowledge-v0.3.json` — 95 named condition patterns, 109 findings, likelihood assumptions, urgency rules, provenance
- `tools/build_knowledge.py` — reproducible knowledge-pack generator
- `service-worker.js` — offline cache
- `manifest.webmanifest` — installable web-app metadata

Raw owner observations are stored separately from standardized findings and from the model knowledge pack, so the model can evolve without rewriting historical records.

## Validation

Run both regression suites with:

```bash
node tests/smoke.mjs
node tests/state-smoke.mjs
```

See [`VALIDATION.md`](VALIDATION.md) for the current software validation record. A reviewed v0.3 Settings capture is in `docs/screenshots/settings-multipet.png`.

## Version history

### v0.3.0

Added first-class multi-pet support, automatic migration of legacy single-pet data, active-pet switching, pet-specific episodes/reports, backup compatibility, Settings UI cleanup, and separate observation confidence weighting.

### v0.2.0

Expanded from broad system buckets to a 95-condition practical feline differential library; added 109 findings, family-level aggregation, explicit unmodeled-condition reserve, expanded deterministic urgency rules, knowledge-pack provenance, and canonical ranking regression cases.

### v0.1.1

Added increased appetite, increased urine volume, and reduced urine volume; separated urine volume from frequent-small-voiding behavior; and added mutually exclusive state groups for information-value prompts.
