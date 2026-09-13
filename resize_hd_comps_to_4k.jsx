/**
 * Upscales the active 1920x1080 comp and every HD precomp nested inside it to 4K (3840x2160).
 *
 * Usage:
 *  1. Open the HD master comp so it is the active item in the Project panel.
 *  2. Run the script (File > Scripts > Run Script File...).
 *  3. The selected comp and any precomps it references that are still 1920x1080 will be resized.
 */
(function () {
    var HD_WIDTH = 1920;
    var HD_HEIGHT = 1080;
    var UHD_WIDTH = 3840;
    var UHD_HEIGHT = 2160;
    var ROUNDING_EPSILON = 0.001;

    if (!app.project) {
        alert("Open a project with an HD comp before running the script.");
        return;
    }

    var rootComp = app.project.activeItem;
    if (!(rootComp instanceof CompItem)) {
        alert("Select the HD comp you want to upscale before running the script.");
        return;
    }

    if (rootComp.width !== HD_WIDTH || rootComp.height !== HD_HEIGHT) {
        alert("The active comp is not 1920x1080. Select the HD comp you want to convert.");
        return;
    }

    var visited = {};
    var hdComps = [];

    function collectComps(comp) {
        if (!comp || visited[comp.id]) {
            return;
        }
        visited[comp.id] = true;

        if (comp.width === HD_WIDTH && comp.height === HD_HEIGHT) {
            hdComps.push(comp);
        }

        for (var i = 1; i <= comp.numLayers; i += 1) {
            var layer = comp.layer(i);
            if (layer.source && layer.source instanceof CompItem) {
                collectComps(layer.source);
            }
        }
    }

    function shouldScaleDim(dimIndexes, index) {
        if (!dimIndexes || dimIndexes.length === 0) {
            return true;
        }
        for (var i = 0; i < dimIndexes.length; i += 1) {
            if (dimIndexes[i] === index) {
                return true;
            }
        }
        return false;
    }

    function scaleSeparatedProperty(prop, factor, dimIndexes) {
        var sample = prop.value;
        if (!(sample instanceof Array)) {
            return;
        }

        var dimCount = sample.length;
        for (var d = 0; d < dimCount; d += 1) {
            if (!shouldScaleDim(dimIndexes, d)) {
                continue;
            }
            var follower = prop.getSeparationFollower(d);
            if (!follower || follower.expressionEnabled) {
                continue;
            }
            if (follower.numKeys > 0) {
                for (var k = 1; k <= follower.numKeys; k += 1) {
                    follower.setValueAtKey(k, follower.keyValue(k) * factor);
                }
            } else {
                follower.setValue(follower.value * factor);
            }
        }
    }

    function scaleValue(value, factor, dimIndexes) {
        if (value instanceof Array) {
            var scaled = [];
            for (var i = 0; i < value.length; i += 1) {
                if (shouldScaleDim(dimIndexes, i)) {
                    scaled[i] = value[i] * factor;
                } else {
                    scaled[i] = value[i];
                }
            }
            return scaled;
        }
        return value * factor;
    }

    function scaleProperty(prop, factor, dimIndexes) {
        if (!prop || prop.propertyValueType === PropertyValueType.NO_VALUE || factor === 1) {
            return;
        }
        if (prop.expressionEnabled) {
            return;
        }

        if (prop.dimensionsSeparated) {
            scaleSeparatedProperty(prop, factor, dimIndexes);
            return;
        }

        if (prop.numKeys > 0) {
            for (var i = 1; i <= prop.numKeys; i += 1) {
                prop.setValueAtKey(i, scaleValue(prop.keyValue(i), factor, dimIndexes));
            }
        } else {
            prop.setValue(scaleValue(prop.value, factor, dimIndexes));
        }
    }

    function scaleLayer(layer, factor) {
        var transform = layer.property("ADBE Transform Group");
        if (!transform) {
            return;
        }

        scaleProperty(transform.property("ADBE Anchor Point"), factor, [0, 1]);
        scaleProperty(transform.property("ADBE Position"), factor, [0, 1]);
        scaleProperty(transform.property("ADBE Point of Interest"), factor, [0, 1]);
        scaleProperty(transform.property("ADBE Scale"), factor, null);
    }

    function resizeComp(comp) {
        var widthFactor = UHD_WIDTH / comp.width;
        var heightFactor = UHD_HEIGHT / comp.height;

        if (Math.abs(widthFactor - heightFactor) > ROUNDING_EPSILON) {
            return false;
        }

        var factor = widthFactor;

        for (var i = 1; i <= comp.numLayers; i += 1) {
            scaleLayer(comp.layer(i), factor);
        }

        comp.width = UHD_WIDTH;
        comp.height = UHD_HEIGHT;

        return true;
    }

    collectComps(rootComp);

    if (hdComps.length === 0) {
        alert("No HD precomps were found inside the selected comp.");
        return;
    }

    app.beginUndoGroup("Resize HD Comps to 4K");

    var resizedCount = 0;
    for (var c = 0; c < hdComps.length; c += 1) {
        if (resizeComp(hdComps[c])) {
            resizedCount += 1;
        }
    }

    app.endUndoGroup();

    alert("Resized " + resizedCount + " comp(s) to 4K.");
})();
