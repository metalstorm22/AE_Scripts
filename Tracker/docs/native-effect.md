# Native effect implementation — 13 September 2026

SceneTrack 0.2 introduces a compiled macOS effect. This is the first native interaction slice, not a production release. The existing SAM/COLMAP analysis workflow remains in the ScriptUI panel.

## Implemented

- An effect named **SceneTrack**, match name `SceneTrack Camera Tracker`, in the SceneTrack category.
- Effect Controls for loading a completed `result.json`, showing points, point size, clearing selection, and creating a camera, null or solid.
- Custom Composition/Layer viewer drawing through Adobe Drawbot. Green crosses are frame-specific solved projections. Yellow crosses indicate selection. The overlay is custom UI and is not drawn into exported footage.
- Click near a point to select it. Shift-click adds/removes points, up to three. Clear Selection resets them.
- Hover between a nearby, non-collinear group of three points to propose a surface. Click the proposal to lock those points. The square preview and the created solid share the same world-space center, basis and extent. A three-point fit does not prove the points belong to one physical plane.
- Native effect state stores a versioned solve-file reference and selected IDs as an AE arbitrary parameter, with copy, compare and flatten/unflatten callbacks. Save/reopen and Undo still require actual host verification.
- Camera/null/solid creation addresses the effect's owning layer by persistent layer ID, rather than assuming the currently selected layer or creating an unrelated review comp.
- Existing-comp camera creation respects the source layer's start-time offset and preserves the comp's work area. A matching generated camera is reused. It does not save the AE project.
- Creation rejects a different source file, mismatched comp dimensions/fps/pixel aspect, retiming/stretch, non-default or animated footage transforms, missing frames, invisible selected tracks and nearly collinear surfaces.

## Build

```sh
AE_SDK_EXAMPLES_ROOT='/path/to/Adobe SDK/Examples' bash scripts/build-native.sh
```

The local build used Adobe's 25.6 SDK and produced `build/native/SceneTrack.plugin`, universal arm64/x86_64, ad-hoc signed. Source code is original; SDK headers/utilities are referenced from the separately installed SDK, not copied into this repository. The development binary references this checkout's `ae/native_bridge.jsx`; it is not a standalone distributable.

## Installation and use

Copy `build/native/SceneTrack.plugin` into the Plug-ins directory of the AE version to test. The protected Applications directory required administrator installation. The user approved Finder authentication, and SceneTrack was installed into AE Beta and signature-verified. The user force-quit the previously unresponsive Beta session; Beta was then relaunched. Native registration and live overlay loading subsequently passed. The startup notice was cleared and native camera/null creation was tested after restart.

After saving your work and restarting AE, apply **Effect → SceneTrack → SceneTrack** to the original footage layer. Use **Load Solve** to choose `jobs/challenge-clean/result.json`. Select the effect and enable layer controls to see its viewer overlay. Move within frames 0–906 for the current challenge result. Select one point for a null or three points on the same physical plane for a surface, inspect the preview, then create the layer.

Source must be an unretimed, unparented 2D footage layer with default transforms in a matching square-pixel composition. Cropping, prior geometric effects, footage replacement and precomp transforms are not compensated by this first implementation. The legacy pass-through render path advertises 8/16-bit support; 32-bit float fidelity is not yet verified. Do not use this development effect in a final render before that validation.

## Evidence and remaining tests

- Universal compilation, PiPL resource generation, Mach-O architectures and strict code-signature verification passed.
- A standalone native ingestion test loaded the 32 MiB challenge result in **0.426 seconds**, recovered 908 frames/4383 points and matched 118 stored projections within 0.000001 pixels. This measures native data parsing and math, not AE drawing.
- Native surface geometry tests passed, including plane/centroid/extent and collinearity rejection.
- Nine Python tests and ExtendScript syntax/parser checks passed.
- The earlier ScriptUI import passed AE projection checks. That evidence does **not** validate this new compiled overlay, hit testing or arbitrary parameter lifecycle.
- `tests/ae_native_bridge.jsx` exercises owning-comp creation, camera reuse, start-time offset, work-area preservation and retiming rejection. The first bridge test did not complete before the user force-quit AE Beta. Its force-quit report sampled ExtendScript in `jsRegExpClass::stringReplace`. Removed delegation to a potentially injected global JSON parser, and the native effect now sends a small camera/selection payload directly rather than asking ExtendScript to parse the full result. The independent `tests/ae_native_payload_test.jsx` host test now passes: camera creation took 469 ms; camera, three nulls and solid yielded 3/6/7 layers; the two-second start offset and work area were preserved; retiming was rejected without adding layers. See `jobs/native-bridge-host-test.json`.
- Native registration and loading the challenge result passed in AE Beta. Green solved-point overlays appeared in the Composition viewer at Fit 63.4% and Full resolution.
- Native placement buttons caused an AE crash. The crash report `After Effects (Beta)-2026-09-13-104147.ips` identifies `EffectMain` during `FLT_DisposeContext`, triggered by new-layer selection. The overlay accessed parameters before rejecting close-context events. The fix rejects lifecycle events before dereferencing host parameters and guards missing handles. A standalone close-context regression passes. Placement scripting also runs through an AEGP idle hook. After installing and restarting, both native Create Camera and point-selected Create Null passed. The null appeared at the clicked background point, and both idle executions returned without an AE exit.
- A further viewer redraw fix calls PF_InvalidateRect before requesting immediate updates. Direct surface clicks compute a nearby triangle without depending on a prior hover event. This build is installed and loads the solve; final click validation is pending a computer-use window-access failure.
- Native runtime still needs overlay alignment at multiple viewer zoom/resolution settings, hover/click selection, create-solid alignment, Undo/Redo, save/reopen, duplicate effects, missing solve files and render-depth checks after installation/restart.
- Analysis/masking controls, progress and cancellation remain in the existing panel. They have not yet migrated into the effect. Ground/origin controls, unrestricted multi-selection, selectable surface size/orientation and foreground occlusion are follow-up work.

The low-light challenge reconstruction remains provisional. Native UI improvements do not establish more accurate camera motion.

The approved AE disk-cache purge freed approximately 74 GiB. Source footage and project files were not removed.
