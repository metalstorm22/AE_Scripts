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
        lineColor: [0.835, 0.894, 1, 1]
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
        var seedEt = addEditRow(settingsPanel, "Random seed", DEFAULTS.seed, 7);

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
                seed: readInt(seedEt, DEFAULTS.seed, -2147483647, 2147483646),
                useActiveComp: useActiveCompCb.value,
                compName: compNameEt.text.length ? compNameEt.text : DEFAULTS.compName,
                compWidth: readInt(compWidthEt, DEFAULTS.compWidth, 16),
                compHeight: readInt(compHeightEt, DEFAULTS.compHeight, 16),
                compDuration: readFloat(compDurationEt, DEFAULTS.compDuration, 0.1),
                compFrameRate: readFloat(compFpsEt, DEFAULTS.compFrameRate, 1),
                circleFill: parseColor(circleFillEt.text, DEFAULTS.circleFill),
                circleStroke: parseColor(circleStrokeEt.text, DEFAULTS.circleStroke),
                lineColor: parseColor(lineColorEt.text, DEFAULTS.lineColor)
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
        circleLayer.transform.position.setValue([0, 0]);
        circleLayer.label = 11;

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
        nullLayer.threeDLayer = false;
        nullLayer.motionBlur = false;
        nullLayer.label = 9;
        nullLayer.transform.position.setValue(position);
        nullLayer.transform.scale.setValue([45, 45, 100]);
        nullLayer.shy = false;

        var node = {
            id: id,
            level: level,
            angle: angle,
            radius: radius,
            nullLayer: nullLayer,
            circleLayer: null
        };

        node.circleLayer = addCircleLayer(comp, node, opts);
        return node;
    }

    function addConnectionLine(comp, parentLayer, childLayer, opts, level, idx) {
        var lineLayer = comp.layers.addShape();
        lineLayer.name = "RB_Line_L" + level + "_" + idx;
        lineLayer.motionBlur = false;
        lineLayer.label = 13;
        lineLayer.transform.position.setValue([0, 0]);

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
            "  var p = fromComp(parentLayer.toComp(parentLayer.anchorPoint));",
            "  var c = fromComp(childLayer.toComp(childLayer.anchorPoint));",
            "  createPath([p, c], [], [], false);",
            "}"
        ].join("\n");
        pathProp.expression = expr;

        var stroke = groupContents.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("ADBE Vector Stroke Color").setValue([opts.lineColor[0], opts.lineColor[1], opts.lineColor[2]]);
        stroke.property("ADBE Vector Stroke Width").setValue(Math.max(0.1, opts.lineWidth));
        stroke.property("ADBE Vector Stroke Opacity").setValue(opts.lineColor[3] * 100);
        return lineLayer;
    }

    function reorderGeneratedLayers(nodeLevels, lineLayers) {
        if (!lineLayers || lineLayers.length === 0) {
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
        var lineLayers = [];

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
                    lineLayers.push(addConnectionLine(comp, centerNode.nullLayer, childNode.nullLayer, opts, level, connectionSerial++));
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
                        lineLayers.push(addConnectionLine(comp, parentNode.nullLayer, newNode.nullLayer, opts, level, connectionSerial++));
                    }
                }
            }
            nodes[level] = levelNodes;
        }

        reorderGeneratedLayers(nodes, lineLayers);
    }

    var palette = buildUI(thisObj);
    if (palette instanceof Window) {
        palette.center();
        palette.show();
    } else if (palette) {
        palette.layout.layout(true);
    }
})(this);
