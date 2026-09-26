# Validation — v0.2.0

## Release scope

This release expands the experimental feline knowledge pack from 12 broad pattern buckets to **95 named condition patterns plus an Other / unmodeled reserve**, with **109 owner-observable findings** and family-level aggregation.

## Static checks

- `node --check app.js` — pass
- `node --check service-worker.js` — pass
- `python -m py_compile tools/build_knowledge.py` — pass
- JSON parse: `data/cat-knowledge-v0.3.json` — pass
- Hypothesis priors normalize to 1.0 — pass
- Knowledge source references resolve — pass
- Likelihood tables reference only known findings — pass
- Urgency rules reference only known findings — pass
- Relative GitHub Pages asset paths — pass
- Local HTTP requests for `index.html`, `app.js`, `styles.css`, and `data/cat-knowledge-v0.3.json` — HTTP 200

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

Canonical synthetic cases currently tested include:

- hyperthyroidism-like directional pattern
- diabetes-like polyuria/polydipsia + weight-loss pattern
- FIP-like systemic/effusive pattern
- urethral-obstruction pattern
- hepatic-lipidosis pattern
- chronic IBD-like pattern
- congestive-heart-failure respiratory pattern

These regression cases test software/model consistency only. They do **not** constitute clinical validation.

## Browser interaction smoke test

A fresh Chromium interaction run was completed using the actual HTML/CSS/JavaScript with an in-memory IndexedDB/fetch harness because this execution environment blocks browser navigation to localhost/file URLs.

The run verified:

- application shell renders without page/console errors
- observation modal accepts and persists findings through the app's real UI flow
- a canonical increased-appetite + weight-loss + increased-thirst + increased-urine + hyperactivity case ranks **Hyperthyroidism** first in the experimental model
- Model view renders 96 total hypotheses, family aggregation, evidence contribution, and the Other / unmodeled reserve
- logging `Unable to urinate / no urine` independently triggers the deterministic emergency rule
- Settings renders 95 named condition patterns, 109 findings, coverage language, and provenance

Reviewed captures:

- `docs/screenshots/dashboard.png`
- `docs/screenshots/model.png`

## Knowledge-pack limitations

`cat-practical-differentials-v0.3` is intentionally labeled experimental and non-clinically validated.

- Numeric likelihood weights are heuristic pattern weights, not measured diagnostic sensitivity/specificity.
- Named-condition priors are deliberately equal baseline weights rather than epidemiologic prevalence estimates.
- `Other / unmodeled condition` retains a 2% reserve prior so the represented library is not treated as exhaustive.
- Owner-observable symptoms alone cannot distinguish many diseases that require physical examination, laboratory testing, imaging, pathology, or other veterinary diagnostics.
- The deterministic urgency layer remains independent from Bayesian condition ranking.

## Compatibility

Existing v0.1.x stored observations remain readable because existing finding IDs were retained. The app updates the active model-pack identifier without rewriting historical observation records.
