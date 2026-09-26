# Validation — v0.4.0

## Release scope

This release adds a separate **clinical measurement/test-result layer** and **diet/nutrient context layer** while preserving the existing multi-pet, per-episode inference model.

The feline knowledge pack is now `cat-practical-differentials-v0.4` with:

- **95 named condition patterns plus Other / unmodeled reserve**;
- **109 owner-observable findings**;
- **28 clinical findings**;
- **30 structured clinical measurement/test templates**;
- **17 condition families**.

Mapped abnormal/positive clinical results may be explicitly opted into the Bayesian model. Diet records never affect Bayesian scores in this release. Normal/negative clinical results remain context and are not automatically converted into negative/rule-out evidence.

## Static checks

- `node --check app.js` — pass
- `node --check service-worker.js` — pass
- `python -m py_compile tools/build_knowledge.py` — pass
- JSON parse: `data/cat-knowledge-v0.4.json` — pass through regression loader
- Hypothesis priors normalize to 1.0 — pass
- Knowledge source references resolve — pass
- Likelihood tables reference only known findings — pass
- Clinical measurement mappings reference only known clinical findings — pass
- Urgency rules reference only known findings — pass
- Relative GitHub Pages asset paths retained — pass
- Service-worker cache revision bumped and v0.4 knowledge-pack path cached — pass

## Model/data regression suite

Run:

```bash
node tests/smoke.mjs
```

Current result:

```text
PASS knowledge integrity: 95 named conditions + reserve, 109 owner findings, 28 clinical findings
PASS posterior normalization
PASS owner-observation canonical scenarios
PASS broad clinical-evidence scenarios
PASS deterministic urgency rules
```

The owner-observation scenarios remain independent of the user's diabetes experiment. Broad clinical regression cases separately exercise diabetes-pattern, CKD-pattern, hyperthyroid-pattern, and pancreatitis-pattern inputs to verify that the generic clinical-evidence plumbing changes rankings in the intended direction.

These are software/model consistency checks only; they are **not clinical validation**.

## State / context regression suite

Run:

```bash
node tests/state-smoke.mjs
```

Current result:

```text
PASS legacy migration to state schema v3
PASS multi-pet isolation across observations, clinical results, and diets
PASS clinical evidence mapping and conservative normal-result handling
PASS diet context remains non-inferential
PASS context/report rendering and nutrient conversion
```

The suite verifies that:

- legacy single-pet state migrates to schema v3 without losing existing observations;
- observations, clinical measurements, and diet records remain isolated by pet;
- a mapped abnormal clinical result can be included as Bayesian evidence;
- a normal clinical interpretation remains context rather than becoming an automatic rule-out;
- changing diet context does not alter the posterior ranking;
- reports render clinical and diet sections independently;
- as-fed nutrient values can display a dry-matter equivalent when moisture is available.

## Clinical evidence design checks

Clinical records are intentionally stored independently from owner observations. A record contains its raw/categorical result, unit, optional laboratory reference range, interpretation, source, confidence, notes, episode attachment, and model opt-in state.

The release deliberately avoids universal built-in reference intervals. Numeric auto-interpretation is based only on the low/high values supplied with that record. Categorical positive/negative/trace results can be interpreted directly.

Only mapped abnormal/positive interpretations are eligible for model evidence. Normal/negative results are still visible in the timeline and report but do not automatically exert negative Bayesian weight. This prevents a single apparently normal result from being treated as a validated exclusion rule.

## Diet-context design checks

Diet records are date-ranged patient context rather than episode evidence. The form stores food identity/form, nutrient basis, protein, fat, fiber, carbohydrate, moisture, phosphorus, phosphorus unit, feeding notes, nutrition-source notes, and free text.

When moisture is present, an as-fed percentage can be displayed on a calculated dry-matter basis using:

```text
dry-matter % = as-fed % / (100 - moisture %) × 100
```

No nutrient field is passed to the Bayesian evidence engine in v0.4.0.

## Knowledge-pack limitations

`cat-practical-differentials-v0.4` remains intentionally labeled experimental and non-clinically validated.

- Numeric likelihood weights are heuristic pattern weights, not measured diagnostic sensitivity/specificity.
- Named-condition priors are deliberately equal baseline weights rather than epidemiologic prevalence estimates.
- `Other / unmodeled condition` retains a reserve prior so the represented library is not treated as exhaustive.
- Owner symptoms and broad clinical mappings cannot replace physical examination, laboratory interpretation, imaging, pathology, or veterinary diagnosis.
- A clinical result can be affected by collection method, assay, laboratory range, timing, persistence, treatment, stress, and comorbidity; the app does not attempt to model all of those factors.
- Diet composition is context only and makes no diagnostic claim.
- The deterministic urgency layer remains independent from Bayesian condition ranking.
- Multi-pet support isolates records between animals; it does not pool evidence across pets.

## Compatibility

Existing v0.1.x/v0.2.x/v0.3.x stored browser data and JSON backups are migrated automatically to **state schema version 3**. Existing pet, episode, and observation IDs are retained. The new `clinicalMeasurements[]` and `diets[]` collections are initialized without altering historical observations.

## UI review

The container's Chromium policy blocks live navigation to localhost (`ERR_BLOCKED_BY_ADMINISTRATOR`), even though the local HTTP server successfully serves the GitHub Pages assets. To keep visual validation meaningful, the release rendered the actual `renderContextPage()` and `clinicalFormHtml()` output from `app.js` with the real v0.4 knowledge pack and stylesheet, then inspected those renders in headless Chromium via `set_content`.

Reviewed captures:

- `docs/screenshots/clinical-diet.png`
- `docs/screenshots/add-clinical-result.png`

Visual checks completed:

- the new Clinical & diet navigation item fits the existing sidebar;
- clinical and diet cards remain distinct and clearly label model evidence versus context-only data;
- long episode names truncate in the existing top-bar context button rather than expanding the header;
- nutrient chips wrap cleanly and show as-fed plus calculated dry-matter values;
- the clinical-result form fits the modal without horizontal overflow;
- lab reference and interpretation controls remain readable at desktop width;
- the model-evidence checkbox is visually separate from episode attachment;
- context text explicitly states that diet does not alter Bayesian scores.
