# Validation — v0.1.1

Validated 2026-09-26.

## Static checks

- `node --check app.js` — pass
- JSON parse: `data/cat-knowledge-v0.2.json` — pass
- JSON parse: `manifest.webmanifest` — pass
- Local HTTP request for `index.html` — HTTP 200
- Local HTTP request for `data/cat-knowledge-v0.2.json` — HTTP 200 and valid JSON

## Model regression checks

Run with:

```bash
node tests/smoke.mjs
```

Covered:

- Hypothesis priors sum to 1.
- All likelihood references point to defined findings and contain valid values.
- All urgency rules reference defined findings.
- Posterior scores normalize to 1.
- An inability-to-urinate finding makes the urinary pattern the highest relative heuristic score.
- Inability to urinate triggers a deterministic emergency rule independent of the Bayesian score.
- Repeated vomiting plus lethargy triggers the combined urgent rule.
- A later explicit negative observation clears a direct active urgency finding in the current-state rule engine.

## Browser interaction smoke test

The v0.1.0 headless-browser interaction test covered the application shell, persistence flow, urgency behavior, timeline, report, and provenance rendering. For v0.1.1, the container Chromium process did not terminate cleanly during the rerun because of an environment-level D-Bus/headless-browser issue, so this release is not claiming a fresh browser automation pass. Static HTTP loading, JavaScript syntax, JSON integrity, and the expanded model regression suite all passed.

Covered:

1. First-run Dashboard rendered successfully.
2. “No active deterministic urgency flags” rendered on a blank episode.
3. Quick-log modal opened.
4. “Unable to urinate / no urine” was logged with high intensity.
5. Dashboard changed to an emergency flag.
6. Timeline displayed the new observation and edit control.
7. Report view rendered the observation.
8. Settings rendered knowledge-pack provenance sources.
9. No page-level or console errors were reported.

## Visual review

The desktop dashboard was rendered and visually inspected at 1440×1100. See `docs/screenshots/dashboard.png`.

## Scope limitation

The included Bayesian knowledge pack is an experimental heuristic. Validation above verifies software behavior and internal consistency; it is **not clinical validation** of the Bayesian priors or likelihood values.


## v0.1.1 regression additions

- Verified increased appetite exists as a first-class finding.
- Verified increased and reduced urine volume exist independently of frequent small urinations.
- Verified appetite and urine-volume state groups are internally consistent.
- Verified the directional metabolic pattern test ranks the broad metabolic/endocrine hypothesis first for the synthetic increased-appetite + increased-urine + increased-thirst + weight-loss combination.
- Verified legacy finding IDs remain present for existing exported/local records.
