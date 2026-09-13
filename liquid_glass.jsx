/**
 * Liquid Glass — Apple style glass rig generator for Adobe After Effects.
 *
 * Select a layer (shape, text, solid, footage — anything with an alpha) and press
 * "Create Liquid Glass". The script turns that layer into a refracting glass slab:
 * the layers underneath it are bent through the rim with per channel dispersion,
 * frosted, tinted, then given a specular rim and an ambient contact shadow.
 * With nothing selected it generates an Apple style squircle to build on.
 *
 * How it is built
 *   LGn Shape      the form, precomposed. Every effect in the rig samples this,
 *                  and a Transform effect inside it is driven by the Controls, so
 *                  the whole rig can be moved, scaled and rotated after the fact.
 *   LGn Backdrop   everything that was underneath, precomposed so it can be bent.
 *   LGn Refract R/G/B
 *                  three copies of the backdrop through CC Glass at slightly
 *                  different strengths. Blue bends hardest, red least — recombined
 *                  one channel each, that difference is the chromatic dispersion.
 *   LGn Glass      the merge, frosted, tinted and matted to the form.
 *   LGn Core       the same body built from the green pass alone, matted to a
 *                  choked copy of the form. It covers the middle of the glass so
 *                  the dispersion only survives in a band around the edge, which
 *                  is where real dispersion lives.
 *   LGn Sheen      inner tint and directional light wash.
 *   LGn Rim Light  specular edge, masked to a ring choked out of the form's alpha.
 *   LGn Controls   the sliders everything is expression-linked to.
 *
 * Working with it afterwards
 *   • Tweak the look: open the "LGn Controls" comp and select the null inside it.
 *     Every parameter is live — refraction, dispersion and its edge falloff,
 *     frost, tint colour, rim, light angle and colour, shadow. Pixel denominated
 *     controls are calibrated for 1080p and scaled to the comp automatically.
 *   • Move, scale or rotate the glass with the Glass Position / Glass Scale /
 *     Glass Rotation controls on that same null. The silhouette, both mattes, the
 *     refraction, the lighting gradients and the shadow all follow.
 *   • Quality trades render time for fidelity. Draft drops to a single refraction
 *     pass (no dispersion) for scrubbing; switch back up before rendering.
 *
 * Drop inside AE's ScriptUI Panels folder (dockable) or run via
 * File > Scripts > Run Script File...
 *
 * Requires CC Glass (ships with After Effects as part of Cycore FX HD). The
 * script checks for it before it touches your project.
 */
(function (thisObj) {
    var SCRIPT_NAME = "Liquid Glass";
    var SETTINGS_KEY = "LiquidGlassRig";

    /**
     * Named looks. Every value maps onto a control on the generated null, so a
     * preset is only a starting point.
     */
    var PRESETS = {
        "Control Center": {
            refraction: 120, refractScale: 100, dispersion: 22, dispersionEdge: 60,
            edgeWidth: 45, curvature: 50, frost: 8, glassOpacity: 100,
            rim: 100, tint: 15, shadow: 38
        },
        "Heavy Crystal": {
            refraction: 260, refractScale: 108, dispersion: 45, dispersionEdge: 95,
            edgeWidth: 80, curvature: 75, frost: 3, glassOpacity: 100,
            rim: 100, tint: 10, shadow: 45
        },
        "Subtle Frost": {
            refraction: 70, refractScale: 100, dispersion: 12, dispersionEdge: 40,
            edgeWidth: 30, curvature: 38, frost: 22, glassOpacity: 100,
            rim: 80, tint: 24, shadow: 30
        },
        "Dispersive Bubble": {
            refraction: 300, refractScale: 96, dispersion: 110, dispersionEdge: 220,
            edgeWidth: 120, curvature: 95, frost: 2, glassOpacity: 100,
            rim: 100, tint: 8, shadow: 28
        }
    };

    var PRESET_ORDER = ["Control Center", "Heavy Crystal", "Subtle Frost", "Dispersive Bubble"];

    /**
     * Quality is a render-time/fidelity trade, not a look. Draft collapses the
     * three refraction passes to one — no dispersion, but roughly a third of the
     * work — which is what makes the rig scrubbable on a laptop.
     */
    var QUALITY = {
        "Draft":    {samples: 36,  iterations: 1, dispersive: false, grain: false},
        "Standard": {samples: 72,  iterations: 2, dispersive: true,  grain: true},
        "High":     {samples: 128, iterations: 3, dispersive: true,  grain: true},
        "Ultra":    {samples: 256, iterations: 4, dispersive: true,  grain: true}
    };

    var QUALITY_ORDER = ["Draft", "Standard", "High", "Ultra"];

    /** ExtendScript predates Array.prototype.indexOf. */
    function indexIn(list, value) {
        for (var i = 0; i < list.length; i += 1) {
            if (list[i] === value) {
                return i;
            }
        }
        return -1;
    }

    // ---------------------------------------------------------------------
    // Property plumbing. CC effects and a few AE effects rename or renest
    // their parameters between versions, so every write goes through a
    // tolerant lookup instead of a hard coded path.
    // ---------------------------------------------------------------------

    /**
     * Depth first search for a property by display name or match name.
     */
    function findProp(root, name) {
        if (!root || !root.numProperties) {
            return null;
        }
        for (var i = 1; i <= root.numProperties; i += 1) {
            var prop = null;
            try {
                prop = root.property(i);
            } catch (e) {
                prop = null;
            }
            if (!prop) {
                continue;
            }
            if (prop.name === name || prop.matchName === name) {
                return prop;
            }
            if (prop.numProperties && prop.numProperties > 0) {
                var deep = findProp(prop, name);
                if (deep) {
                    return deep;
                }
            }
        }
        return null;
    }

    /**
     * Sets the first parameter that matches any of the candidate names.
     * Returns the property so callers can hang an expression off it.
     */
    function setParam(host, names, value) {
        var candidates = (names instanceof Array) ? names : [names];
        for (var i = 0; i < candidates.length; i += 1) {
            var prop = findProp(host, candidates[i]);
            if (!prop) {
                continue;
            }
            if (value !== null && value !== undefined) {
                try {
                    prop.setValue(value);
                } catch (e) {
                    continue;
                }
            }
            return prop;
        }
        return null;
    }

    function setExpr(host, names, expression) {
        var prop = setParam(host, names, null);
        if (prop) {
            try {
                prop.expression = expression;
            } catch (e) {
                // Locked or unsupported — the static value already covers it.
            }
        }
        return prop;
    }

    /**
     * Writes a static value and then an expression over the top. Every live
     * parameter in the rig goes through here: the static write is the fallback
     * for AE builds that refuse an expression on that parameter type, which is
     * mostly the layer pickers.
     */
    function bind(host, names, value, expression) {
        var prop = setParam(host, names, value);
        if (prop && expression) {
            try {
                prop.expression = expression;
            } catch (e) {
                // Static value stands.
            }
        }
        return prop;
    }

    /**
     * Applies the first available effect from a list of match names.
     */
    function addEffect(layer, matchNames, name) {
        var candidates = (matchNames instanceof Array) ? matchNames : [matchNames];
        var parade = layer.property("ADBE Effect Parade");
        for (var i = 0; i < candidates.length; i += 1) {
            if (!parade.canAddProperty(candidates[i])) {
                continue;
            }
            try {
                var fx = parade.addProperty(candidates[i]);
                if (name) {
                    fx.name = name;
                }
                return fx;
            } catch (e) {
                continue;
            }
        }
        return null;
    }

    /**
     * True when CC Glass can be applied in this install. Checked on a throwaway
     * comp before anything in the user's project is touched, so a missing
     * Cycore install costs an alert rather than a half built rig.
     */
    function hasCCGlass() {
        var probeComp = null;
        try {
            probeComp = app.project.items.addComp("LG Capability Probe", 16, 16, 1, 1, 24);
            var probe = probeComp.layers.addSolid([0, 0, 0], "probe", 16, 16, 1, 1);
            return probe.property("ADBE Effect Parade").canAddProperty("CC Glass");
        } catch (e) {
            return true; // Could not tell — let the build try and report for real.
        } finally {
            if (probeComp) {
                try {
                    probeComp.remove();
                } catch (e2) {
                    // Nothing to do; the probe comp is harmless.
                }
            }
        }
    }

    // ---------------------------------------------------------------------
    // Geometry
    // ---------------------------------------------------------------------

    /**
     * Superellipse path. n = 2 is an ellipse, n around 5 is the continuous
     * corner squircle Apple uses for icons and glass chips.
     */
    function squirclePath(width, height, n, samples) {
        var verts = [];
        var i;
        for (i = 0; i < samples; i += 1) {
            var t = (i / samples) * Math.PI * 2;
            var ct = Math.cos(t);
            var st = Math.sin(t);
            var x = Math.pow(Math.abs(ct), 2 / n) * (width / 2) * (ct < 0 ? -1 : 1);
            var y = Math.pow(Math.abs(st), 2 / n) * (height / 2) * (st < 0 ? -1 : 1);
            verts.push([x, y]);
        }

        var inTangents = [];
        var outTangents = [];
        for (i = 0; i < verts.length; i += 1) {
            var prev = verts[(i - 1 + verts.length) % verts.length];
            var next = verts[(i + 1) % verts.length];
            var tx = (next[0] - prev[0]) / 6;
            var ty = (next[1] - prev[1]) / 6;
            inTangents.push([-tx, -ty]);
            outTangents.push([tx, ty]);
        }

        var shape = new Shape();
        shape.vertices = verts;
        shape.inTangents = inTangents;
        shape.outTangents = outTangents;
        shape.closed = true;
        return shape;
    }

    function createSquircleLayer(comp, name, sizeRatio, squareness, samples) {
        var layer = comp.layers.addShape();
        layer.name = name;

        var base = Math.min(comp.width, comp.height) * sizeRatio;
        var group = layer.property("Contents").addProperty("ADBE Vector Group");
        group.name = "Glass Form";
        var contents = group.property("Contents");

        var path = contents.addProperty("ADBE Vector Shape - Group");
        path.property("ADBE Vector Shape").setValue(
            squirclePath(base * 1.55, base, squareness, samples)
        );

        var fill = contents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([1, 1, 1, 1]);

        layer.property("Transform").property("Position").setValue([comp.width / 2, comp.height / 2]);
        return layer;
    }

    // ---------------------------------------------------------------------
    // Comp helpers
    // ---------------------------------------------------------------------

    function nextRigIndex(comp) {
        var highest = 0;
        function consider(name) {
            var match = /^LG(\d+)[\s]/.exec(name);
            if (match) {
                var n = parseInt(match[1], 10);
                if (n > highest) {
                    highest = n;
                }
            }
        }
        for (var i = 1; i <= comp.numLayers; i += 1) {
            consider(comp.layer(i).name);
        }
        // The rig also owns project items, so keep those names free too.
        for (var k = 1; k <= app.project.numItems; k += 1) {
            consider(app.project.item(k).name);
        }
        return highest + 1;
    }

    function addSolid(comp, color, name) {
        return comp.layers.addSolid(color, name, comp.width, comp.height, comp.pixelAspect, comp.duration);
    }

    /**
     * Approximate comp-space bounding box of a layer's visible content. Used to
     * size and anchor the lighting gradients to the glass itself — spanning them
     * across the whole comp leaves the object sitting in the flat middle of the
     * ramp, which is what makes a rim read as a flat sticker instead of an edge.
     */
    function contentBounds(layer, comp) {
        var fallback = {
            left: comp.width * 0.25,
            top: comp.height * 0.25,
            width: comp.width * 0.5,
            height: comp.height * 0.5
        };
        try {
            var r = layer.sourceRectAtTime(comp.time, false);
            var tr = layer.property("Transform");
            var anchor = tr.property("Anchor Point").value;
            var pos = tr.property("Position").value;
            var scale = tr.property("Scale").value;
            var sx = scale[0] / 100;
            var sy = scale[1] / 100;
            var box = {
                left: pos[0] + (r.left - anchor[0]) * sx,
                top: pos[1] + (r.top - anchor[1]) * sy,
                width: r.width * sx,
                height: r.height * sy
            };
            if (!(box.width > 1) || !(box.height > 1)) {
                return fallback;
            }
            return box;
        } catch (e) {
            return fallback;
        }
    }

    /** Union of the bounds of several layers, so a multi-layer selection still
     *  gets its lighting anchored to the whole form rather than to layer one. */
    function unionBounds(layers, comp) {
        var left = null, top = null, right = null, bottom = null;
        for (var i = 0; i < layers.length; i += 1) {
            var b = contentBounds(layers[i], comp);
            if (left === null || b.left < left) { left = b.left; }
            if (top === null || b.top < top) { top = b.top; }
            if (right === null || b.left + b.width > right) { right = b.left + b.width; }
            if (bottom === null || b.top + b.height > bottom) { bottom = b.top + b.height; }
        }
        return {left: left, top: top, width: right - left, height: bottom - top};
    }

    function setMatte(layer, matteLayer, name, expression) {
        var fx = addEffect(layer, ["ADBE Set Matte3"], name || "Glass Matte");
        if (!fx) {
            return null;
        }
        bind(fx, ["ADBE Set Matte3-0001"], matteLayer.index, expression);
        setParam(fx, ["ADBE Set Matte3-0002"], 4);    // Use For Matte: Alpha
        setParam(fx, ["ADBE Set Matte3-0006"], true); // Premultiply Matte Layer
        return fx;
    }

    // Layer objects are invalidated by precompose, so helper layers are always
    // re-fetched by name rather than held across a precomp.
    function layerByName(comp, name) {
        for (var i = 1; i <= comp.numLayers; i += 1) {
            if (comp.layer(i).name === name) {
                return comp.layer(i);
            }
        }
        return null;
    }

    // After Effects ships this enum with a typo — guard both spellings.
    function silhouetteAlpha() {
        if (typeof BlendingMode.SILHOUETTE_ALPHA !== "undefined") {
            return BlendingMode.SILHOUETTE_ALPHA;
        }
        return BlendingMode.SILHOUETE_ALPHA;
    }

    // ---------------------------------------------------------------------
    // Build
    // ---------------------------------------------------------------------

    function buildLiquidGlass(cfg) {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) {
            alert("Open a composition and select the layer you want turned into glass.");
            return;
        }

        var q = QUALITY[cfg.quality] || QUALITY.Standard;

        // Checked up front, on a throwaway comp, so a missing Cycore install
        // never leaves a half assembled rig behind.
        if (!hasCCGlass()) {
            alert(
                "CC Glass is not available in this After Effects install.\n" +
                "It ships with AE as part of Cycore FX HD — reinstall or enable it, " +
                "then run the script again."
            );
            return;
        }

        app.beginUndoGroup(SCRIPT_NAME);
        try {
            var rig = nextRigIndex(comp);
            var P = "LG" + rig + " ";
            var i;

            // Every pixel-denominated control is authored against 1080p and scaled
            // here, so the same slider values read identically at 720p or 4K.
            var S = Math.min(comp.width, comp.height) / 1080;
            var SS = S.toFixed(4);

            function newComp(name) {
                return app.project.items.addComp(
                    name, comp.width, comp.height, comp.pixelAspect, comp.duration, comp.frameRate
                );
            }

            // Preamble every rig expression opens with. The sliders live in their
            // own comp so that the refraction and mask passes, which are nested one
            // level down, can reach them by comp name — a thisComp reference would
            // resolve to the wrong comp down there.
            var C = 'var C = comp("' + P + 'Controls").layer("Controls");\n';

            // Layer pickers store an index, which goes stale the moment anyone
            // reorders the stack. Driving them by name survives edits.
            function layerRef(name) {
                return 'thisComp.layer("' + name + '").index;';
            }

            // --- 1. the form --------------------------------------------------
            var selected = comp.selectedLayers;
            var formLayers = [];
            for (i = 0; i < selected.length; i += 1) {
                formLayers.push(selected[i]);
            }
            if (formLayers.length === 0) {
                formLayers.push(
                    createSquircleLayer(comp, P + "Form", cfg.sizeRatio, cfg.squareness, q.samples)
                );
            }

            // Measured before precomposing, while the form still carries its own
            // transform — afterwards it is a full-frame precomp and the box is lost.
            var box = unionBounds(formLayers, comp);
            var center = [box.left + box.width / 2, box.top + box.height / 2];

            var formIndexes = [];
            for (i = 0; i < formLayers.length; i += 1) {
                formIndexes.push(formLayers[i].index);
            }

            // Precomposing normalises the form: effects, masks and transforms are
            // all baked, so every downstream effect samples the same silhouette.
            var shapeComp = comp.layers.precompose(formIndexes, P + "Shape", true);
            var shapeLayer = layerByName(comp, P + "Shape");

            // The rig's own transform, inside the form comp rather than on the
            // layer in the main comp. Effects that reference a layer read its
            // source and ignore its transform, so this is the only place a move
            // actually propagates to the refraction, the mattes and the rim.
            for (i = 1; i <= shapeComp.numLayers; i += 1) {
                var gx = addEffect(shapeComp.layer(i), ["ADBE Geometry2"], "Glass Transform");
                if (!gx) {
                    continue;
                }
                setParam(gx, ["Anchor Point"], center);
                bind(gx, ["Position"], center, C + 'C.effect("Glass Position")("Point");');
                setParam(gx, ["Uniform Scale"], true);
                bind(gx, ["Scale Height", "Scale"], 100,
                    C + 'C.effect("Glass Scale")("Slider");');
                bind(gx, ["Rotation"], 0, C + 'C.effect("Glass Rotation")("Angle");');
            }

            if (cfg.wobble) {
                var turb = addEffect(shapeComp.layer(1), ["ADBE Turbulent Displace"], "Liquid Wobble");
                if (turb) {
                    setParam(turb, ["Amount"], 18);
                    setParam(turb, ["Size"], 90);
                    setParam(turb, ["Complexity"], 1.5);
                    setExpr(turb, ["Evolution"], "time * 45;");
                }
            }

            // --- 2. what the glass refracts -----------------------------------
            // Everything under the form, minus the working parts of any glass rig
            // already in this comp. Without that exclusion a second rig would
            // swallow the first one into its backdrop precomp.
            var RIG_PART = /^LG\d+ (Controls|Glass|Core|Sheen|Rim Light|Rim Mask|Core Mask|Shape|Refract [RGB])$/;
            var belowIndexes = [];
            for (i = shapeLayer.index + 1; i <= comp.numLayers; i += 1) {
                if (!RIG_PART.test(comp.layer(i).name)) {
                    belowIndexes.push(i);
                }
            }

            if (belowIndexes.length === 0 && cfg.demoBackdrop) {
                var demo = addSolid(comp, [0.05, 0.05, 0.07], P + "Demo Backdrop");
                var demoFx = addEffect(demo, ["ADBE 4ColorGradient"], "Backdrop Gradient");
                if (demoFx) {
                    var demoColors = [
                        [0.98, 0.36, 0.12], [0.20, 0.40, 0.98],
                        [0.92, 0.16, 0.55], [0.10, 0.86, 0.72]
                    ];
                    var demoPoints = [
                        [comp.width * 0.15, comp.height * 0.15],
                        [comp.width * 0.85, comp.height * 0.2],
                        [comp.width * 0.2, comp.height * 0.85],
                        [comp.width * 0.85, comp.height * 0.85]
                    ];
                    for (i = 0; i < 4; i += 1) {
                        setParam(demoFx, ["Point " + (i + 1)], demoPoints[i]);
                        setParam(demoFx, ["Color " + (i + 1)], demoColors[i]);
                    }
                    setParam(demoFx, ["Blend"], 200);
                    setParam(demoFx, ["Jitter"], 0);
                }
                demo.moveToEnd();
                belowIndexes = [demo.index];
            }

            // Always precomposed, even for a single layer: the refraction passes
            // need the backdrop as a *source*, and this guarantees they all sample
            // exactly the frame the viewer sees.
            var backdropComp = null;
            if (belowIndexes.length > 0) {
                backdropComp = comp.layers.precompose(belowIndexes, P + "Backdrop", true);
                shapeLayer = layerByName(comp, P + "Shape");
            }

            // --- 3. controls ----------------------------------------------------
            var ctrlComp = newComp(P + "Controls");
            var ctrlNull = ctrlComp.layers.addNull(comp.duration);
            ctrlNull.name = "Controls";
            var ctrlParade = ctrlNull.property("ADBE Effect Parade");

            /**
             * Controls are declared as data so the set stays readable and the UI,
             * the presets and the expressions all agree on one list of names.
             * kind picks the control type; everything downstream refers to these
             * names, never to an index.
             */
            var CONTROLS = [
                ["Refraction",         "slider",   cfg.refraction],
                ["Refraction Scale",   "slider",   cfg.refractScale],
                ["Curvature",          "slider",   cfg.curvature],
                ["Edge Width",         "slider",   cfg.edgeWidth],
                ["Dispersion",         "slider",   cfg.dispersion],
                ["Dispersion Edge",    "slider",   cfg.dispersionEdge],
                ["Dispersion Blur",    "slider",   cfg.dispersionBlur],
                ["Frost",              "slider",   cfg.frost],
                ["Glass Opacity",      "slider",   cfg.glassOpacity],
                ["Tint",               "slider",   cfg.tint],
                ["Tint Color",         "color",    cfg.tintColor],
                ["Rim",                "slider",   cfg.rim],
                ["Rim Width",          "slider",   cfg.rimWidth],
                ["Rim Softness",       "slider",   cfg.rimSoftness],
                ["Light Angle",        "angle",    cfg.lightAngle],
                ["Light Color",        "color",    cfg.lightColor],
                ["Highlight Distance", "slider",   cfg.highlightDistance],
                ["Shadow",             "slider",   cfg.shadow],
                ["Shadow Distance",    "slider",   cfg.shadowDistance],
                ["Shadow Softness",    "slider",   cfg.shadowSoftness],
                ["Glass Position",     "point",    center],
                ["Glass Scale",        "slider",   100],
                ["Glass Rotation",     "angle",    0]
            ];

            var CONTROL_KINDS = {
                slider: ["ADBE Slider Control", "Slider"],
                angle:  ["ADBE Angle Control", "Angle"],
                color:  ["ADBE Color Control", "Color"],
                point:  ["ADBE Point Control", "Point"]
            };

            for (i = 0; i < CONTROLS.length; i += 1) {
                var kind = CONTROL_KINDS[CONTROLS[i][1]];
                var ctl = ctrlParade.addProperty(kind[0]);
                ctl.name = CONTROLS[i][0];
                try {
                    ctl.property(kind[1]).setValue(CONTROLS[i][2]);
                } catch (e) {
                    // A control type this AE build words differently — the default
                    // stands and the parameter is still there to drive by hand.
                }
            }

            var ctrlLayer = comp.layers.add(ctrlComp);
            ctrlLayer.name = P + "Controls";
            ctrlLayer.guideLayer = true;
            ctrlLayer.enabled = false;

            /**
             * A point on the ellipse that circumscribes the glass, `offsetDeg` away
             * from the light direction. Every lighting gradient is pinned with
             * these, which is what keeps the highlight on the object when the
             * Glass Position, Glass Scale or Light Angle controls move.
             */
            function lightPoint(offsetDeg, reach) {
                return C +
                    'var p = C.effect("Glass Position")("Point");\n' +
                    'var s = C.effect("Glass Scale")("Slider") / 100;\n' +
                    'var d = 1 + C.effect("Highlight Distance")("Slider") / 100;\n' +
                    'var a = degreesToRadians(C.effect("Light Angle")("Angle") - 90 + ' + offsetDeg + ');\n' +
                    'var rx = ' + (box.width / 2).toFixed(2) + ' * s * d * ' + reach + ';\n' +
                    'var ry = ' + (box.height / 2).toFixed(2) + ' * s * d * ' + reach + ';\n' +
                    'p + [Math.cos(a) * rx, Math.sin(a) * ry];';
            }

            /**
             * Four corner gradient pinned to the light direction. Light in Apple's
             * glass is never flat — it peaks on the lit side and again, weakly, on
             * the far edge where the back surface catches it.
             */
            function addLightGradient(layer, colorExprs, blend, name) {
                var fx = addEffect(layer, ["ADBE 4ColorGradient"], name || "Gradient");
                if (!fx) {
                    return null;
                }
                var offsets = [0, 90, -90, 180];
                var reaches = [1.05, 1.02, 1.02, 1.05];
                for (var k = 0; k < 4; k += 1) {
                    setExpr(fx, ["Point " + (k + 1)], lightPoint(offsets[k], reaches[k]));
                    setExpr(fx, ["Color " + (k + 1)], colorExprs[k]);
                }
                setParam(fx, ["Blend"], blend === undefined ? 120 : blend);
                setParam(fx, ["Jitter"], 0);
                return fx;
            }

            // --- 4. refraction passes, one per colour channel --------------------
            // Blue bends hardest, red least. That spread is the dispersion, and it
            // is what sells the effect as glass rather than as blur. Each pass is
            // its own comp because effects that reference a layer read that layer's
            // source, not its effects — the bend has to be baked to be sampled.
            //
            // Draft quality builds the green pass only: no dispersion, a third of
            // the render, and every other part of the rig behaves identically.
            var refract = [];
            if (backdropComp) {
                var channels = q.dispersive
                    ? [{suffix: "R", skew: -1}, {suffix: "G", skew: 0}, {suffix: "B", skew: 1}]
                    : [{suffix: "G", skew: 0}];

                for (i = 0; i < channels.length; i += 1) {
                    var refComp = newComp(P + "Refract " + channels[i].suffix);
                    var plate = refComp.layers.add(backdropComp);
                    plate.name = "Backdrop";
                    var bump = refComp.layers.add(shapeComp);
                    bump.name = "Bump";
                    bump.enabled = false;

                    // Applied before CC Glass so the glass bends an already scaled
                    // plate — a real lens magnifies what is behind it, and this is
                    // the parameter that makes a slab read as thick.
                    var lens = addEffect(plate, ["ADBE Geometry2"], "Lens Scale");
                    if (lens) {
                        setParam(lens, ["Uniform Scale"], true);
                        bind(lens, ["Scale Height", "Scale"], cfg.refractScale,
                            C + 'C.effect("Refraction Scale")("Slider");');
                    }

                    var glassFx = addEffect(plate, ["CC Glass"], "Refraction");
                    if (!glassFx) {
                        throw new Error("CC Glass could not be applied to the refraction pass.");
                    }
                    bind(glassFx, ["Bump Map"], bump.index, 'thisComp.layer("Bump").index;');
                    setParam(glassFx, ["Property"], 4);   // read the form's alpha
                    setParam(glassFx, ["Light Intensity"], 55);
                    setParam(glassFx, ["Light Color"], [1, 1, 1]);
                    setParam(glassFx, ["Light Height"], 55);
                    setParam(glassFx, ["Light Direction"], 45);
                    // Ambient 100 / Diffuse 0 lets the backdrop through untouched,
                    // so the only thing CC Glass adds on top is the specular.
                    setParam(glassFx, ["Ambient"], 100);
                    setParam(glassFx, ["Diffuse"], 0);
                    setParam(glassFx, ["Specular"], cfg.specular);
                    setParam(glassFx, ["Roughness"], 0.012);
                    setParam(glassFx, ["Metal"], 0);

                    bind(glassFx, ["Displacement"], cfg.refraction * S,
                        C +
                        'var r = C.effect("Refraction")("Slider");\n' +
                        'var d = C.effect("Dispersion")("Slider") / 100;\n' +
                        'r * (1 + d * ' + channels[i].skew + ') * ' + SS + ';');
                    bind(glassFx, ["Softness"], cfg.edgeWidth * S,
                        C + 'C.effect("Edge Width")("Slider") * ' + SS + ';');
                    bind(glassFx, ["Height"], cfg.curvature,
                        C + 'C.effect("Curvature")("Slider");');
                    bind(glassFx, ["Light Direction"], cfg.lightAngle,
                        C + 'C.effect("Light Angle")("Angle");');

                    var refLayer = comp.layers.add(refComp);
                    refLayer.name = P + "Refract " + channels[i].suffix;
                    refLayer.enabled = false;
                    refLayer.shy = true;
                    refract.push(refLayer);
                }
            }

            // --- 5. mattes -------------------------------------------------------
            // Both are built off the form's alpha rather than off a shape path, so
            // the rig works on text, footage mattes and anything else with an edge.

            // The rim ring: the form with a choked copy punched out of it.
            var rimComp = newComp(P + "Rim Mask");
            rimComp.layers.add(shapeComp).name = "Rim Outer";
            var rimCore = rimComp.layers.add(shapeComp);
            rimCore.name = "Rim Inner";
            rimCore.moveToBeginning();
            var choker = addEffect(rimCore, ["ADBE Simple Choker"], "Rim Width");
            if (choker) {
                bind(choker, ["Choke Matte"], cfg.rimWidth * S,
                    C + 'C.effect("Rim Width")("Slider") * ' + SS + ';');
            }
            rimCore.blendingMode = silhouetteAlpha();

            var rimMask = comp.layers.add(rimComp);
            rimMask.name = P + "Rim Mask";
            rimMask.enabled = false;
            rimMask.shy = true;

            // The dispersion core: the form choked inward by Dispersion Edge and
            // feathered by Dispersion Blur. Whatever is matted to this covers the
            // middle of the glass, so the three-way colour split only survives in
            // the band around the rim — which is where dispersion actually lives.
            // Uniform dispersion across a whole slab is the tell of a fake.
            var coreMask = null;
            if (q.dispersive && refract.length === 3) {
                var coreComp = newComp(P + "Core Mask");
                var coreShape = coreComp.layers.add(shapeComp);
                coreShape.name = "Core";
                var coreChoke = addEffect(coreShape, ["ADBE Simple Choker"], "Edge Inset");
                if (coreChoke) {
                    bind(coreChoke, ["Choke Matte"], cfg.dispersionEdge * S,
                        C + 'C.effect("Dispersion Edge")("Slider") * ' + SS + ';');
                }
                var coreFeather = addEffect(coreShape, ["ADBE Box Blur2", "ADBE Gaussian Blur 2"], "Edge Blur");
                if (coreFeather) {
                    bind(coreFeather, ["Blur Radius", "Blurriness"], cfg.dispersionBlur * S,
                        C + 'C.effect("Dispersion Blur")("Slider") * ' + SS + ';');
                    setParam(coreFeather, ["Iterations"], q.iterations);
                }
                coreMask = comp.layers.add(coreComp);
                coreMask.name = P + "Core Mask";
                coreMask.enabled = false;
                coreMask.shy = true;
            }

            // --- 6. the glass body -------------------------------------------------
            // Glass and Core are the same chain built twice: identical frost, tint
            // and grain, differing only in which refraction passes feed the three
            // channels and which matte cuts them out. Keeping one code path is what
            // stops a visible seam appearing between them.
            function buildBody(name, sourceNames, matteName, withShadow) {
                var body = addSolid(comp, [0.5, 0.5, 0.5], name);

                if (sourceNames) {
                    // Recombine the passes into one image, one channel each.
                    var merge = addEffect(body, ["ADBE Set Channels"], "Dispersion Merge");
                    // source picker, "take this channel from it", which channel
                    var wiring = [
                        ["ADBE Set Channels-0001", "ADBE Set Channels-0002", 1],
                        ["ADBE Set Channels-0003", "ADBE Set Channels-0004", 2],
                        ["ADBE Set Channels-0005", "ADBE Set Channels-0006", 3]
                    ];
                    for (var k = 0; k < wiring.length; k += 1) {
                        var src = sourceNames[k];
                        var srcLayer = layerByName(comp, src);
                        bind(merge, [wiring[k][0]], srcLayer ? srcLayer.index : 1, layerRef(src));
                        setParam(merge, [wiring[k][1]], wiring[k][2]);
                    }
                    setParam(merge, ["ADBE Set Channels-0008"], 9); // alpha: Full On

                    // Frost while the frame is still full width, so the blur pulls
                    // in real backdrop pixels instead of smearing the silhouette
                    // inward.
                    var blur = addEffect(body, ["ADBE Box Blur2", "ADBE Gaussian Blur 2"], "Frost");
                    if (blur) {
                        bind(blur, ["Blur Radius", "Blurriness"], cfg.frost * S,
                            C + 'C.effect("Frost")("Slider") * ' + SS + ';');
                        setParam(blur, ["Iterations"], q.iterations);
                        setParam(blur, ["Repeat Edge Pixels"], true);
                    }

                    var vib = addEffect(body, ["ADBE Vibrance"], "Glass Saturation");
                    if (vib) {
                        setParam(vib, ["Vibrance"], 18);
                        setParam(vib, ["Saturation"], 6);
                    }
                } else {
                    // Nothing underneath to bend — fall back to a milky pane.
                    body.property("Transform").property("Opacity").setValue(16);
                }

                setMatte(body, layerByName(comp, matteName) || shapeLayer, "Body Matte",
                    layerRef(matteName));

                if (q.grain) {
                    var grain = addEffect(body, ["ADBE Noise"], "Micro Grain");
                    if (grain) {
                        setParam(grain, ["Amount of Noise"], 1.2);
                        setParam(grain, ["ADBE Noise-0002"], false); // monochrome grain
                        setParam(grain, ["ADBE Noise-0003"], true);  // clip result values
                    }
                }

                if (withShadow) {
                    var shadow = addEffect(body, ["ADBE Drop Shadow"], "Contact Shadow");
                    if (shadow) {
                        setParam(shadow, ["Shadow Color"], [0, 0, 0]);
                        bind(shadow, ["Opacity"], Math.round(255 * (cfg.shadow / 100)),
                            C + '255 * C.effect("Shadow")("Slider") / 100;');
                        // The shadow falls away from the light, so one control
                        // drives the rim, the sheen and the contact shadow together.
                        bind(shadow, ["Direction"], 180,
                            C + '(C.effect("Light Angle")("Angle") + 180) % 360;');
                        bind(shadow, ["Distance"], cfg.shadowDistance * S,
                            C + 'C.effect("Shadow Distance")("Slider") * ' + SS + ';');
                        bind(shadow, ["Softness"], cfg.shadowSoftness * S,
                            C + 'C.effect("Shadow Softness")("Slider") * ' + SS + ';');
                    }
                }

                if (sourceNames) {
                    body.property("Transform").property("Opacity").expression =
                        C + 'C.effect("Glass Opacity")("Slider");';
                }
                return body;
            }

            var names = [];
            for (i = 0; i < refract.length; i += 1) {
                names.push(refract[i].name);
            }
            var monoName = names.length === 3 ? names[1] : names[0];

            var glass = buildBody(
                P + "Glass",
                names.length ? (names.length === 3 ? names : [monoName, monoName, monoName]) : null,
                P + "Shape",
                true
            );

            var core = null;
            if (coreMask) {
                core = buildBody(P + "Core", [monoName, monoName, monoName], P + "Core Mask", false);
            }

            // --- 7. inner sheen -------------------------------------------------
            var sheen = addSolid(comp, [0, 0, 0], P + "Sheen");
            addLightGradient(sheen, [
                C + 'C.effect("Light Color")("Color");',
                C + 'var t = C.effect("Tint Color")("Color"); [t[0], t[1], t[2], 1];',
                C + 'var t = C.effect("Tint Color")("Color"); [t[0] * 0.35, t[1] * 0.35, t[2] * 0.35, 1];',
                '[0.03, 0.03, 0.05, 1];'
            ], 160, "Sheen Gradient");
            setMatte(sheen, shapeLayer, "Sheen Matte", layerRef(P + "Shape"));
            sheen.blendingMode = BlendingMode.SCREEN;
            sheen.property("Transform").property("Opacity").setValue(cfg.tint);
            sheen.property("Transform").property("Opacity").expression =
                C + 'C.effect("Tint")("Slider");';

            // --- 8. specular rim -------------------------------------------------
            var rimLight = addSolid(comp, [0, 0, 0], P + "Rim Light");
            // The rim never goes fully dark — a glass edge always catches some
            // light, and a ring that vanishes on two sides reads as a sticker.
            var floor = cfg.rimFloor;
            var floorExpr = '[' + (floor * 0.8).toFixed(3) + ', ' + (floor * 0.85).toFixed(3) +
                ', ' + floor.toFixed(3) + ', 1];';
            addLightGradient(rimLight, [
                C + 'C.effect("Light Color")("Color");',
                floorExpr,
                floorExpr,
                C + 'var l = C.effect("Light Color")("Color"); [l[0] * 0.9, l[1] * 0.93, l[2], 1];'
            ], 90, "Rim Gradient");
            setMatte(rimLight, rimMask, "Rim Matte", layerRef(P + "Rim Mask"));
            var rimSoft = addEffect(rimLight, ["ADBE Box Blur2", "ADBE Gaussian Blur 2"], "Rim Softness");
            if (rimSoft) {
                bind(rimSoft, ["Blur Radius", "Blurriness"], cfg.rimSoftness * S,
                    C + 'C.effect("Rim Softness")("Slider") * ' + SS + ';');
                setParam(rimSoft, ["Iterations"], Math.max(1, q.iterations - 1));
            }
            rimLight.blendingMode = BlendingMode.ADD;
            rimLight.property("Transform").property("Opacity").setValue(cfg.rim);
            rimLight.property("Transform").property("Opacity").expression =
                C + 'C.effect("Rim")("Slider");';

            // --- 9. stack ---------------------------------------------------------
            shapeLayer.enabled = false;
            shapeLayer.shy = true;

            var order = [ctrlLayer, rimLight, sheen];
            if (core) {
                order.push(core);
            }
            order.push(glass);
            for (i = refract.length - 1; i >= 0; i -= 1) {
                order.push(refract[i]);
            }
            order.push(rimMask);
            if (coreMask) {
                order.push(coreMask);
            }
            order.push(shapeLayer);
            for (i = order.length - 2; i >= 0; i -= 1) {
                order[i].moveBefore(order[i + 1]);
            }

            // The expressions above already track these by name; the static values
            // are the fallback for AE builds that refuse an expression on a layer
            // picker, so they are refreshed once the stack is final.
            function rebindLayerParam(host, effectName, paramName, target) {
                if (!host || !target) {
                    return;
                }
                var fx = host.property("ADBE Effect Parade").property(effectName);
                if (fx) {
                    setParam(fx, [paramName], target.index);
                }
            }
            if (refract.length === 3) {
                var gm = glass.property("ADBE Effect Parade").property("Dispersion Merge");
                setParam(gm, ["ADBE Set Channels-0001"], refract[0].index);
                setParam(gm, ["ADBE Set Channels-0003"], refract[1].index);
                setParam(gm, ["ADBE Set Channels-0005"], refract[2].index);
            }
            if (core && refract.length) {
                var cm = core.property("ADBE Effect Parade").property("Dispersion Merge");
                var mono = refract.length === 3 ? refract[1] : refract[0];
                setParam(cm, ["ADBE Set Channels-0001"], mono.index);
                setParam(cm, ["ADBE Set Channels-0003"], mono.index);
                setParam(cm, ["ADBE Set Channels-0005"], mono.index);
            }
            rebindLayerParam(glass, "Body Matte", "ADBE Set Matte3-0001", shapeLayer);
            rebindLayerParam(core, "Body Matte", "ADBE Set Matte3-0001", coreMask);
            rebindLayerParam(sheen, "Sheen Matte", "ADBE Set Matte3-0001", shapeLayer);
            rebindLayerParam(rimLight, "Rim Matte", "ADBE Set Matte3-0001", rimMask);

            for (i = 1; i <= comp.numLayers; i += 1) {
                comp.layer(i).selected = false;
            }
            ctrlLayer.selected = true;
            comp.openInViewer();
        } catch (err) {
            alert(SCRIPT_NAME + " failed:\n" + err.toString() + "\nLine " + (err.line || "?"));
        } finally {
            app.endUndoGroup();
        }
    }

    // ---------------------------------------------------------------------
    // UI
    // ---------------------------------------------------------------------

    /** The launch settings survive between sessions — the rig is usually built
     *  a dozen times in a row while a look is being dialled in. */
    function saveSettings(values) {
        try {
            var parts = [];
            for (var key in values) {
                if (values.hasOwnProperty(key)) {
                    parts.push(key + "=" + values[key]);
                }
            }
            app.settings.saveSetting(SETTINGS_KEY, "last", parts.join("|"));
        } catch (e) {
            // Preferences are read-only in some managed installs — not fatal.
        }
    }

    function loadSettings() {
        var out = {};
        try {
            if (!app.settings.haveSetting(SETTINGS_KEY, "last")) {
                return out;
            }
            var parts = app.settings.getSetting(SETTINGS_KEY, "last").split("|");
            for (var i = 0; i < parts.length; i += 1) {
                var eq = parts[i].indexOf("=");
                if (eq > 0) {
                    out[parts[i].substring(0, eq)] = parts[i].substring(eq + 1);
                }
            }
        } catch (e) {
            // Fall back to the defaults.
        }
        return out;
    }

    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, {resizeable: true});
        if (!pal) {
            return pal;
        }

        var saved = loadSettings();

        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 6;
        pal.margins = 12;

        function addEditRow(parent, label, defaultValue, key) {
            var group = parent.add("group");
            group.orientation = "row";
            group.alignChildren = ["left", "center"];
            group.spacing = 6;
            var st = group.add("statictext", undefined, label);
            st.preferredSize.width = 112;
            var et = group.add("edittext", undefined,
                (saved[key] !== undefined ? saved[key] : defaultValue).toString());
            et.characters = 6;
            return et;
        }

        /** A swatch button backed by ExtendScript's system colour picker, with the
         *  hex string kept alongside so the value survives a session. */
        function addColorRow(parent, label, defaultRGB, key) {
            var group = parent.add("group");
            group.orientation = "row";
            group.alignChildren = ["left", "center"];
            group.spacing = 6;
            var st = group.add("statictext", undefined, label);
            st.preferredSize.width = 112;
            var field = group.add("edittext", undefined, "");
            field.characters = 8;
            var btn = group.add("button", undefined, "Pick");
            btn.preferredSize.width = 44;

            function toHex(rgb) {
                var s = "";
                for (var i = 0; i < 3; i += 1) {
                    var v = Math.round(Math.max(0, Math.min(1, rgb[i])) * 255).toString(16);
                    s += (v.length === 1 ? "0" : "") + v;
                }
                return s.toUpperCase();
            }

            field.text = saved[key] !== undefined ? saved[key] : toHex(defaultRGB);

            field.value = function () {
                var hex = field.text.replace(/[^0-9a-fA-F]/g, "");
                if (hex.length !== 6) {
                    return defaultRGB;
                }
                return [
                    parseInt(hex.substring(0, 2), 16) / 255,
                    parseInt(hex.substring(2, 4), 16) / 255,
                    parseInt(hex.substring(4, 6), 16) / 255
                ];
            };

            btn.onClick = function () {
                var rgb = field.value();
                var start = (Math.round(rgb[0] * 255) << 16) |
                            (Math.round(rgb[1] * 255) << 8) |
                            Math.round(rgb[2] * 255);
                var picked = $.colorPicker(start);
                if (picked >= 0) {
                    field.text = toHex([
                        ((picked >> 16) & 255) / 255,
                        ((picked >> 8) & 255) / 255,
                        (picked & 255) / 255
                    ]);
                }
            };
            return field;
        }

        function num(field, fallback) {
            var value = parseFloat(field.text);
            return isNaN(value) ? fallback : value;
        }

        var headGroup = pal.add("group");
        headGroup.orientation = "row";
        headGroup.add("statictext", undefined, "Preset").preferredSize.width = 112;
        var presetList = headGroup.add("dropdownlist", undefined, PRESET_ORDER);
        presetList.selection = 0;

        var qGroup = pal.add("group");
        qGroup.orientation = "row";
        qGroup.add("statictext", undefined, "Quality").preferredSize.width = 112;
        var qualityList = qGroup.add("dropdownlist", undefined, QUALITY_ORDER);
        var savedQuality = indexIn(QUALITY_ORDER, saved.quality || "High");
        qualityList.selection = savedQuality >= 0 ? savedQuality : 2;

        var lookPanel = pal.add("panel", undefined, "Glass");
        lookPanel.orientation = "column";
        lookPanel.alignChildren = ["fill", "top"];
        lookPanel.margins = 10;
        lookPanel.spacing = 4;

        var fRefraction = addEditRow(lookPanel, "Refraction", 120, "refraction");
        var fRefractScale = addEditRow(lookPanel, "Refraction scale %", 100, "refractScale");
        var fCurve = addEditRow(lookPanel, "Curvature", 50, "curvature");
        var fEdge = addEditRow(lookPanel, "Edge width", 45, "edgeWidth");
        var fFrost = addEditRow(lookPanel, "Frost", 8, "frost");
        var fOpacity = addEditRow(lookPanel, "Glass opacity %", 100, "glassOpacity");
        var fTint = addEditRow(lookPanel, "Tint", 15, "tint");
        var fTintColor = addColorRow(lookPanel, "Tint colour", [0.55, 0.75, 1.0], "tintColor");

        var caPanel = pal.add("panel", undefined, "Chromatic dispersion");
        caPanel.orientation = "column";
        caPanel.alignChildren = ["fill", "top"];
        caPanel.margins = 10;
        caPanel.spacing = 4;
        var fDispersion = addEditRow(caPanel, "Amount", 22, "dispersion");
        var fDispEdge = addEditRow(caPanel, "Edge reach px", 60, "dispersionEdge");
        var fDispBlur = addEditRow(caPanel, "Edge blur px", 12, "dispersionBlur");

        var lightPanel = pal.add("panel", undefined, "Light and shadow");
        lightPanel.orientation = "column";
        lightPanel.alignChildren = ["fill", "top"];
        lightPanel.margins = 10;
        lightPanel.spacing = 4;
        var fRim = addEditRow(lightPanel, "Rim", 100, "rim");
        var fRimWidth = addEditRow(lightPanel, "Rim width px", 4, "rimWidth");
        var fLightAngle = addEditRow(lightPanel, "Light angle", 315, "lightAngle");
        var fLightColor = addColorRow(lightPanel, "Light colour", [1, 1, 1], "lightColor");
        var fHighlight = addEditRow(lightPanel, "Highlight distance", 0, "highlightDistance");
        var fShadow = addEditRow(lightPanel, "Shadow", 38, "shadow");
        var fShadowDist = addEditRow(lightPanel, "Shadow distance", 14, "shadowDistance");
        var fShadowSoft = addEditRow(lightPanel, "Shadow softness", 70, "shadowSoftness");

        var formPanel = pal.add("panel", undefined, "Generated form (no selection)");
        formPanel.orientation = "column";
        formPanel.alignChildren = ["fill", "top"];
        formPanel.margins = 10;
        formPanel.spacing = 4;
        var fSize = addEditRow(formPanel, "Size %", 34, "sizeRatio");
        var fSquare = addEditRow(formPanel, "Squircle n", 5, "squareness");

        var optGroup = pal.add("group");
        optGroup.orientation = "column";
        optGroup.alignChildren = ["left", "top"];
        var cbWobble = optGroup.add("checkbox", undefined, "Liquid wobble (animated edge)");
        cbWobble.value = saved.wobble === "true";
        var cbDemo = optGroup.add("checkbox", undefined, "Add demo backdrop when nothing is below");
        cbDemo.value = saved.demoBackdrop !== "false";

        function applyPreset() {
            var p = PRESETS[presetList.selection.text];
            fRefraction.text = p.refraction;
            fRefractScale.text = p.refractScale;
            fDispersion.text = p.dispersion;
            fDispEdge.text = p.dispersionEdge;
            fEdge.text = p.edgeWidth;
            fCurve.text = p.curvature;
            fFrost.text = p.frost;
            fOpacity.text = p.glassOpacity;
            fRim.text = p.rim;
            fTint.text = p.tint;
            fShadow.text = p.shadow;
        }
        presetList.onChange = applyPreset;

        var runBtn = pal.add("button", undefined, "Create Liquid Glass");
        runBtn.onClick = function () {
            var cfg = {
                quality: qualityList.selection.text,
                refraction: num(fRefraction, 120),
                refractScale: num(fRefractScale, 100),
                dispersion: num(fDispersion, 22),
                dispersionEdge: num(fDispEdge, 60),
                dispersionBlur: num(fDispBlur, 12),
                edgeWidth: num(fEdge, 45),
                curvature: num(fCurve, 50),
                frost: num(fFrost, 8),
                glassOpacity: num(fOpacity, 100),
                rim: num(fRim, 100),
                tint: num(fTint, 15),
                shadow: num(fShadow, 38),
                shadowDistance: num(fShadowDist, 14),
                shadowSoftness: num(fShadowSoft, 70),
                rimWidth: num(fRimWidth, 4),
                rimSoftness: Math.max(0.5, num(fRimWidth, 4) * 0.35),
                rimFloor: 0.30,
                specular: 30,
                lightAngle: num(fLightAngle, 315),
                highlightDistance: num(fHighlight, 0),
                tintColor: fTintColor.value(),
                lightColor: fLightColor.value(),
                sizeRatio: num(fSize, 34) / 100,
                squareness: Math.max(2, num(fSquare, 5)),
                wobble: cbWobble.value,
                demoBackdrop: cbDemo.value
            };

            saveSettings({
                quality: cfg.quality,
                refraction: cfg.refraction,
                refractScale: cfg.refractScale,
                dispersion: cfg.dispersion,
                dispersionEdge: cfg.dispersionEdge,
                dispersionBlur: cfg.dispersionBlur,
                edgeWidth: cfg.edgeWidth,
                curvature: cfg.curvature,
                frost: cfg.frost,
                glassOpacity: cfg.glassOpacity,
                rim: cfg.rim,
                rimWidth: cfg.rimWidth,
                lightAngle: cfg.lightAngle,
                highlightDistance: cfg.highlightDistance,
                shadow: cfg.shadow,
                shadowDistance: cfg.shadowDistance,
                shadowSoftness: cfg.shadowSoftness,
                tint: cfg.tint,
                tintColor: fTintColor.text,
                lightColor: fLightColor.text,
                sizeRatio: num(fSize, 34),
                squareness: num(fSquare, 5),
                wobble: cbWobble.value,
                demoBackdrop: cbDemo.value
            });

            buildLiquidGlass(cfg);
        };

        var hint = pal.add("statictext", undefined,
            "Select one or more layers, then Create. Nothing selected builds a\n" +
            "squircle. Afterwards: open the \"LGn Controls\" comp and select the\n" +
            "null — every parameter is live, including Glass Position, Scale and\n" +
            "Rotation, which move the whole rig. Draft quality skips dispersion\n" +
            "for fast scrubbing.", {multiline: true});
        hint.preferredSize.height = 74;

        return pal;
    }

    var palette = buildUI(thisObj);
    if (palette instanceof Window) {
        palette.center();
        palette.show();
    } else if (palette) {
        palette.layout.layout(true);
    }
})(this);
