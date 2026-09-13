# Validation follow-up — 13 September 2026

Status: **not production-approved**. The original clean-shot result remains the review candidate. Native camera conversion and core panel operations passed in AE Beta.

## What was tested

1. **AE host execution succeeded.** With the user's approval, enabled Allow Scripts to Write Files and Access Network. Semantic file-picker actions ran the probes. AE requires intrinsic XYZ Euler angles; fixed the exporter and solid orientation conversion. Also restricted spatial tangent writes to Position: writing them on Orientation had zeroed its Y/Z values in AE. The corrected full import passed 20 actual `toComp()` comparisons across frames 0, 226, 453, 679 and 906, maximum error **0.00018792664413 px**. The test creates separate review compositions; no project was saved.
2. **Robust bundle adjustment.** A separate candidate used fixed estimated intrinsics, a three-point gauge constraint, SOFT_L1 loss and ITERATIVE_SCHUR. It converged in 17 successful steps, without the previous Cholesky warning. Coverage stayed 908/970; median fit residual improved from 2.272 px to 2.156 px. However, worst adjacent rotation rose from 1.329 degrees/frame to 1.638, and worst angular second difference rose from 2.038 to 2.514 degrees/frame². This candidate was **not promoted**. A converged optimization does not establish a better camera.
3. **Temporal regularization trial.** Typical angular second differences decreased, but the worst isolated jump increased to 3.071 degrees/frame. Median correspondence error on observations withheld from this refit rose from 2.484 px to 2.541 px. This candidate was **rejected**. The test withheld points only from the refit: their geometry and earlier correspondence selection were shared, so these are not independent ground-truth errors.
4. **Review-import checks.** Tightened the prepared JSX projection probe so expression errors and nonfinite measurements cannot pass. JavaScript syntax/parser checks passed. The updated script then passed in AE.

The largest original motion changes occur around frames 286–359 during the actor's turn. Whether that is real camera movement, fitting jitter or both needs rendered inserts and frame-by-frame comparison.

## Preserved evidence

- Original: `jobs/challenge-clean/result.json`
- Robust candidate: `jobs/challenge-refined/result.json`, `refinement.json`, `jobs/challenge-refined.log`
- Rejected temporal trial: `jobs/challenge-temporal/result.json`, `stability.json`
- Trial implementations: `scripts/refine_review.py`, `scripts/stability_trial.py`
- Prepared host import: `jobs/challenge-clean/Import Camera Review.jsx`
- Prepared direct scripting call: `scripts/run_ae_test.applescript` (not executed)

## Panel and renders

`jobs/panel-host-test.json` records a footage preview, 908 loaded poses, 4383 points, 907 camera keys, three created nulls and one created solid. Replaced the unsupported ScriptUI `canvas.notify` redraw. A compact `panel.json` removes unused matrices and caps preview observations at 100 per frame; the worker now generates it automatically. Loading still took several minutes in this host, so responsiveness needs further work.

`jobs/challenge-clean/ae-renders` contains native AE renders at frames 280, 300, 320, 340 and 359. The first arbitrary surface was outside the visible view; six world-space reference markers were then rendered and inspected at frames 280, 320 and 359. Some markers overlap the actor because this review does not apply foreground occlusion. Bokeh and occlusion prevent confidently judging all anchors from these samples. Five sampled frames do not establish whole-shot temporal stability.

## Remaining acceptance

Review inserts through the whole contiguous solve, particularly frames 286–359, and measure visible slipping. Test launching a fresh solve through the panel and docked behavior after restart. AppleScript was not used; the earlier API permission request is no longer needed for these host tests. The current prototype is not production-approved or proven more accurate than Adobe's tracker.
