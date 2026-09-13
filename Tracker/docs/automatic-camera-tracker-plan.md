# Plan

Build SceneTrack into an inclusive After Effects camera-tracking effect: apply it to a footage layer, click **Track Camera**, automatically identify unreliable moving regions, solve the camera, and place editable AE objects directly in the Composition viewer. Deliver the integration first, then improve automatic solving against a controlled benchmark. Better performance than Adobe's tracker is a release objective to demonstrate, not an established capability.

Status: proposed implementation plan, 13 September 2026. This document does not authorize implementation or record completed milestones.

## Scope

- **In:** one native effect with analysis, progress, cancellation, automatic background selection, optional lens constraints, live point/surface interaction, camera/null/solid/text creation, project persistence, local processing, and an installer that manages its dependencies. Start validation on Apple Silicon macOS, then qualify Windows and other supported hardware before claiming broad availability.
- **Deferred beyond the first release:** cloud processing, training a new foundation model, dense scene reconstruction, foreground occlusion compositing, and general rolling-shutter correction. Evaluate these separately after the camera-tracking workflow is reliable.
- **Product boundary:** default to automatic analysis with optional corrections. Distinguish complete, partial, and unsupported solves; never conceal missing evidence with fabricated camera keys. Absolute scene scale requires a known distance. Rotation-only footage must not be presented as a reliable depth reconstruction.

The intended workflow is **Apply effect → Track Camera → Inspect points and surface → Create Camera and object**. A separate ScriptUI panel, manual segmentation box, Python installation, or result-file picker must not be required for the default path. Keep import/export of solve data available as an advanced utility.

## Action items

- [ ] **1. Establish the baseline and acceptance protocol.** Freeze the current prototype and challenge-shot result as comparison artifacts. Assemble at least 20 diverse test shots covering ordinary footage, low light, independently moving subjects, foreground-dominated scenes, occlusion, blur, low parallax, zoom, reflections, overlays, and cuts. Reserve a held-out subset before tuning. Record AE version, hardware, input range, resolution, settings, retries, manual interventions, and wall-clock cost. Run Adobe's default and a documented assisted workflow as separate baselines.

  **Acceptance:** a reproducible evaluation manifest and review rubric exist before solver upgrades. The supplied native-tracker failure screenshot is supporting evidence, not a substitute for this controlled comparison. Missing/failed frames remain in the denominator.

- [ ] **2. Stabilize native effect behavior before adding analysis.** Finish the open validation in `native/effect/SceneTrack.mm`, `Surface.h`, and `ae/native_bridge.jsx`: redraw, point selection, surface selection/creation, owning-layer resolution, camera reuse, and callback lifetime safety. Preserve existing parameter IDs or add explicit state migration. Verify Undo/Redo, effect duplication, multiple comps, save/reopen, missing solve files, project closure, and render passthrough at 8/16/32 bpc.

  **Acceptance:** repeat the full placement workflow after a fresh AE launch without a crash; selected points and surfaces match the created layers; overlays do not appear in output renders. Build success alone does not satisfy this milestone.

- [ ] **3. Define the input, job, and persistence contracts.** Add a versioned job specification containing an effect-instance identifier, source identity, analysis revision, frame/time mapping, input fingerprint, settings, and result schema. Prototype host-supported frame access for original footage and an AE-rendered analysis input for precomps or upstream effects; do not silently solve a different image from the one being displayed. Define behavior for trims, start offsets, interpreted frame rates, pixel aspect, proxy changes, transforms, and retiming. Mark a solve stale when its analysis input changes.

  **Acceptance:** source and composition timing agree at representative frames; unsupported cases get an actionable explanation before analysis. Store compact solved data and selection state with the project, while treating large proxies/features as regenerable cache. Prove save/reopen and project transfer without this development checkout.

- [ ] **4. Put Track Camera, progress, and cancellation inside the effect.** Connect the effect to a bundled local worker using asynchronous job control. Refactor reusable orchestration from `ae/SceneTrack.jsx` and `worker/launch.py`; keep heavy processing and frame decoding outside AE UI/render callbacks. Define explicit states: Ready, Preparing, Analyzing, Solving, Validating, Solved, Partial, Needs Guidance, Cancelled, and Failed. Discard late results from cancelled or superseded jobs, and limit concurrency so multiple effects do not exhaust memory.

  **Acceptance:** on a simple static scene, apply the effect and click Track Camera to reach a usable result without another panel or file dialog. AE stays interactive; cancellation is acknowledged within one second and terminates the worker process tree within a proposed five-second budget. Worker failure does not terminate AE. Measure memory, disk use, and UI stalls rather than assuming isolation solves them.

- [ ] **5. Automate moving-object and unreliable-region exclusion.** Extend `worker/sam_masks.py` and `worker/solve.py` beyond one manually prompted subject. Generate object candidates automatically, estimate candidate background motion, identify inconsistent tracks, propagate masks with SAM, and repeat the geometry/exclusion pass within a bounded retry budget. Discover objects entering later; detect drift and refresh prompts automatically. Treat object categories as evidence rather than automatically rejecting all people or vehicles. Reject screen-fixed graphics, reflections, and unstable light patterns when their temporal behavior supports exclusion.

  **Acceptance:** the challenge shot runs without an initial box or manually entered exit frame. Review exclusion coverage throughout the clip, including the actor's exit. Test stationary objects, multiple moving objects, and a large foreground subject; the system must not assume the largest motion group is the background. Compare against the same solver with automatic exclusion disabled to measure its actual contribution.

- [ ] **6. Add adaptive matching, camera hypotheses, and Advanced lens controls.** Keep geometric verification and joint camera/point refinement as the foundation. Benchmark a learned matcher such as LightGlue and a temporal point tracker such as CoTracker against the current implementation before selecting dependencies. Automatically retry weak intervals with denser sampling, alternative matches, or analysis-only exposure/contrast adjustments. Compare fixed-lens, changing-lens, and rotation-only hypotheses conservatively. Add Auto/Hint/Lock settings for focal length or field of view, sensor size, and supported distortion parameters. Track uncertainty and reject ill-conditioned estimates.

  **Acceptance:** unknown-lens footage requires no metadata. A focal length in millimeters is interpreted with sensor/crop information; excessive parameters do not improve the reported score by overfitting. Known synthetic cameras recover within declared tolerances. Distortion support includes a verified undistort/composite/redistort workflow. Retries stop at a defined resource budget and explain remaining gaps. Generative detail reconstruction is excluded from analysis preprocessing.

- [ ] **7. Complete direct placement and guided recovery in the viewer.** Show usable points by default, with optional excluded-region and weak-track overlays. Add hover surfaces, multi-selection, adjustable surface size, ground/origin, known-distance scale, and camera-plus-null/solid/text actions. Support Ignore This Object, Prefer This Background, and Exclude Track Across Time. Reuse cached work after corrections. Show solved and uncertain intervals on a quality timeline with explanations, rather than an uncalibrated confidence percentage.

  **Acceptance:** a user can track and place content entirely through the effect and Composition viewer. The preview and created surface share their geometry. Corrections improve the targeted interval without silently changing unrelated placement or overwriting hand-edited cameras. Re-solving offers an explicit, undoable update of linked layers. Verify multiple viewer zoom levels, downsampling levels, and effect-selection visibility.

- [ ] **8. Validate full-shot camera quality and calibrate completion rules.** Run the frozen benchmark and held-out shots. Measure reliable frame coverage, independently checked image alignment, insert drift at multiple depths, camera jitter, interventions, processing time, peak memory, and failure detection. Use known camera motion on synthetic footage and tracked validation features excluded from fitting where possible. Review actual AE composites at the start, middle, end, and weakest intervals. Low reprojection error on fitted tracks is diagnostic evidence only.

  **Acceptance:** publish per-shot outcomes and failures. A proposed release gate is a higher usable-solve rate than Adobe on the difficult-shot set, fewer median corrections, no material regression on ordinary shots, and resource usage within the supported hardware budget. Freeze numerical drift/jitter tolerances after baseline measurement and before evaluating held-out data. A Partial solve never receives a full-shot success label. If superiority is not demonstrated, ship only with narrower, supported claims.

- [ ] **9. Package and qualify the supported platforms.** Remove hard-coded checkout paths and user-managed runtime requirements. Bundle the worker and redistributable dependencies; include required models or provide a managed first-run download with integrity verification. Audit the licenses of code and exact model weights, and choose alternatives where redistribution is unsuitable. Add signed/notarized macOS installation, a Windows build/installer, hardware capability detection, CPU fallback where practical, cache limits, and a clear uninstall path. Qualify stable AE versions as well as Beta.

  **Acceptance:** install on clean machines without developer tools or Python; complete the default workflow offline after model provisioning. Record minimum/recommended memory and measured solve times. Test unsupported hardware messaging, low disk space, interrupted downloads, worker crashes, media relinking, and moving saved projects between machines. Every advertised platform must pass the same host workflow checks.

- [ ] **10. Release through a controlled beta and document the actual workflow.** Package a versioned beta with a rollback build, sample projects, a short Track Camera tutorial, and known limitations. Collect opt-in diagnostic reports and reproducible failure cases. Update `README.md`, `docs/native-effect.md`, and the benchmark report around the effect-owned workflow. Keep migration compatibility for earlier solved projects; retire the panel as a requirement only after parity is verified.

  **Acceptance:** a small group of users can install, track their own shots, correct exclusions, place objects, and reopen projects without developer assistance. Release notes identify measured improvements and remaining unsupported cases. No production-readiness claim based solely on compilation or the challenge shot.

Milestones 1–4 deliver the integrated native workflow; 5–8 establish automatic behavior and measured tracking quality; 9–10 establish distribution and broader usability. Prepare packaging and license feasibility during dependency selection so a later distribution issue does not invalidate the engine choice.

## Open questions

- **Initial platform rollout:** assume an Apple Silicon macOS beta first, followed by Windows qualification; broad availability remains part of the product goal.
- **Performance target:** set supported clip-length, RAM, disk, and processing-time budgets from baseline measurements in milestone 1. “Automatic” must have a bounded compute cost.
- **Lens breadth for the first public release:** prioritize unknown fixed lenses; qualify zoom and distortion independently, and keep unsupported cases explicit until they pass the same placement tests.
