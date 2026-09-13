# Challenge-shot development report

12–13 September 2026. All processing was local. Both source MP4s were preserved.

## Sources

- Original: external-drive title/interval MP4, 3840×2160, 24 fps, 970 frames, 40.4167 seconds. The user supplied an AE native tracker failure screenshot. No lens metadata was available.
- Clean replacement: `/Users/parthgupta/Downloads/Reel 4_ Shot for title and interval.mp4`, same dimensions, timing and frame count, approximately 68 MiB, video only. Sampled frames confirm removal of the large title and Intermission graphics. Small timecode/filename burn-ins remain.
- The clean replacement clarified that the actor exits around frame 732–736. Empty masks after the exit should be treated as expected absence. Earlier interpretation of all late empty masks as SAM failure was too broad.

## Measured SAM runs

SAM 2.1 Hiera Tiny, Metal/MPS, float32, 960×540 decoded analysis proxies (SAM uses its own internal resize), four-frame sampling, up to 48 sampled frames held in each window. Times measure mask generation after predictor creation; package installation/model download and camera solving are additional.

| Test | Sampled frames | Mask-generation time | Peak process RSS | Peak Metal driver allocations | Observation |
|---|---:|---:|---:|---:|---|
| Opening excerpt | 12 | 21.03 s | 736.7 MiB | 2280 MiB | Actor silhouette found; initial Apple Vision segmentation missed it. |
| Original, single prompt | 244 | 212.43 s | 1265.7 MiB | 2304 MiB | Mask drifted onto the removed garment/prop during the turn; actor still visible when mask later emptied around frame 412. |
| Original, seven later box prompts | 244 | 187.30 s | 1622.0 MiB | 2304 MiB | Turn coverage improved; some holes remained. Late prompts mistakenly included periods after actor exit, hidden by title graphics. Superseded by clean-source test. |

| Clean clip, five corrections and reviewed exit | 244 outputs, 184 SAM inference frames | 106.88 s | 1514.5 MiB | 2304 MiB | No unexpected empty masks. 60 subsequent sampled frames were explicitly marked subject-absent. |

Apple Silicon shares memory: RSS and Metal allocations can overlap and should not be added as a total. These are observed runs on this Mac, not guaranteed performance for all Macs. Local inference has no per-use API charge. Dependencies occupy about 1 GiB and model files about 160 MiB in this workspace.

## Camera prototype evidence

- Original baseline with weak Apple Vision actor exclusion: one model passed numerical consistency checks on 881/970 source frames, with 2.22 px median full-resolution residual. This is **not accepted as accurate** because actor tracks could contaminate the model.
- Original with corrected SAM plus conservative interpolated box exclusions: largest model passed checks on 844/970 frames, 2.12 px median residual, with gaps and disconnected auxiliary reconstructions. This is not an apples-to-apples accuracy improvement measurement; masking and per-frame filters changed.
- The whole clip has severe defocus, low light, moving foreground and uncertain lens behavior. Masking does not recover missing parallax or sharp background texture.
- Intermediate frames were withheld from reconstruction, then used to fit their own PnP poses. Their residuals are fit diagnostics, not independent ground-truth accuracy.
- Nine numerical tests passed, including recovery with one-third random correspondence outliers, missing-frame range separation, and correction-window boundary coverage. JavaScript syntax and fallback JSON parsing checks passed. Python dependency checks passed.
- AE host scripts executed successfully. The full camera import passed 20 projection checks (maximum 0.000188 px error). Panel preview, result loading, 907 camera keys, three nulls and a solid also passed. No AE project was saved. Visual stability remains a separate acceptance criterion.

## Clean-source camera result

The fresh clean-source job completed in **346.2 seconds** including proxy preparation, SAM, Apple Vision, matching, reconstruction and per-frame checks. It generated one model with 228 registered keyframes and 4383 filtered scene points. 908/970 source frames (93.6%) passed the numerical criteria. Median residual was 2.27 full-resolution pixels; the estimated fixed focal length was 2231.67 pixels.

The usable contiguous interval is **frames 0–906 inclusive** (907 frames, 37.79 seconds). Frame 908 also passed but is isolated; the final frames are missing. They have not been invented or filled by interpolation.

COLMAP logged `Matrix not positive definite` during bundle adjustment. That warning is carried into the result and review import. The result is provisional, not independently verified camera accuracy. The no-title source and revised masking both changed, so this is not a controlled proof of superiority to Adobe or to the first experiment.

`jobs/challenge-clean/Import Camera Review.jsx` is a self-contained import: it creates a new review composition for the longest contiguous range, a native animated camera and a small set of 3D nulls. It then samples AE's `toComp()` projection at several frames and writes `ae-host-check.json`. The host script ran successfully and `ae-host-check.json` records a pass. This verifies coordinate conversion, not real-world camera accuracy; rendered insert stability remains a separate acceptance step.

## Artifacts

- `jobs/challenge-v1`: baseline diagnostics; do not use as accepted solve.
- `jobs/challenge-v2`: single-prompt SAM drift evidence.
- `jobs/challenge-sam-corrected`: original-clip experiment and diagnostic `review.mp4`; superseded for final use by the clean source.
- `jobs/challenge-clean`: clean-source experiment.
- `docs/assets`: contact sheets and mask-review images.

The mask-review images use brighter analysis proxies and green overlays for diagnostic clarity. They are not edited deliverables of the source footage.
