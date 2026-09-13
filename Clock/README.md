# Ticking Clock 4.1

A dockable After Effects panel that applies a rolling clock to **one point-text layer**. No controller null, master null, extra digit layers, precomps, or runtime dependencies. The supplied v3 script is untouched.

## Run

1. In After Effects, open a composition.
2. Choose **File → Scripts → Run Script File…** and select `Ticking Clock.jsx`.
3. Select a point-text layer and click **Apply to text**, or click **New clock**.
4. Set the time and appearance in the four tabs. Select another clock and click **Refresh** to load its values.

To dock it, copy `Ticking Clock.jsx` into your After Effects installation's `Scripts/ScriptUI Panels` folder, restart AE, then open **Window → Ticking Clock**. Installation has not been performed automatically.

## Controls

| Tab | Controls |
| --- | --- |
| Time | Start time (`HH:MM:SS` or seconds), signed speed, manual mode, absolute manual time in seconds |
| Display | Seconds on/off, 24-hour time, AM/PM, leading hour zero, tracking |
| Motion | Shared transition duration, vertical travel, up/down direction, right-to-left cascade |
| Colons | Visibility, pulse on/off, minimum opacity, pulse rate |

**AM/PM overrides 24-hour display.** Minutes and seconds always retain their zero. Hiding the hour zero uses a figure space to preserve its column. Hiding seconds removes the second colon and the seconds field. Turning off colons keeps their spacing.

Use the **Character panel** for font, size, color, and tracking; use the layer's **Transform** for position, scale, rotation, and opacity. New clocks use Menlo. Use a monospaced font or a font with tabular digits for a stable width; proportional digits can shift horizontally.

The panel is the grouped editing surface. The 17 underlying native effects have section prefixes but are **not nested effect groups**. They are keyframeable in Effect Controls/the timeline. Editing an already-keyframed control through the panel writes a keyframe at the current composition time. Otherwise the panel changes its static value. Refresh after scrubbing, editing timeline values, or switching selected layers.

## Timing and animation

- Automatic time starts at the layer's in-point. Speed `1` counts up, `-1` counts down, and `0` freezes at the start time.
- Time wraps every 24 hours, including backward across midnight. This is a time-of-day display, not a timer that clamps at zero.
- Set **Duration** to `0` for instant ticking. Set **Travel** to `0` for a fade-out/fade-in without vertical travel.
- The transition duration is shared by all digits. Only changing characters move. Cascades and durations are capped to fit before the next tick at high speeds.
- Each changing digit eases and fades out, changes while invisible, then eases and fades in. Old and new digits do not overlap. The three v3 custom curve controls and per-unit durations have been consolidated. Scale punch, rotation swing, exposure flicker, and separate colon scaling are omitted.
- Pulse runs in composition seconds, independently of clock speed, including when the clock is paused.
- For animated time, enable **Manual** and animate **Manual time (sec)** as an absolute clock value. Use continuous/linear keys for ticking; held values remain static. Abrupt jumps are cuts, not a simulation of every skipped second.
- Use a constant **Speed** for automatic playback. Keyframing speed multiplies elapsed time by its current value; it does not integrate a speed ramp. Animate manual time for ramps.

## Implementation and boundaries

This is a **ScriptUI tool using native text animators and expression controls**, not a compiled `.plugin`/`.aex` effect or a single pseudo-effect in the Effects menu. The applied clock renders without the panel installed, and can be renamed or duplicated without name-based links.

Source Text contains one line. Two native text animators control vertical movement and per-character opacity. There are no hidden copies of the text. The clock expression owns Source Text. Paragraph text, existing Source Text animation/expressions, and existing text animators are rejected to avoid breaking them. Other effects, transforms, original static text, and other layers are preserved; Undo restores an application.

Targets AE 2020+; verified host version is in the report. Host verification status is recorded separately in `verification/report.txt` if the included AE check was run.

## Verification

Run `node tests/clock.test.cjs` for expression logic checks covering time formats, midnight/noon, countdown, visibility, motion, cascade, and manual direction.

Run `tests/verify-in-ae.jsx` through AE's **Run Script File** to create a disposable test composition and render sample JPEGs into `verification/`. It checks expression errors, one-layer construction, repeat application, and duplication. It leaves the test comp for inspection and does not save or close your project. The check uses the render queue and its JPEG template, preserving other queued entries. Mathematical tests alone do not prove host rendering. The undocumented saveFrameToPng preview export produced clipped static glyphs here and was excluded from acceptance.

Adobe reference: [Text animators and expression selectors](https://helpx.adobe.com/after-effects/desktop/animating-text/text-animation/animating-text.html), [text-style expressions](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expressions-to-edit-and-access-text-properties/expressions-text-properties.html).

Current validation: 12 expression-logic checks passed. Application to a text layer, repeat application, and expression evaluation worked in AE 2026. One transition frame rendered successfully through the render queue. The larger export batch stopped with AE Error Code 3 (restart requested), so full export and motion-playback validation remain incomplete. Your unsaved project was not closed or saved.

Tracking: use Display → Tracking in the panel or TC | Display / Tracking in Effect Controls. This adds character spacing in 1/1000 em; zero retains the existing Character-panel spacing. Positive values spread characters apart; negative values tighten them. It is keyframeable. Reapply the updated script to an existing clock to add tracking without resetting its time, motion, or styling. Live validation: tracking 0 to 100 increased the selected clock width from 962.31 to 1662.31 pixels; the value was restored to 0.
