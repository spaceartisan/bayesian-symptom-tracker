# Validation — v0.3.0

## Release scope

This release adds first-class **multi-pet support**, automatic migration from the previous single-profile state model, pet-specific episode isolation, Settings UI cleanup, and separate observation-confidence weighting. The feline knowledge pack remains `cat-practical-differentials-v0.3` with **95 named condition patterns plus Other / unmodeled reserve** and **109 owner-observable findings**.

## Static checks

- `node --check app.js` — pass
- `node --check service-worker.js` — pass
- `python -m py_compile tools/build_knowledge.py` — pass
- JSON parse: `data/cat-knowledge-v0.3.json` — pass
- Hypothesis priors normalize to 1.0 — pass
- Knowledge source references resolve — pass
- Likelihood tables reference only known findings — pass
- Urgency rules reference only known findings — pass
- Relative GitHub Pages asset paths retained — pass
- Service-worker cache revision bumped for the v0.3 application shell — pass

## Model/data regression suite

Run:

```bash
node tests/smoke.mjs
```

Current result:

```text
PASS knowledge integrity: 95 named conditions + reserve, 109 findings
PASS posterior normalization
PASS directional-state coverage
PASS canonical differential ranking scenarios
PASS deterministic urgency rules
```

Canonical synthetic cases include hyperthyroidism-like, diabetes-like, FIP-like, urethral-obstruction, hepatic-lipidosis, chronic-IBD-like, and congestive-heart-failure patterns. These are software/model consistency checks only; they are not clinical validation.

## State / multi-pet regression suite

Run:

```bash
node tests/state-smoke.mjs
```

Current result:

```text
PASS legacy single-pet migration
PASS multi-pet episode isolation
PASS observation confidence affects inference
PASS multi-pet settings/report rendering
```

The suite verifies that:

- a legacy `profile` is migrated into the first pet without losing the pet name or existing episode;
- legacy episodes are assigned to that migrated pet;
- old observations receive a compatibility default of `high` confidence;
- observations in one pet's episode do not appear in another pet's episode or inference input;
- changing confidence changes Bayesian evidence strength;
- Settings renders pet management and the corrected button-styled Import JSON control;
- reports include the selected pet and the independent confidence field.

## UI review

The execution environment currently blocks Chromium navigation to localhost/file URLs, so a full live-navigation browser smoke test could not be rerun here. The actual v0.3 Settings HTML was rendered through the application's real `renderSettingsPage()` function and inspected in headless Chromium via `set_content`, which does not require navigation.

Reviewed capture:

- `docs/screenshots/settings-multipet.png`

Visual checks completed on that render:

- Import JSON now has the same button treatment as neighboring controls;
- Export / Import / Load demo controls wrap cleanly instead of producing the inline-label appearance seen in v0.2;
- pet tabs and Add pet are visible without crowding the profile form;
- Remove pet and Save profile occupy separate action positions;
- top-bar pet and episode context controls fit the desktop layout;
- the knowledge/provenance card remains readable below the settings grid.

## Knowledge-pack limitations

`cat-practical-differentials-v0.3` remains intentionally labeled experimental and non-clinically validated.

- Numeric likelihood weights are heuristic pattern weights, not measured diagnostic sensitivity/specificity.
- Named-condition priors are deliberately equal baseline weights rather than epidemiologic prevalence estimates.
- `Other / unmodeled condition` retains a 2% reserve prior so the represented library is not treated as exhaustive.
- Owner-observable symptoms alone cannot distinguish many diseases that require physical examination, laboratory testing, imaging, pathology, or other veterinary diagnostics.
- The deterministic urgency layer remains independent from Bayesian condition ranking.
- Multi-pet support isolates records between animals; it does not pool evidence across pets.

## Compatibility

Existing v0.1.x/v0.2.x stored browser data and JSON backups are migrated automatically from the legacy single `profile` shape to the v0.3 `pets[]` shape. Historical observations and episode IDs are retained; existing episodes are assigned to the migrated pet. New exports use state schema version 2.
