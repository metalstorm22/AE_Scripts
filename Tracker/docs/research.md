# Research and implementation choices

Reviewed 12 September 2026. The objective is native editable AE outputs and clearer failure recovery on moving, dark footage; no general claim of outperforming Adobe is established.

| Component | Role | Evidence / limitation |
|---|---|---|
| Meta SAM 2.1 Tiny | Prompted video object exclusion | Official code supports image/video prompts; tested here locally on MPS. One initial prompt drifts during this shot's actor turn. |
| Apple Vision | Local OCR and additional human exclusion | The initial segmentation request missed the dark silhouette in our first pass. OCR remained useful for burned-in text. |
| COLMAP | Features, multi-view camera reconstruction and bundle adjustment | Actual geometric reconstruction engine; CPU build tested locally. Assumes sufficient static scene observations. |
| OpenCV | Frame decode, enhancement, optical flow and robust PnP | Per-frame pose refinement and numerical consistency checks. Enhancement does not recover absent image detail. |
| AE ScriptUI / scripting | Host controls and editable camera/null/solid output | Practical prototype integration; not a compiled native effect or Adobe's tracker-point API. Host validation remains open. |

Primary references:

- [Meta SAM 2 repository](https://github.com/facebookresearch/sam2): implementation, model choices, installation and licenses. Code/checkpoints use Apache 2.0, with separate third-party notices. Pinned source commit: `2b90b9f5ceec907a1c18123530e92e794ad901a4`. The published A100 throughput is not a Mac benchmark.
- [Meta SAM 2 paper](https://arxiv.org/abs/2408.00714): prompted video segmentation with temporal memory. It is not camera tracking.
- [COLMAP repository](https://github.com/colmap/colmap) and [documentation](https://colmap.github.io/): structure from motion, camera models, bundle adjustment and masking. BSD license; review dependent component notices when distributing binaries.
- [LightGlue](https://github.com/cvg/LightGlue): learned sparse feature matching candidate for a later solver backend. Not installed or benchmarked on this shot.
- [CoTracker](https://github.com/facebookresearch/co-tracker): learned point tracking candidate; tracks can follow independently moving objects, so camera fitting still needs static-background selection. Not installed or benchmarked here.
- [VGGT](https://github.com/facebookresearch/vggt): learned cameras/depth/geometry candidate. License and model terms must be reviewed for the intended distribution; not included or benchmarked here.
- [Adobe scripts documentation](https://helpx.adobe.com/after-effects/desktop/automate-in-after-effects/automate-animation/scripts.html): running AE scripts and required preferences.

SAM helps select what the solver should ignore. A stronger matcher or learned camera prior can be a later addition, but must be evaluated on this clip with rendered inserts and independent geometry evidence before claiming better solves.
