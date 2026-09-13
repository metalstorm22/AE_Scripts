# SceneTrack — local AE camera tracking prototype

A first compiled native effect is now built at `build/native/SceneTrack.plugin`. See [native effect implementation](docs/native-effect.md) for viewer selection, in-comp placement, installation and validation limits. Native runtime acceptance is pending; the ScriptUI workflow below remains available.

SceneTrack is a macOS ScriptUI extension with a local camera-solving worker. It creates editable AE cameras, 3D nulls and solids in a separate review composition. This first version is an engineering prototype, not yet a production replacement for Adobe's native tracker. Camera conversion and the panel preview/import/null/solid workflow have passed tests in After Effects Beta. Whole-shot insert stability remains unapproved.

See `docs/validation-follow-up.md` for the latest host results and rejected refinement trials.

## Current clean-shot review

The supplied title-free clip has a provisional continuous solve for frames 0–906 (37.79 seconds). Run `jobs/challenge-clean/Import Camera Review.jsx` using AE **File → Scripts → Run Script File** to create a separate native camera review composition and write an actual AE projection check. The numerical optimizer warned about conditioning; this result is not production-approved. `jobs/challenge-clean/review.mp4` shows analysis exclusions and accepted tracks at the original timing.

## Local setup

Requires Apple Silicon macOS, Python 3.12, and Xcode command-line tools. In this directory run:

```sh
bash scripts/setup.sh
bash scripts/setup_sam.sh
```

The development environment here is already installed. SAM weights are downloaded once (about 148 MiB). There are no hosted inference calls or per-use API charges; the source video stays on your machine. Installation downloads Python packages and Meta's model.

In AE, choose **File → Scripts → Run Script File** and select `ae/SceneTrack.jsx`. Keep it alongside `ae/lib.jsx` and the worker directory. AE's “Allow Scripts to Write Files and Access Network” preference is required for local job files and launching the worker. No project is saved automatically.

## Workflow

1. Choose original footage, or select an unretimed footage layer and choose **Use Selected Layer**. The latter uses the composition work area. Precompositions and retiming require a rendered source.
2. Set the source frame range. Leave focal length blank when unknown. Gamma only affects the analysis proxy.
3. Choose **SAM 2.1 Tiny + text**, click **Preview Start**, and drag a box around the moving subject. If the subject leaves, set **Last frame with subject** so later empty masks are expected. For turns or occlusion, enter a later **Correction frame**, click **Show Frame**, and draw a new box. Correction frames snap to the four-frame sampling grid. When SAM drifts under titles, **Also exclude prompt boxes between corrections** adds a conservative manual envelope. Review its coverage; it is separate from SAM segmentation.
4. **Analyze Camera**. The worker uses segmentation exclusions, local OCR, CPU COLMAP reconstruction, bundle adjustment, and per-frame robust pose checks. It rejects empty subject masks unless the explicit prompt-box envelope is enabled. Inspect masks under the job's `sam_masks` and `masks` directories; nonempty masks can still follow the wrong object.
5. Choose a reconstruction and contiguous frame range. **Create Camera** creates a separate review composition. Click preview points (Shift-click to add) to create nulls or choose three coplanar points to create a solid. Test an insert at multiple depths and through the whole range before use.

Each job retains configuration, enhanced proxies, exclusion masks, logs, reconstruction and result JSON. Cancel stops the worker and its active segmentation child. Missing camera frames are not interpolated; disconnected reconstructions are separate coordinate systems.

## Evidence and limitations

See `docs/research.md` for sources and `docs/challenge-report.md` for the challenge benchmark. The native tracker failure is supported by the supplied screenshot; it is not a controlled benchmark of every Adobe setting.

- SAM segments objects; COLMAP/PnP solve the camera. There is no neural camera-pose model in this version.
- The initial camera model is a fixed pinhole with estimated focal length. Zoom, distortion, rolling shutter, focus breathing, low parallax and animated bokeh remain limitations.
- Low residuals measure consistency of selected correspondences, not ground-truth camera accuracy. The intermediate frames are withheld from reconstruction, but their own PnP fits use their tracked observations; they are not independent test observations.
- Absolute scene scale is unknown. No real lens metadata was supplied.
- Masks sample every fourth source frame. Bracketing masks are unioned when checking intermediate frames. Fast foreground motion may require denser sampling.
- Only one prompted SAM object is currently supported. Other moving objects need extra exclusion rectangles or separate shorter ranges.
- SAM can drift without becoming empty. Correction prompts and mask review are essential on this shot.
- The panel preview, result loading, camera creation, null creation and solid creation passed in AE Beta. Launching a fresh full analysis from the panel and post-restart docked behavior have not been tested. Loading the compact review result can still block the UI for several minutes.

## Tests

```sh
.venv/bin/python -m unittest discover -s tests -v
```

`tests/ae_geometry_probe.jsx` creates an isolated test composition and writes AE's actual projected coordinates to `jobs/ae-geometry-probe.json`. It does not save or replace the project. The native probe and full import now pass; see the host evidence in the validation follow-up.

## Dockable development loader

`dist/SceneTrack.jsx` is a small loader pointing to this checkout. To regenerate it after moving the folder, run `.venv/bin/python scripts/make_panel_loader.py`. Install that loader through **File → Scripts → Install ScriptUI Panel**, then open it from AE's Window menu after restarting AE when convenient. The worker and weights remain in this checkout. The loader alone is not a standalone distributable plugin.
