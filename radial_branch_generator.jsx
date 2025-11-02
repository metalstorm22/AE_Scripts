/**
 * Radial Branch Generator
 * Creates a branching radial structure of circles and connecting lines inside the current or a new composition.
 * The UI lets you control the number of spokes, levels, branching factor, spacing, and randomisation.
 */
(function radialBranchGenerator(thisObj) {
    var SCRIPT_NAME = "Radial Branch Generator";

    var DEFAULTS = {
        initialLines: 12,
        levels: 3,
        childrenPerNode: 2,
        baseRadius: 250,
        radiusStep: 180,
        radiusJitter: 40,
        angleJitter: 8,
        branchSpread: 60,
        circleSize: 26,
        lineWidth: 4,
        seed: 12345,
        useActiveComp: true,
        compName: "Radial Branching",
        compWidth: 1920,
        compHeight: 1080,
        compDuration: 10,
        compFrameRate: 24,
        circleFill: [0.137, 0.2, 0.345, 1],
        circleStroke: [0.835, 0.894, 1, 1],
        lineColor: [0.835, 0.894, 1, 1],
        make3D: false,
        simultaneousRoot: false,
        lineDuration: 0.35,
        nodeDuration: 0.22,
        childStagger: 0.05,
        randomOffset: 0.06,
        smoothFlow: true,
        useCurves: false,
        curveTension: 0.45,
        curveRandomness: 0.35
    };

    var ANIMATION_DEFAULTS = {
        lineDuration: 0.6,
        nodeDuration: 0.3,
        childStagger: 0.08
    };

    var CONTROL_NAMES = {
        layer: "RB_Animation_Control",
        progress: "RB Progress",
        curvesEnabled: "Organic Curves",
        curveTension: "Curve Tension",
        curveRandomness: "Curve Randomness"
    };

    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel) ? thisObj : new Window("palette", SCRIPT_NAME, undefined, {resizeable: true});
        if (!pal) {
            return pal;
        }

        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 6;
        pal.margins = 12;

        function addEditRow(parent, label, defaultValue, chars) {
            var group = parent.add("group");
            group.orientation = "row";
            group.alignChildren = ["left", "center"];
            group.spacing = 6;
            var st = group.add("statictext", undefined, label);
            st.preferredSize.width = 150;
            var et = group.add("edittext", undefined, defaultValue.toString());
            et.characters = chars || 6;
            return et;
        }

        function addCheckbox(parent, label, value) {
            var cb = parent.add("checkbox", undefined, label);
            cb.value = value;
            return cb;
        }

        function clamp01(value) {
            return Math.max(0, Math.min(1, value));
        }

        function formatColor(color) {
            var cols = color.slice(0, 4);
            if (cols.length < 4) {
                cols.push(1);
            }
            for (var i = 0; i < cols.length; i++) {
                cols[i] = clamp01(cols[i]);
            }
            return cols.map(function (c) {
                return c.toFixed(3);
            }).join(", ");
        }

        function parseColor(text, fallback) {
            var out = fallback.slice ? fallback.slice() : [fallback];
            var parts = text.split(/[, ]+/);
            var idx = 0;
            for (var i = 0; i < parts.length && idx < 4; i++) {
                var token = parts[i];
                if (!token.length) {
                    continue;
                }
                var val = parseFloat(token);
                if (isNaN(val)) {
                    continue;
                }
                if (val > 1.0) {
                    val = Math.max(0, Math.min(255, val)) / 255;
                }
                out[idx] = clamp01(val);
                idx++;
            }
            while (out.length < 4) {
                out.push(idx === 3 ? 1 : fallback[out.length] || 1);
            }
            return out.slice(0, 4);
        }

        function rgbArrayToHex(color) {
            var r = Math.round(clamp01(color[0]) * 255);
            var g = Math.round(clamp01(color[1]) * 255);
            var b = Math.round(clamp01(color[2]) * 255);
            return (r << 16) | (g << 8) | b;
        }

        function hexToRgb(hex) {
            return [
                ((hex >> 16) & 0xFF) / 255,
                ((hex >> 8) & 0xFF) / 255,
                (hex & 0xFF) / 255
            ];
        }

        function addColorRow(parent, label, defaultValue) {
            var group = parent.add("group");
            group.orientation = "row";
            group.alignChildren = ["left", "center"];
            group.spacing = 6;
            var st = group.add("statictext", undefined, label);
            st.preferredSize.width = 150;
            var et = group.add("edittext", undefined, formatColor(defaultValue));
            et.characters = 22;
            var pickBtn = group.add("button", undefined, "Pick");
            pickBtn.onClick = function () {
                var current = parseColor(et.text, defaultValue);
                if (typeof $.colorPicker === "function") {
                    var picked = $.colorPicker(rgbArrayToHex(current));
                    if (picked >= 0) {
                        var rgb = hexToRgb(picked);
                        current[0] = rgb[0];
                        current[1] = rgb[1];
                        current[2] = rgb[2];
                        et.text = formatColor(current);
                    }
                } else {
                    alert("Color picker unavailable. Enter RGB(A) values manually.");
                }
            };
            return et;
        }

        var settingsPanel = pal.add("panel", undefined, "Structure");
        settingsPanel.orientation = "column";
        settingsPanel.alignChildren = ["fill", "top"];
        settingsPanel.spacing = 4;
        settingsPanel.margins = 10;

        var initialLinesEt = addEditRow(settingsPanel, "Initial spokes", DEFAULTS.initialLines, 5);
        var levelsEt = addEditRow(settingsPanel, "Levels", DEFAULTS.levels, 4);
        var childrenEt = addEditRow(settingsPanel, "Children per circle", DEFAULTS.childrenPerNode, 4);
        var baseRadiusEt = addEditRow(settingsPanel, "Base radius (px)", DEFAULTS.baseRadius, 6);
        var radiusStepEt = addEditRow(settingsPanel, "Radius step (px)", DEFAULTS.radiusStep, 6);
        var radiusJitterEt = addEditRow(settingsPanel, "Radius jitter (px)", DEFAULTS.radiusJitter, 6);
        var angleJitterEt = addEditRow(settingsPanel, "Angle jitter (deg)", DEFAULTS.angleJitter, 6);
        var branchSpreadEt = addEditRow(settingsPanel, "Branch spread (deg)", DEFAULTS.branchSpread, 6);
        var circleSizeEt = addEditRow(settingsPanel, "Circle diameter (px)", DEFAULTS.circleSize, 6);
        var lineWidthEt = addEditRow(settingsPanel, "Line width (px)", DEFAULTS.lineWidth, 5);
        var lineDurationEt = addEditRow(settingsPanel, "Line anim duration (s)", DEFAULTS.lineDuration, 5);
        var nodeDurationEt = addEditRow(settingsPanel, "Node anim duration (s)", DEFAULTS.nodeDuration, 5);
        var childStaggerEt = addEditRow(settingsPanel, "Child stagger (s)", DEFAULTS.childStagger, 5);
        var randomOffsetEt = addEditRow(settingsPanel, "Random offset (s)", DEFAULTS.randomOffset, 5);
        var curveTensionEt = addEditRow(settingsPanel, "Curve tension (0-1)", DEFAULTS.curveTension, 5);
        var curveRandomnessEt = addEditRow(settingsPanel, "Curve randomness (0-1)", DEFAULTS.curveRandomness, 5);
        var seedEt = addEditRow(settingsPanel, "Random seed", DEFAULTS.seed, 7);
        var make3DCb = addCheckbox(settingsPanel, "Create 3D layers", DEFAULTS.make3D);
        var simultaneousRootCb = addCheckbox(settingsPanel, "Animate first ring simultaneously", DEFAULTS.simultaneousRoot);
        var smoothFlowCb = addCheckbox(settingsPanel, "Smooth continuous flow", DEFAULTS.smoothFlow);
        var useCurvesCb = addCheckbox(settingsPanel, "Organic curved branches", DEFAULTS.useCurves);

        var compPanel = pal.add("panel", undefined, "Composition");
        compPanel.orientation = "column";
        compPanel.alignChildren = ["fill", "top"];
        compPanel.spacing = 4;
        compPanel.margins = 10;

        var useActiveCompCb = addCheckbox(compPanel, "Use active composition (if available)", DEFAULTS.useActiveComp);
        var compNameEt = addEditRow(compPanel, "New comp name", DEFAULTS.compName, 16);
        var compSizeGroup = compPanel.add("group");
        compSizeGroup.orientation = "row";
        compSizeGroup.spacing = 6;
        compSizeGroup.alignChildren = ["left", "center"];
        var compWidthEt = compSizeGroup.add("edittext", undefined, DEFAULTS.compWidth.toString());
        compWidthEt.characters = 7;
        var xLabel = compSizeGroup.add("statictext", undefined, "x");
        xLabel.preferredSize.width = 12;
        var compHeightEt = compSizeGroup.add("edittext", undefined, DEFAULTS.compHeight.toString());
        compHeightEt.characters = 7;

        var compTimingGroup = compPanel.add("group");
        compTimingGroup.orientation = "row";
        compTimingGroup.spacing = 6;
        compTimingGroup.alignChildren = ["left", "center"];
        var compDurationEt = compTimingGroup.add("edittext", undefined, DEFAULTS.compDuration.toString());
        compDurationEt.characters = 6;
        compTimingGroup.add("statictext", undefined, "sec  @");
        var compFpsEt = compTimingGroup.add("edittext", undefined, DEFAULTS.compFrameRate.toString());
        compFpsEt.characters = 5;
        compTimingGroup.add("statictext", undefined, "fps");

        var colorPanel = pal.add("panel", undefined, "Colors");
        colorPanel.orientation = "column";
        colorPanel.alignChildren = ["fill", "top"];
        colorPanel.spacing = 4;
        colorPanel.margins = 10;

        var circleFillEt = addColorRow(colorPanel, "Node fill RGBA", DEFAULTS.circleFill);
        var circleStrokeEt = addColorRow(colorPanel, "Node stroke RGBA", DEFAULTS.circleStroke);
        var lineColorEt = addColorRow(colorPanel, "Line RGBA", DEFAULTS.lineColor);

        var buttonGroup = pal.add("group");
        buttonGroup.orientation = "row";
        buttonGroup.alignChildren = ["fill", "center"];
        buttonGroup.spacing = 8;

        var generateBtn = buttonGroup.add("button", undefined, "Generate");

        function readInt(editField, fallback, minValue, maxValue) {
            var val = parseInt(editField.text, 10);
            if (isNaN(val)) {
                val = fallback;
            }
            if (minValue !== undefined) {
                val = Math.max(minValue, val);
            }
            if (maxValue !== undefined) {
                val = Math.min(maxValue, val);
            }
            editField.text = val.toString();
            return val;
        }

        function readFloat(editField, fallback, minValue, maxValue) {
            var val = parseFloat(editField.text);
            if (isNaN(val)) {
                val = fallback;
            }
            if (minValue !== undefined) {
                val = Math.max(minValue, val);
            }
            if (maxValue !== undefined) {
                val = Math.min(maxValue, val);
            }
            editField.text = val.toString();
            return val;
        }

        function readOptions() {
            return {
                initialLines: readInt(initialLinesEt, DEFAULTS.initialLines, 1, 720),
                levels: readInt(levelsEt, DEFAULTS.levels, 1, 10),
                childrenPerNode: readInt(childrenEt, DEFAULTS.childrenPerNode, 1, 8),
                baseRadius: readFloat(baseRadiusEt, DEFAULTS.baseRadius, 1),
                radiusStep: readFloat(radiusStepEt, DEFAULTS.radiusStep, 0),
                radiusJitter: readFloat(radiusJitterEt, DEFAULTS.radiusJitter, 0),
                angleJitter: readFloat(angleJitterEt, DEFAULTS.angleJitter, 0),
                branchSpread: readFloat(branchSpreadEt, DEFAULTS.branchSpread, 0, 360),
                circleSize: readFloat(circleSizeEt, DEFAULTS.circleSize, 2),
                lineWidth: readFloat(lineWidthEt, DEFAULTS.lineWidth, 0.5),
                lineDuration: readFloat(lineDurationEt, DEFAULTS.lineDuration, 0.05),
                nodeDuration: readFloat(nodeDurationEt, DEFAULTS.nodeDuration, 0.05),
                childStagger: readFloat(childStaggerEt, DEFAULTS.childStagger, 0),
                randomOffset: Math.max(0, readFloat(randomOffsetEt, DEFAULTS.randomOffset, 0)),
                curveTension: Math.max(0, Math.min(1, readFloat(curveTensionEt, DEFAULTS.curveTension, 0))),
                curveRandomness: Math.max(0, Math.min(1, readFloat(curveRandomnessEt, DEFAULTS.curveRandomness, 0))),
                seed: readInt(seedEt, DEFAULTS.seed, -2147483647, 2147483646),
                useActiveComp: useActiveCompCb.value,
                compName: compNameEt.text.length ? compNameEt.text : DEFAULTS.compName,
                compWidth: readInt(compWidthEt, DEFAULTS.compWidth, 16),
                compHeight: readInt(compHeightEt, DEFAULTS.compHeight, 16),
                compDuration: readFloat(compDurationEt, DEFAULTS.compDuration, 0.1),
                compFrameRate: readFloat(compFpsEt, DEFAULTS.compFrameRate, 1),
                circleFill: parseColor(circleFillEt.text, DEFAULTS.circleFill),
                circleStroke: parseColor(circleStrokeEt.text, DEFAULTS.circleStroke),
                lineColor: parseColor(lineColorEt.text, DEFAULTS.lineColor),
                make3D: make3DCb.value,
                simultaneousRoot: simultaneousRootCb.value,
                smoothFlow: smoothFlowCb.value,
                useCurves: useCurvesCb.value
            };
        }

        generateBtn.onClick = function () {
            var opts = readOptions();
            app.beginUndoGroup(SCRIPT_NAME);
            try {
                var comp = getTargetComp(opts);
                if (!comp) {
                    alert("Unable to access or create a composition.");
                } else {
                    generateStructure(comp, opts);
                }
            } catch (err) {
                alert("Error: " + err.toString());
            } finally {
                app.endUndoGroup();
            }
        };

        pal.onResizing = pal.onResize = function () {
            this.layout.resize();
        };

        return pal;
    }

    function ensureProject() {
        if (!app.project) {
            app.newProject();
        }
    }

    function getTargetComp(opts) {
        ensureProject();
        var comp = null;
        if (opts.useActiveComp && app.project.activeItem instanceof CompItem) {
            comp = app.project.activeItem;
        }
        if (!comp) {
            comp = app.project.items.addComp(
                opts.compName,
                opts.compWidth,
                opts.compHeight,
                1,
                opts.compDuration,
                opts.compFrameRate
            );
        }
        return comp;
    }

    function createRng(seed) {
        var value = seed % 2147483647;
        if (value <= 0) {
            value += 2147483646;
        }
        return {
            next: function () {
                value = (value * 16807) % 2147483647;
                return (value - 1) / 2147483646;
            },
            range: function (minValue, maxValue) {
                return minValue + (maxValue - minValue) * this.next();
            }
        };
    }

    function toRadians(deg) {
        return deg * Math.PI / 180;
    }

    function polarToCartesian(center, radius, angleDeg) {
        var rad = toRadians(angleDeg);
        return [
            center[0] + Math.cos(rad) * radius,
            center[1] + Math.sin(rad) * radius
        ];
    }

    function computeRadius(level, opts, rng) {
        var base = opts.baseRadius + (level - 1) * opts.radiusStep;
        var jitter = opts.radiusJitter > 0 ? rng.range(-opts.radiusJitter, opts.radiusJitter) : 0;
        var radius = Math.max(5, base + jitter);
        return radius;
    }

    function addCircleLayer(comp, node, opts) {
        var circleLayer = comp.layers.addShape();
        circleLayer.name = "RB_Circle_L" + node.level + "_" + node.id;
        circleLayer.parent = node.nullLayer;
        circleLayer.transform.position.setValue(opts.make3D ? [0, 0, 0] : [0, 0]);
        circleLayer.label = 11;
        circleLayer.threeDLayer = !!opts.make3D;

        var contents = circleLayer.property("ADBE Root Vectors Group");
        var group = contents.addProperty("ADBE Vector Group");
        group.name = "Circle";
        var groupContents = group.property("ADBE Vectors Group");
        var ellipse = groupContents.addProperty("ADBE Vector Shape - Ellipse");
        ellipse.property("ADBE Vector Ellipse Size").setValue([opts.circleSize, opts.circleSize]);

        var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([opts.circleFill[0], opts.circleFill[1], opts.circleFill[2]]);
        fill.property("ADBE Vector Fill Opacity").setValue(opts.circleFill[3] * 100);

        var stroke = groupContents.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("ADBE Vector Stroke Color").setValue([opts.circleStroke[0], opts.circleStroke[1], opts.circleStroke[2]]);
        stroke.property("ADBE Vector Stroke Width").setValue(Math.max(0.1, opts.lineWidth));
        stroke.property("ADBE Vector Stroke Opacity").setValue(opts.circleStroke[3] * 100);

        circleLayer.moveBefore(node.nullLayer);
        return circleLayer;
    }

    function addNode(comp, position, angle, radius, level, id, opts) {
        var nullLayer = comp.layers.addNull();
        nullLayer.name = "RB_Node_L" + level + "_" + id;
        nullLayer.threeDLayer = !!opts.make3D;
        nullLayer.motionBlur = false;
        nullLayer.label = 9;
        var nodePos = opts.make3D ? [position[0], position[1], position.length > 2 ? position[2] : 0] : position.slice(0, 2);
        nullLayer.transform.position.setValue(nodePos);
        nullLayer.transform.scale.setValue([45, 45, 100]);
        nullLayer.shy = false;

        var node = {
            id: id,
            level: level,
            angle: angle,
            radius: radius,
            nullLayer: nullLayer,
            circleLayer: null,
            parent: null,
            children: [],
            incomingLine: null,
            inTime: 0,
            outTime: 0,
            animStart: 0,
            animEnd: 0
        };

        node.circleLayer = addCircleLayer(comp, node, opts);
        return node;
    }

    function addConnectionLine(comp, parentNode, childNode, opts, level, idx) {
        var parentLayer = parentNode.nullLayer;
        var childLayer = childNode.nullLayer;
        var lineLayer = comp.layers.addShape();
        lineLayer.name = "RB_Line_L" + level + "_" + idx;
        lineLayer.motionBlur = false;
        lineLayer.threeDLayer = !!opts.make3D;
        lineLayer.label = 13;
        lineLayer.transform.position.setValue(opts.make3D ? [0, 0, 0] : [0, 0]);

        var effects = lineLayer.property("ADBE Effect Parade");
        var parentEffect = effects.addProperty("ADBE Layer Control");
        parentEffect.name = "Parent Node";
        parentEffect.property("ADBE Layer Control-0001").setValue(parentLayer.index);
        var childEffect = effects.addProperty("ADBE Layer Control");
        childEffect.name = "Child Node";
        childEffect.property("ADBE Layer Control-0001").setValue(childLayer.index);

        var contents = lineLayer.property("ADBE Root Vectors Group");
        var group = contents.addProperty("ADBE Vector Group");
        group.name = "Branch";
        var groupContents = group.property("ADBE Vectors Group");
        var pathGroup = groupContents.addProperty("ADBE Vector Shape - Group");
        var pathProp = pathGroup.property("ADBE Vector Shape");
        var expr = [
            "var parentLayer = effect(\"Parent Node\")(\"Layer\");",
            "var childLayer = effect(\"Child Node\")(\"Layer\");",
            "if (!parentLayer || !childLayer) {",
            "  createPath();",
            "} else {",
            "  var p = parentLayer.toComp(parentLayer.anchorPoint);",
            "  var c = childLayer.toComp(childLayer.anchorPoint);",
            "  if (!p || !c) {",
            "    createPath();",
            "  } else {",
            "    if (p.length < 3) {",
            "      p = [p[0], p[1], 0];",
            "    }",
            "    if (c.length < 3) {",
            "      c = [c[0], c[1], 0];",
            "    }",
            "    var pLocal = fromComp(p);",
            "    var cLocal = fromComp(c);",
            "    var p2 = (pLocal.length > 2) ? [pLocal[0], pLocal[1]] : pLocal;",
            "    var c2 = (cLocal.length > 2) ? [cLocal[0], cLocal[1]] : cLocal;",
            "    var ctrl = null;",
            "    try {",
            "      ctrl = thisComp.layer(\"" + CONTROL_NAMES.layer + "\");",
            "    } catch (err) {}",
            "    var useCurves = false;",
            "    var tension = 0;",
            "    var randomness = 0;",
            "    if (ctrl) {",
            "      try { useCurves = ctrl.effect(\"" + CONTROL_NAMES.curvesEnabled + "\")(\"Checkbox\") > 0; } catch (err) {}",
            "      try { tension = ctrl.effect(\"" + CONTROL_NAMES.curveTension + "\")(\"Slider\") / 100; } catch (err) {}",
            "      try { randomness = ctrl.effect(\"" + CONTROL_NAMES.curveRandomness + "\")(\"Slider\") / 100; } catch (err) {}",
            "    }",
            "    tension = Math.max(0, tension);",
            "    randomness = Math.max(0, randomness);",
            "    if (!useCurves || tension <= 0) {",
            "      createPath([p2, c2], [], [], false);",
            "    } else {",
            "      var diffVec = [c2[0] - p2[0], c2[1] - p2[1]];",
            "      var dist = Math.sqrt(diffVec[0] * diffVec[0] + diffVec[1] * diffVec[1]);",
            "      if (dist == 0) {",
            "        createPath([p2, c2], [], [], false);",
            "      } else {",
            "        var dir = [diffVec[0] / dist, diffVec[1] / dist];",
            "        var perp = [-dir[1], dir[0]];",
            "        seedRandom(index + 101, true);",
            "        var dirSign = (random() < 0.5) ? -1 : 1;",
            "        var variation = 1 + randomness * random(-1, 1);",
            "        var bend = dist * tension * variation;",
            "        var mid = [",
            "          p2[0] + diffVec[0] * 0.5 + perp[0] * bend * 0.5 * dirSign,",
            "          p2[1] + diffVec[1] * 0.5 + perp[1] * bend * 0.5 * dirSign",
            "        ];",
            "        var handleLen = dist / 3;",
            "        var out0 = [",
            "          dir[0] * handleLen + perp[0] * bend * 0.35 * dirSign,",
            "          dir[1] * handleLen + perp[1] * bend * 0.35 * dirSign",
            "        ];",
            "        var in2 = [-out0[0], -out0[1]];",
            "        var out1 = [",
            "          dir[0] * handleLen * 0.25 + perp[0] * bend * 0.4 * dirSign,",
            "          dir[1] * handleLen * 0.25 + perp[1] * bend * 0.4 * dirSign",
            "        ];",
            "        var in1 = [-out1[0], -out1[1]];",
            "        createPath([p2, mid, c2], [[0, 0], in1, in2], [out0, out1, [0, 0]], false);",
            "      }",
            "    }",
            "  }",
            "}"
        ].join("\n");
        pathProp.expression = expr;

        var stroke = groupContents.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("ADBE Vector Stroke Color").setValue([opts.lineColor[0], opts.lineColor[1], opts.lineColor[2]]);
        stroke.property("ADBE Vector Stroke Width").setValue(Math.max(0.1, opts.lineWidth));
        stroke.property("ADBE Vector Stroke Opacity").setValue(opts.lineColor[3] * 100);
        var trim = groupContents.addProperty("ADBE Vector Filter - Trim");
        var trimStart = trim.property("ADBE Vector Trim Start");
        var trimEnd = trim.property("ADBE Vector Trim End");
        trimStart.setValue(0);
        trimEnd.setValue(0);
        trim.property("ADBE Vector Trim Offset").setValue(0);

        var lineInfo = {
            layer: lineLayer,
            parentNode: parentNode,
            childNode: childNode,
            trimStart: trimStart,
            trimEnd: trimEnd
        };
        parentNode.children.push(lineInfo);
        childNode.parent = parentNode;
        childNode.incomingLine = lineInfo;
        return lineInfo;
    }

    function clearPropertyKeys(prop) {
        if (!prop || !prop.canVaryOverTime) {
            return;
        }
        while (prop.numKeys > 0) {
            prop.removeKey(prop.numKeys);
        }
    }

    function formatArrayLiteral(values) {
        var parts = [];
        for (var i = 0; i < values.length; i++) {
            parts.push(values[i]);
        }
        return "[" + parts.join(", ") + "]";
    }

    function ensureSliderControl(layer, effectName) {
        var effects = layer.property("ADBE Effect Parade");
        if (!effects) {
            return null;
        }
        var effect = null;
        for (var i = 1; i <= effects.numProperties; i++) {
            var candidate = effects.property(i);
            if (candidate && candidate.name === effectName) {
                effect = candidate;
                break;
            }
        }
        if (!effect) {
            effect = effects.addProperty("ADBE Slider Control");
            effect.name = effectName;
        }
        return effect ? effect.property("ADBE Slider Control-0001") : null;
    }

    function ensureCheckboxControl(layer, effectName) {
        var effects = layer.property("ADBE Effect Parade");
        if (!effects) {
            return null;
        }
        var effect = null;
        for (var i = 1; i <= effects.numProperties; i++) {
            var candidate = effects.property(i);
            if (candidate && candidate.name === effectName) {
                effect = candidate;
                break;
            }
        }
        if (!effect) {
            effect = effects.addProperty("ADBE Checkbox Control");
            effect.name = effectName;
        }
        return effect ? effect.property("ADBE Checkbox Control-0001") : null;
    }

    function ensureAnimationController(comp, totalDuration, opts) {
        var controller = null;
        for (var i = 1; i <= comp.layers.length; i++) {
            var candidate = comp.layers[i];
            if (candidate && candidate.name === CONTROL_NAMES.layer) {
                controller = candidate;
                break;
            }
        }
        if (!controller) {
            controller = comp.layers.addNull();
            controller.name = CONTROL_NAMES.layer;
            controller.label = 2;
            controller.threeDLayer = false;
            controller.motionBlur = false;
            controller.shy = false;
            controller.transform.position.setValue([comp.width / 2, comp.height / 2]);
            controller.moveToBeginning();
        }

        var sliderProp = ensureSliderControl(controller, CONTROL_NAMES.progress);
        if (sliderProp) {
            clearPropertyKeys(sliderProp);
            var startTime = comp.displayStartTime || 0;
            sliderProp.setValueAtTime(startTime, 0);
            sliderProp.setValueAtTime(startTime + totalDuration, 100);
        }

        var curvesCheckboxProp = ensureCheckboxControl(controller, CONTROL_NAMES.curvesEnabled);
        if (curvesCheckboxProp) {
            curvesCheckboxProp.setValue((opts && opts.useCurves) ? 1 : 0);
        }
        var tensionSliderProp = ensureSliderControl(controller, CONTROL_NAMES.curveTension);
        if (tensionSliderProp) {
            var tensionVal = (opts && typeof opts.curveTension === "number") ? opts.curveTension : DEFAULTS.curveTension;
            tensionSliderProp.setValue(Math.max(0, Math.min(1, tensionVal)) * 100);
        }
        var randomnessSliderProp = ensureSliderControl(controller, CONTROL_NAMES.curveRandomness);
        if (randomnessSliderProp) {
            var randomnessVal = (opts && typeof opts.curveRandomness === "number") ? opts.curveRandomness : DEFAULTS.curveRandomness;
            randomnessSliderProp.setValue(Math.max(0, Math.min(1, randomnessVal)) * 100);
        }

        return controller;
    }

    function setLineAnimationExpression(lineInfo, totalDuration) {
        if (!lineInfo || !lineInfo.layer || !lineInfo.trimEnd) {
            return;
        }
        lineInfo.trimStart.setValue(0);
        clearPropertyKeys(lineInfo.trimEnd);
        lineInfo.trimEnd.setValue(0);
        var startProgress = totalDuration > 0 ? (lineInfo.startTime / totalDuration) * 100 : 0;
        var endProgress = totalDuration > 0 ? (lineInfo.endTime / totalDuration) * 100 : 100;
        var exprLines = [
            "var ctrl = null;",
            "try {",
            "  ctrl = thisComp.layer(\"" + CONTROL_NAMES.layer + "\");",
            "} catch (err) {}",
            "var progress = 100;",
            "if (ctrl) {",
            "  try {",
            "    var progEff = ctrl.effect(\"" + CONTROL_NAMES.progress + "\");",
            "    if (progEff) {",
            "      progress = progEff(\"Slider\");",
            "    }",
            "  } catch (err) {}",
            "}",
            "var startVal = " + startProgress.toFixed(3) + ";",
            "var endVal = " + endProgress.toFixed(3) + ";",
            "if (endVal <= startVal) {",
            "  progress >= endVal ? 100 : 0;",
            "} else if (progress <= startVal) {",
            "  0;",
            "} else if (progress >= endVal) {",
            "  100;",
            "} else {",
            "  linear(progress, startVal, endVal, 0, 100);",
            "}"
        ];
        lineInfo.trimEnd.expression = exprLines.join("\n");
        lineInfo.trimEnd.expressionEnabled = true;
    }

    function setNodeAnimationExpression(node, totalDuration) {
        if (!node || !node.circleLayer) {
            return;
        }
        var startProgress = totalDuration > 0 ? (node.animStart / totalDuration) * 100 : 0;
        var endProgress = totalDuration > 0 ? (node.animEnd / totalDuration) * 100 : 100;
        var circleLayer = node.circleLayer;
        var baseScale = circleLayer.transform.scale.value;
        if (!baseScale || baseScale.length < 2) {
            return;
        }
        var finalScaleLiteral = formatArrayLiteral(baseScale);
        var zeroScale = [];
        for (var z = 0; z < baseScale.length; z++) {
            zeroScale.push(0);
        }
        var zeroScaleLiteral = formatArrayLiteral(zeroScale);
        var scaledParts = [];
        for (var sp = 0; sp < baseScale.length; sp++) {
            scaledParts.push("finalScale[" + sp + "] * t");
        }
        var scaledLiteral = "[" + scaledParts.join(", ") + "]";
        var exprLines = [
            "var ctrl = null;",
            "try {",
            "  ctrl = thisComp.layer(\"" + CONTROL_NAMES.layer + "\");",
            "} catch (err) {}",
            "var progress = 100;",
            "if (ctrl) {",
            "  try {",
            "    var progEff = ctrl.effect(\"" + CONTROL_NAMES.progress + "\");",
            "    if (progEff) {",
            "      progress = progEff(\"Slider\");",
            "    }",
            "  } catch (err) {}",
            "}",
            "var startVal = " + startProgress.toFixed(3) + ";",
            "var endVal = " + endProgress.toFixed(3) + ";",
            "var finalScale = " + finalScaleLiteral + ";",
            "var zeroScale = " + zeroScaleLiteral + ";",
            "if (endVal <= startVal) {",
            "  (progress >= endVal) ? finalScale : zeroScale;",
            "} else if (progress <= startVal) {",
            "  zeroScale;",
            "} else if (progress >= endVal) {",
            "  finalScale;",
            "} else {",
            "  var t = linear(progress, startVal, endVal, 0, 1);",
            "  " + scaledLiteral + ";",
            "}"
        ];
        var scaleProp = circleLayer.transform.scale;
        clearPropertyKeys(scaleProp);
        scaleProp.expression = exprLines.join("\n");
        scaleProp.expressionEnabled = true;
    }

    function applyBranchAnimation(comp, rootNode, nodeLevels, lineInfos, animationOpts, opts) {
        if (!rootNode) {
            return;
        }
        var lineDuration = opts && opts.lineDuration !== undefined ? opts.lineDuration : (animationOpts && animationOpts.lineDuration !== undefined ? animationOpts.lineDuration : ANIMATION_DEFAULTS.lineDuration);
        var nodeDuration = opts && opts.nodeDuration !== undefined ? opts.nodeDuration : (animationOpts && animationOpts.nodeDuration !== undefined ? animationOpts.nodeDuration : ANIMATION_DEFAULTS.nodeDuration);
        var childStagger = opts && opts.childStagger !== undefined ? opts.childStagger : (animationOpts && animationOpts.childStagger !== undefined ? animationOpts.childStagger : ANIMATION_DEFAULTS.childStagger);
        var randomOffset = opts && opts.randomOffset !== undefined ? opts.randomOffset : 0;
        var simultaneousRoot = opts && opts.simultaneousRoot;
        var smoothFlow = (opts && opts.smoothFlow !== undefined) ? opts.smoothFlow : true;
        var rng = createRng(opts && opts.seed ? opts.seed * 17 + 53 : 123987);

        rootNode.inTime = 0;
        rootNode.animStart = rootNode.inTime;
        rootNode.animEnd = rootNode.animStart + nodeDuration;
        rootNode.outTime = rootNode.animEnd;
        var queue = [rootNode];
        var maxTime = rootNode.outTime;

        while (queue.length > 0) {
            var current = queue.shift();
            var childLines = current.children || [];
            for (var i = 0; i < childLines.length; i++) {
                var lineInfo = childLines[i];
                if (!lineInfo) {
                    continue;
                }
                var offset = childStagger * i;
                if (randomOffset > 0) {
                    offset += rng.range(-randomOffset, randomOffset);
                }
                if (current === rootNode && simultaneousRoot) {
                    offset = 0;
                }
                var lineStart = current.outTime + offset;
                var lineEnd = lineStart + lineDuration;
                lineInfo.startTime = lineStart;
                lineInfo.endTime = lineEnd;
                var childNode = lineInfo.childNode;
                if (!childNode) {
                    continue;
                }
                if (smoothFlow) {
                    childNode.animStart = lineStart;
                } else {
                    childNode.animStart = lineEnd;
                }
                childNode.inTime = childNode.animStart;
                if (smoothFlow) {
                    childNode.animEnd = childNode.animStart + Math.max(nodeDuration, 0.0001);
                    if (childNode.animEnd < lineEnd) {
                        childNode.animEnd = lineEnd;
                    }
                } else {
                    childNode.animEnd = childNode.animStart + nodeDuration;
                }
                childNode.outTime = childNode.animEnd;
                if (childNode.outTime > maxTime) {
                    maxTime = childNode.outTime;
                }
                queue.push(childNode);
            }
        }

        if (maxTime <= 0) {
            maxTime = nodeDuration > 0 ? nodeDuration : 1;
        }

        var controllerLayer = ensureAnimationController(comp, maxTime, opts);
        if (!controllerLayer) {
            return;
        }

        for (var li = 0; li < lineInfos.length; li++) {
            setLineAnimationExpression(lineInfos[li], maxTime);
        }

        for (var levelIdx = 0; levelIdx < nodeLevels.length; levelIdx++) {
            var levelNodes = nodeLevels[levelIdx];
            if (!levelNodes) {
                continue;
            }
            for (var nodeIdx = 0; nodeIdx < levelNodes.length; nodeIdx++) {
                setNodeAnimationExpression(levelNodes[nodeIdx], maxTime);
            }
        }
    }

    function reorderGeneratedLayers(nodeLevels, lineInfos) {
        if (!lineInfos || lineInfos.length === 0) {
            return;
        }

        var circleLayers = [];
        for (var levelIdx = 0; levelIdx < nodeLevels.length; levelIdx++) {
            var levelNodes = nodeLevels[levelIdx];
            if (!levelNodes) {
                continue;
            }
            for (var nodeIdx = 0; nodeIdx < levelNodes.length; nodeIdx++) {
                var node = levelNodes[nodeIdx];
                if (node && node.circleLayer) {
                    circleLayers.push(node.circleLayer);
                }
            }
        }

        if (circleLayers.length === 0) {
            return;
        }

        var lineLayers = [];
        for (var l = 0; l < lineInfos.length; l++) {
            var info = lineInfos[l];
            if (info && info.layer) {
                lineLayers.push(info.layer);
            }
        }

        if (lineLayers.length === 0) {
            return;
        }

        var bottomCircle = circleLayers[0];
        for (var c = 1; c < circleLayers.length; c++) {
            if (circleLayers[c].index > bottomCircle.index) {
                bottomCircle = circleLayers[c];
            }
        }

        lineLayers.sort(function (a, b) {
            return a.index - b.index;
        });

        var insertionLayer = bottomCircle;
        for (var l = 0; l < lineLayers.length; l++) {
            var lineLayer = lineLayers[l];
            if (!lineLayer) {
                continue;
            }
            if (lineLayer.index <= insertionLayer.index || lineLayer.index > insertionLayer.index + 1) {
                lineLayer.moveAfter(insertionLayer);
            }
            insertionLayer = lineLayer;
        }
    }

    function generateStructure(comp, opts) {
        var rng = createRng(opts.seed || 1);
        var center = [comp.width / 2, comp.height / 2];
        var nodes = [];
        var nodeSerial = 0;
        var connectionSerial = 0;
        var lineInfos = [];

        // Center node
        var centerNode = addNode(comp, center, 0, 0, 0, nodeSerial++, opts);
        nodes[0] = [centerNode];

        for (var level = 1; level <= opts.levels; level++) {
            var parentNodes = nodes[level - 1];
            var levelNodes = [];
            if (level === 1) {
                var childCount = opts.initialLines;
                var angleStep = childCount > 0 ? 360 / childCount : 0;
                for (var i = 0; i < childCount; i++) {
                    var baseAngle = angleStep * i;
                    var jitter = opts.angleJitter > 0 ? rng.range(-opts.angleJitter, opts.angleJitter) : 0;
                    var angle = baseAngle + jitter;
                    var radius = computeRadius(level, opts, rng);
                    var pos = polarToCartesian(center, radius, angle);
                    var childNode = addNode(comp, pos, angle, radius, level, nodeSerial++, opts);
                    levelNodes.push(childNode);
                    var lineInfoRoot = addConnectionLine(comp, centerNode, childNode, opts, level, connectionSerial++);
                    lineInfos.push(lineInfoRoot);
                }
            } else {
                for (var p = 0; p < parentNodes.length; p++) {
                    var parentNode = parentNodes[p];
                    for (var c = 0; c < opts.childrenPerNode; c++) {
                        var spread = opts.branchSpread;
                        var normalized = (opts.childrenPerNode > 1) ? (c / (opts.childrenPerNode - 1)) - 0.5 : 0;
                        var offset = spread * normalized;
                        var jitterChild = opts.angleJitter > 0 ? rng.range(-opts.angleJitter, opts.angleJitter) : 0;
                        var angleChild = parentNode.angle + offset + jitterChild;
                        var radiusChild = computeRadius(level, opts, rng);
                        var posChild = polarToCartesian(center, radiusChild, angleChild);
                        var newNode = addNode(comp, posChild, angleChild, radiusChild, level, nodeSerial++, opts);
                        levelNodes.push(newNode);
                        var lineInfo = addConnectionLine(comp, parentNode, newNode, opts, level, connectionSerial++);
                        lineInfos.push(lineInfo);
                    }
                }
            }
            nodes[level] = levelNodes;
        }

        reorderGeneratedLayers(nodes, lineInfos);
        applyBranchAnimation(comp, centerNode, nodes, lineInfos, ANIMATION_DEFAULTS, opts);
    }

    var palette = buildUI(thisObj);
    if (palette instanceof Window) {
        palette.center();
        palette.show();
    } else if (palette) {
        palette.layout.layout(true);
    }
})(this);
