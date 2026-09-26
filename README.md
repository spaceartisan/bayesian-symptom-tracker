# Bayesian Symptom Tracker

A GitHub Pages–ready, local-first symptom and observation tracker for cats.

## What it does

- Tracks timestamped observations inside discrete episodes.
- Stores data locally in the browser using IndexedDB.
- Computes transparent Bayesian **relative pattern-consistency scores** from a versioned knowledge pack.
- Shows which evidence raises or lowers the leading pattern.
- Suggests a potentially informative next observation using expected entropy reduction.
- Runs deterministic urgency rules independently from the Bayesian model.
- Supports editing/deleting historical observations, multiple episodes, JSON backup/restore, and printable/PDF reports.
- Works without a server-side backend and is suitable for GitHub Pages.

## Important limitation

The included `cat-general-v0.2` Bayesian knowledge pack is a deliberately labeled, **non-clinically-validated heuristic model**. Its percentages are normalized relative scores, not disease probabilities and not diagnoses. The emergency/urgent rules are separate from the Bayesian model and cite veterinary sources in the app.

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
- `app.js` — IndexedDB persistence, episode management, inference, information-value calculation, reporting
- `data/cat-knowledge-v0.2.json` — hypotheses, findings, likelihood assumptions, urgency rules, provenance
- `service-worker.js` — offline cache
- `manifest.webmanifest` — installable web-app metadata

Raw owner observations are stored separately from standardized findings and from the model knowledge pack, so the model can evolve without rewriting historical records.

## Validation

Run the model/data regression tests with:

```bash
node tests/smoke.mjs
```

See [`VALIDATION.md`](VALIDATION.md) for the current software validation record. A reviewed dashboard capture is in `docs/screenshots/dashboard.png`.


## v0.1.1 directional-state update

Added increased appetite, increased urine volume, and reduced urine volume; separated urine volume from frequent-small-voiding behavior; added mutually exclusive state groups for information-value prompts; and expanded the heuristic broad-pattern model with metabolic/endocrine and renal/hydration categories. Existing observation IDs remain compatible.
