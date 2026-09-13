# Liquid Glass — After Effects plugin

A native effect plugin: refracting glass with edge-weighted chromatic
dispersion, a specular rim and a contact shadow. It replaces the twelve-layer
comp rig that `../liquid_glass.jsx` builds with a single effect on a single
layer.

## Build

Requires Xcode command line tools and the After Effects SDK.

```bash
make
```

The SDK path is a Makefile variable; override it if yours lives elsewhere:

```bash
make AE_SDK=/path/to/ae.AfterEffectsSDK
```

Output is `build/LiquidGlass.plugin` — a universal (x86_64 + arm64), ad-hoc
signed bundle.

## Install

```bash
make install
```

That copies the bundle to
`~/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore`, which every
installed version of After Effects reads. Restart AE; the effect appears under
**PG Tools ▸ Liquid Glass**. `make uninstall` removes it.

## Use

Apply it to **the layer behind the glass** — the backdrop — and pick the
silhouette with **Shape Layer**. Anything with an alpha works: a shape layer, a
text layer, a logo with a matte. With no Shape Layer picked the effect falls
back to the alpha of the layer it is applied to, so dropping it straight onto a
shape does something sensible.

| Group | Controls |
|---|---|
| — | Shape Layer, Quality (Draft / Standard / High / Ultra) |
| Refraction | Strength, Scale, Curvature, Edge Width |
| Chromatic Dispersion | Amount, Edge Reach, Edge Blur |
| Glass Body | Frost, Tint Color, Tint, Opacity |
| Specular Highlights | Intensity, Edge Width, Softness, Light Angle, Light Color, Highlight Distance |
| Shadow | Enable, Opacity, Distance, Softness |

Every pixel distance is authored at full resolution and scaled by the host's
downsample factor, so a half-resolution preview matches the final render instead
of quietly halving the look. Light Angle drives the specular rim, the inner
wash and the shadow direction together.

Quality trades render time for fidelity: **Draft** drops the per-channel
dispersion entirely and runs one blur pass, which is what makes it scrubbable;
**Ultra** runs four. It changes nothing else, so a look dialled in on Draft
still holds at Ultra.

## Architecture

The render pipeline has no host dependency. Only `LiquidGlass.cpp` and
`LG_World.cpp` include an After Effects header.

| File | Responsibility |
|---|---|
| `src/LiquidGlass.h` | Identity, parameter indices, stable disk IDs |
| `src/LiquidGlass.cpp` | Command dispatch, smart pre-render / render, legacy render |
| `src/LG_Params.cpp` | Parameter list; reads them into resolved `Settings` |
| `src/LG_World.cpp` | 8 / 16 / 32 bit world ↔ float conversion |
| `src/LG_Image.h` | `Plane`, `Rgba`, samplers, row-parallel dispatch |
| `src/LG_Filters.cpp` | Box blur, Euclidean distance field, gradient |
| `src/LG_Glass.cpp` | `ShapeField` and the shading itself |
| `tests/render_preview.cpp` | Renders a frame without After Effects |

Adding a control is three edits: an index in `LiquidGlass.h`, a disk ID beside
it, and one line in each of `SetupParams` and `ReadSettings`.

### How the look is built

One **exact Euclidean distance field** of the silhouette is computed per frame
(Felzenszwalb–Huttenlocher, separable, O(n)), and everything is read out of it:

- **the bevel** — distance ramped over Edge Width, shaped between a linear
  chamfer and a spherical dome by Curvature. Its gradient is the surface normal,
  and that normal is what bends the backdrop.
- **the dispersion core** — a threshold at Edge Reach. Inside it the glass is
  achromatic; only the band outside splits red and blue. Dispersion spread
  uniformly across a whole slab is the giveaway of a fake, and it is what the
  script's `Dispersion` slider did before this.
- **the specular ring** — a threshold at the rim's Edge Width.

A distance field rather than the obvious alternatives on purpose. Blurring the
alpha leaves a slope discontinuity where the blur stops reaching the edge, which
differentiates into a visible inner outline ghosting the silhouette. A separable
sliding-window minimum erodes with a *square*, so choking a rounded shape by
60px leaves straight sides and a rectangular seam across the middle of the
glass. Both artifacts were visible in `build/preview.png` before the switch.

The backdrop is frosted once and sampled from, rather than blurring three
refracted copies: one blur instead of one per channel, and no smearing of the
silhouette back into itself.

### Host integration notes

- Smart render, 8/16/32 bit, `PF_OutFlag2_SUPPORTS_THREADED_RENDERING`. Inner
  loops are additionally row-parallel across cores.
- The effect expands its buffer (`PF_OutFlag_I_EXPAND_BUFFER`) so the shadow and
  the refraction can reach outside the layer's bounds. Pre-render requests the
  source outset by whatever the current settings can reach, so samples near the
  frame edge are real pixels rather than a clamped edge.
- Input and Shape Layer are checked out on the *same* rect, which is what
  guarantees they come back aligned pixel for pixel.
- A `PF_Cmd_RENDER` path is kept for hosts that do not drive the smart path.

## Verifying a change

```bash
make preview
```

Builds and runs `tests/render_preview.cpp` against a striped gradient backdrop
and a squircle, and writes `build/preview.png`. Diagonal stripes make any
displacement obvious, so a broken bevel or an inverted normal is visible at a
glance — a second, instead of a plugin reinstall and an After Effects restart.
