/**
 * Procedural candlestick chart generator for Adobe After Effects.
 * Creates a synthetic data stream, builds a chart layout, and wires expressions
 * so the animation plays back with per-second updates driven by control sliders.
 *
 * Drop this file into AE's Scripts folder (or run via File > Scripts > Run Script File)
 * to build the scene inside the active project.
 */

(function () {
    app.beginUndoGroup("Procedural Candlestick Chart");

    var NUM_CANDLES = 120; // total synthetic seconds to render
    var COMP_WIDTH = 1920;
    var COMP_HEIGHT = 1080;
    var FRAME_RATE = 30;
    var COMP_DURATION = NUM_CANDLES + 10; // leave buffer past final candle
    var BASE_PRICE = 2000;
    var VOLATILITY = 4; // tune for variance between candles

    if (!app.project) {
        app.newProject();
    }

    var project = app.project;
    var comp = project.items.addComp(
        "Synthetic Candlestick Chart",
        COMP_WIDTH,
        COMP_HEIGHT,
        1,
        COMP_DURATION,
        FRAME_RATE
    );

    /**
     * Utility helpers
     */
    function pad(number, digits) {
        var str = number.toString();
        while (str.length < digits) {
            str = "0" + str;
        }
        return str;
    }

    function addSlider(layer, name, value) {
        var effect = layer.property("Effects").addProperty("ADBE Slider Control");
        effect.name = name;
        effect.property("ADBE Slider Control-0001").setValue(value);
        return effect;
    }

    function addCheckbox(layer, name, value) {
        var effect = layer.property("Effects").addProperty("ADBE Checkbox Control");
        effect.name = name;
        effect.property("ADBE Checkbox Control-0001").setValue(value ? 1 : 0);
        return effect;
    }

    function addColorControl(layer, name, valueArray) {
        var effect = layer.property("Effects").addProperty("ADBE Color Control");
        effect.name = name;
        effect.property("ADBE Color Control-0001").setValue(valueArray);
        return effect;
    }

    function createHorizontalLine(parentGroup, ratio, thickness, colorArray, name) {
        var lineGroup = parentGroup.addProperty("ADBE Vector Group");
        lineGroup.name = name;
        var vectors = lineGroup.property("ADBE Vectors Group");
        var rectShape = vectors.addProperty("ADBE Vector Shape - Rect");
        rectShape.property("ADBE Vector Rect Roundness").setValue(0);
        rectShape.property("ADBE Vector Rect Size").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var width = controls.effect("Chart Width")("Slider");\n' +
            '[' +
            'width, ' + thickness + '];';
        var fill = vectors.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue(colorArray);
        var transform = lineGroup.property("ADBE Vector Transform Group");
        transform.property("ADBE Vector Position").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var left = controls.effect("Chart Left")("Slider");\n' +
            'var width = controls.effect("Chart Width")("Slider");\n' +
            'var top = controls.effect("Chart Top")("Slider");\n' +
            'var height = controls.effect("Chart Height")("Slider");\n' +
            'var y = top + height * ' + ratio + ';\n' +
            '[left + width / 2, y];';
    }

    function createVerticalLine(parentGroup, ratio, thickness, colorArray, name) {
        var lineGroup = parentGroup.addProperty("ADBE Vector Group");
        lineGroup.name = name;
        var vectors = lineGroup.property("ADBE Vectors Group");
        var rectShape = vectors.addProperty("ADBE Vector Shape - Rect");
        rectShape.property("ADBE Vector Rect Roundness").setValue(0);
        rectShape.property("ADBE Vector Rect Size").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var height = controls.effect("Chart Height")("Slider");\n' +
            '[' +
            thickness + ', height];';
        var fill = vectors.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue(colorArray);
        var transform = lineGroup.property("ADBE Vector Transform Group");
        transform.property("ADBE Vector Position").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var left = controls.effect("Chart Left")("Slider");\n' +
            'var width = controls.effect("Chart Width")("Slider");\n' +
            'var top = controls.effect("Chart Top")("Slider");\n' +
            'var height = controls.effect("Chart Height")("Slider");\n' +
            'var x = left + width * ' + ratio + ';\n' +
            '[x, top + height / 2];';
    }

    /**
     * Generate synthetic OHLC data
     */
    var data = [];
    var currentPrice = BASE_PRICE;

    for (var i = 0; i < NUM_CANDLES; i += 1) {
        var open = currentPrice;
        // bias the trend slightly so the series drifts
        var directionalBias = (Math.sin(i / 12) + Math.cos(i / 18)) * 0.5;
        var close = open + (Math.random() - 0.5 + directionalBias * 0.1) * VOLATILITY;
        var high = Math.max(open, close) + Math.random() * (VOLATILITY * 0.8);
        var low = Math.min(open, close) - Math.random() * (VOLATILITY * 0.8);
        currentPrice = close;

        // enforce high/low bounds
        if (high < Math.max(open, close)) {
            high = Math.max(open, close);
        }
        if (low > Math.min(open, close)) {
            low = Math.min(open, close);
        }

        data.push({
            open: open,
            high: high,
            low: low,
            close: close
        });
    }

    var minPrice = data[0].low;
    var maxPrice = data[0].high;
    for (var j = 0; j < data.length; j += 1) {
        if (data[j].low < minPrice) {
            minPrice = data[j].low;
        }
        if (data[j].high > maxPrice) {
            maxPrice = data[j].high;
        }
    }

    // chart layout metrics
    var chartTop = COMP_HEIGHT * 0.18;
    var chartBottom = COMP_HEIGHT * 0.88;
    var chartHeight = chartBottom - chartTop;
    var chartLeft = COMP_WIDTH * 0.1;
    var chartRight = COMP_WIDTH * 0.92;
    var chartWidth = chartRight - chartLeft;
    var candleWidth = Math.max(8, chartWidth / NUM_CANDLES * 0.6);
    var candleGap = Math.max(2, chartWidth / NUM_CANDLES * 0.2);
    var priceScale = chartHeight / (maxPrice - minPrice);

    /**
     * Background and grid
     */
    var bgLayer = comp.layers.addSolid([0.05, 0.07, 0.1], "Background", COMP_WIDTH, COMP_HEIGHT, 1, COMP_DURATION);
    bgLayer.moveToEnd();

    var gridLayer = comp.layers.addShape();
    gridLayer.name = "Grid Overlay";
    gridLayer.property("Transform").property("Anchor Point").setValue([0, 0]);
    gridLayer.property("Transform").property("Position").setValue([0, 0]);
    gridLayer.property("Transform").property("Scale").setValue([100, 100]);

    var gridContents = gridLayer.property("ADBE Root Vectors Group");

    var gridBackgroundGroup = gridContents.addProperty("ADBE Vector Group");
    gridBackgroundGroup.name = "Chart Background";
    var gridBackgroundVectors = gridBackgroundGroup.property("ADBE Vectors Group");
    var gridBackgroundRect = gridBackgroundVectors.addProperty("ADBE Vector Shape - Rect");
    gridBackgroundRect.property("ADBE Vector Rect Roundness").setValue(0);
    gridBackgroundRect.property("ADBE Vector Rect Size").expression =
        'var controls = thisComp.layer("Chart Controls");\n' +
        'var width = controls.effect("Chart Width")("Slider");\n' +
        'var height = controls.effect("Chart Height")("Slider");\n' +
        '[width, height];';
    var gridBackgroundFill = gridBackgroundVectors.addProperty("ADBE Vector Graphic - Fill");
    gridBackgroundFill.property("ADBE Vector Fill Color").setValue([0.07, 0.09, 0.13, 0.85]);
    var gridBackgroundStroke = gridBackgroundVectors.addProperty("ADBE Vector Graphic - Stroke");
    gridBackgroundStroke.property("ADBE Vector Stroke Color").setValue([0.22, 0.32, 0.42, 1]);
    gridBackgroundStroke.property("ADBE Vector Stroke Width").setValue(2);
    var gridBackgroundTransform = gridBackgroundGroup.property("ADBE Vector Transform Group");
    gridBackgroundTransform.property("ADBE Vector Position").expression =
        'var controls = thisComp.layer("Chart Controls");\n' +
        'var left = controls.effect("Chart Left")("Slider");\n' +
        'var width = controls.effect("Chart Width")("Slider");\n' +
        'var top = controls.effect("Chart Top")("Slider");\n' +
        'var height = controls.effect("Chart Height")("Slider");\n' +
        '[left + width / 2, top + height / 2];';

    var majorColor = [0.22, 0.28, 0.36, 0.9];
    var minorColor = [0.13, 0.17, 0.24, 0.6];

    var horizontalMajorCount = 6;
    var horizontalMinorDivisions = 4;
    for (var h = 0; h < horizontalMajorCount; h += 1) {
        var majorRatio = (horizontalMajorCount === 1) ? 0 : h / (horizontalMajorCount - 1);
        createHorizontalLine(gridContents, majorRatio, 3, majorColor, "H Major " + pad(h + 1, 2));
        if (h < horizontalMajorCount - 1) {
            var nextRatio = (horizontalMajorCount === 1) ? 1 : (h + 1) / (horizontalMajorCount - 1);
            for (var hm = 1; hm < horizontalMinorDivisions; hm += 1) {
                var minorRatio = majorRatio + (nextRatio - majorRatio) * (hm / horizontalMinorDivisions);
                createHorizontalLine(gridContents, minorRatio, 1, minorColor, "H Minor " + pad(h, 2) + "_" + hm);
            }
        }
    }

    var verticalMajorCount = 10;
    var verticalMinorDivisions = 3;
    for (var v = 0; v < verticalMajorCount; v += 1) {
        var vMajorRatio = (verticalMajorCount === 1) ? 0 : v / (verticalMajorCount - 1);
        createVerticalLine(gridContents, vMajorRatio, 3, majorColor, "V Major " + pad(v + 1, 2));
        if (v < verticalMajorCount - 1) {
            var vNextRatio = (verticalMajorCount === 1) ? 1 : (v + 1) / (verticalMajorCount - 1);
            for (var vm = 1; vm < verticalMinorDivisions; vm += 1) {
                var vMinorRatio = vMajorRatio + (vNextRatio - vMajorRatio) * (vm / verticalMinorDivisions);
                createVerticalLine(gridContents, vMinorRatio, 1, minorColor, "V Minor " + pad(v, 2) + "_" + vm);
            }
        }
    }

    /**
     * Control layer
     */
    var controls = comp.layers.addNull(COMP_DURATION);
    controls.name = "Chart Controls";
    controls.label = 9; // cyan
    controls.property("Position").setValue([COMP_WIDTH / 2, COMP_HEIGHT * 0.08]);
    controls.property("Scale").setValue([100, 100]);
    controls.property("Anchor Point").setValue([0, 0]);

    addSlider(controls, "Total Candles", NUM_CANDLES);
    addSlider(controls, "Playback Speed", 1);
    addCheckbox(controls, "Auto Mode", true);
    addSlider(controls, "Manual Cursor", 0);
    addSlider(controls, "Chart Top", chartTop);
    addSlider(controls, "Chart Height", chartHeight);
    addSlider(controls, "Chart Width", chartWidth);
    addSlider(controls, "Chart Left", chartLeft);
    addSlider(controls, "Candle Width", candleWidth);
    addSlider(controls, "Candle Gap", candleGap);
    addSlider(controls, "Price Min", minPrice);
    addSlider(controls, "Price Max", maxPrice);
    addSlider(controls, "Price Scale", priceScale);
    addColorControl(controls, "Bull Color", [0.1, 0.7, 0.35, 1]);
    addColorControl(controls, "Bear Color", [0.85, 0.2, 0.28, 1]);
    addColorControl(controls, "Wick Color", [0.9, 0.9, 0.95, 1]);
    addCheckbox(controls, "Show Follower", true);
    addSlider(controls, "Follower Thickness", 4);
    addSlider(controls, "Follower Label Offset", 28);
    addSlider(controls, "Follower Box Padding", 14);
    addColorControl(controls, "Follower Color", [0.85, 0.1, 0.12, 1]);
    addColorControl(controls, "Follower Text Color", [1, 1, 1, 1]);

    var currentSecondSlider = addSlider(controls, "Current Second", 0);
    currentSecondSlider.property("ADBE Slider Control-0001").expression =
        'var auto = effect("Auto Mode")("Checkbox");\n' +
        'var speed = Math.max(0.01, effect("Playback Speed")("Slider"));\n' +
        'var total = Math.max(1, effect("Total Candles")("Slider"));\n' +
        'var manual = effect("Manual Cursor")("Slider");\n' +
        'var t = time * speed;\n' +
        'if (auto > 0) {\n' +
        '  Math.min(t, total - 0.001);\n' +
        '} else {\n' +
        '  clamp(manual, 0, total - 0.001);\n' +
        '}';

    /**
     * Build candlestick layers
     */
    for (var c = 0; c < data.length; c += 1) {
        var candle = data[c];
        var candleLayer = comp.layers.addShape();
        candleLayer.name = "Candle_" + pad(c + 1, 3);
        candleLayer.label = 10; // blue
        candleLayer.inPoint = 0;
        candleLayer.outPoint = COMP_DURATION;
        candleLayer.property("Transform").property("Anchor Point").setValue([0, 0]);
        candleLayer.property("Transform").property("Position").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var idx = effect("Candle Index")("Slider");\n' +
            'var left = controls.effect("Chart Left")("Slider");\n' +
            'var candleWidth = controls.effect("Candle Width")("Slider");\n' +
            'var gap = controls.effect("Candle Gap")("Slider");\n' +
            'var top = controls.effect("Chart Top")("Slider");\n' +
            'var x = left + idx * (candleWidth + gap) + candleWidth / 2;\n' +
            '[x, top];';
        candleLayer.property("Transform").property("Opacity").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var idx = effect("Candle Index")("Slider");\n' +
            'var current = controls.effect("Current Second")("Slider");\n' +
            '(current >= idx) ? 100 : 0;';

        // store data on the layer
        addSlider(candleLayer, "Candle Index", c);
        addSlider(candleLayer, "Open", candle.open);
        addSlider(candleLayer, "High", candle.high);
        addSlider(candleLayer, "Low", candle.low);
        addSlider(candleLayer, "Close", candle.close);

        var candleContents = candleLayer.property("ADBE Root Vectors Group");

        // Wick group
        var wickGroupLayer = candleContents.addProperty("ADBE Vector Group");
        wickGroupLayer.name = "Wick";
        var wickShape = wickGroupLayer.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        wickShape.property("ADBE Vector Rect Roundness").setValue(0);
        wickShape.property("ADBE Vector Rect Position").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var idx = thisLayer.effect("Candle Index")("Slider");\n' +
            'var current = controls.effect("Current Second")("Slider");\n' +
            'var progress = clamp(current - idx, 0, 1);\n' +
            'var open = thisLayer.effect("Open")("Slider");\n' +
            'var high = thisLayer.effect("High")("Slider");\n' +
            'var low = thisLayer.effect("Low")("Slider");\n' +
            'var close = thisLayer.effect("Close")("Slider");\n' +
            'var segHigh = 0.28;\n' +
            'var segLow = 0.68;\n' +
            'if (segHigh <= 0) segHigh = 0.25;\n' +
            'if (segLow <= segHigh) segLow = segHigh + 0.2;\n' +
            'var upSpan = Math.max(0.0001, segHigh);\n' +
            'var downSpan = Math.max(0.0001, segLow - segHigh);\n' +
            'var closeSpan = Math.max(0.0001, 1 - segLow);\n' +
            'function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }\n' +
            'function priceAt(p) {\n' +
            '  if (p <= 0) return open;\n' +
            '  if (p < segHigh) return lerp(open, high, p / upSpan);\n' +
            '  if (p < segLow) return lerp(high, low, (p - segHigh) / downSpan);\n' +
            '  if (p >= 1) return close;\n' +
            '  return lerp(low, close, (p - segLow) / closeSpan);\n' +
            '}\n' +
            'var live = priceAt(progress);\n' +
            'var maxPrice = Math.max(open, live);\n' +
            'var minPrice = Math.min(open, live);\n' +
            'if (progress >= segHigh) maxPrice = Math.max(maxPrice, high);\n' +
            'if (progress >= segLow) minPrice = Math.min(minPrice, low);\n' +
            'if (progress >= 1) {\n' +
            '  maxPrice = Math.max(maxPrice, close);\n' +
            '  minPrice = Math.min(minPrice, close);\n' +
            '}\n' +
            'var priceMax = controls.effect("Price Max")("Slider");\n' +
            'var px = controls.effect("Price Scale")("Slider");\n' +
            'var highY = (priceMax - maxPrice) * px;\n' +
            'var lowY = (priceMax - minPrice) * px;\n' +
            '[0, (highY + lowY) / 2];';
        wickShape.property("ADBE Vector Rect Size").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var idx = thisLayer.effect("Candle Index")("Slider");\n' +
            'var current = controls.effect("Current Second")("Slider");\n' +
            'var progress = clamp(current - idx, 0, 1);\n' +
            'var open = thisLayer.effect("Open")("Slider");\n' +
            'var high = thisLayer.effect("High")("Slider");\n' +
            'var low = thisLayer.effect("Low")("Slider");\n' +
            'var close = thisLayer.effect("Close")("Slider");\n' +
            'var segHigh = 0.28;\n' +
            'var segLow = 0.68;\n' +
            'if (segHigh <= 0) segHigh = 0.25;\n' +
            'if (segLow <= segHigh) segLow = segHigh + 0.2;\n' +
            'var upSpan = Math.max(0.0001, segHigh);\n' +
            'var downSpan = Math.max(0.0001, segLow - segHigh);\n' +
            'var closeSpan = Math.max(0.0001, 1 - segLow);\n' +
            'function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }\n' +
            'function priceAt(p) {\n' +
            '  if (p <= 0) return open;\n' +
            '  if (p < segHigh) return lerp(open, high, p / upSpan);\n' +
            '  if (p < segLow) return lerp(high, low, (p - segHigh) / downSpan);\n' +
            '  if (p >= 1) return close;\n' +
            '  return lerp(low, close, (p - segLow) / closeSpan);\n' +
            '}\n' +
            'var live = priceAt(progress);\n' +
            'var maxPrice = Math.max(open, live);\n' +
            'var minPrice = Math.min(open, live);\n' +
            'if (progress >= segHigh) maxPrice = Math.max(maxPrice, high);\n' +
            'if (progress >= segLow) minPrice = Math.min(minPrice, low);\n' +
            'if (progress >= 1) {\n' +
            '  maxPrice = Math.max(maxPrice, close);\n' +
            '  minPrice = Math.min(minPrice, close);\n' +
            '}\n' +
            'var px = controls.effect("Price Scale")("Slider");\n' +
            'var width = Math.max(1, thisComp.layer("Chart Controls").effect("Candle Width")("Slider") * 0.18);\n' +
            'var height = Math.max(2, Math.abs(maxPrice - minPrice) * px);\n' +
            '[width, height];';

        var wickFill = wickGroupLayer.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        wickFill.property("ADBE Vector Fill Color").expression =
            'thisComp.layer("Chart Controls").effect("Wick Color")("Color");';

        // Body group
        var bodyGroupLayer = candleContents.addProperty("ADBE Vector Group");
        bodyGroupLayer.name = "Body";
        var bodyShape = bodyGroupLayer.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        bodyShape.property("ADBE Vector Rect Roundness").setValue(0);
        bodyShape.property("ADBE Vector Rect Position").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var idx = thisLayer.effect("Candle Index")("Slider");\n' +
            'var current = controls.effect("Current Second")("Slider");\n' +
            'var progress = clamp(current - idx, 0, 1);\n' +
            'var open = thisLayer.effect("Open")("Slider");\n' +
            'var high = thisLayer.effect("High")("Slider");\n' +
            'var low = thisLayer.effect("Low")("Slider");\n' +
            'var close = thisLayer.effect("Close")("Slider");\n' +
            'var segHigh = 0.28;\n' +
            'var segLow = 0.68;\n' +
            'if (segHigh <= 0) segHigh = 0.25;\n' +
            'if (segLow <= segHigh) segLow = segHigh + 0.2;\n' +
            'var upSpan = Math.max(0.0001, segHigh);\n' +
            'var downSpan = Math.max(0.0001, segLow - segHigh);\n' +
            'var closeSpan = Math.max(0.0001, 1 - segLow);\n' +
            'function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }\n' +
            'function priceAt(p) {\n' +
            '  if (p <= 0) return open;\n' +
            '  if (p < segHigh) return lerp(open, high, p / upSpan);\n' +
            '  if (p < segLow) return lerp(high, low, (p - segHigh) / downSpan);\n' +
            '  if (p >= 1) return close;\n' +
            '  return lerp(low, close, (p - segLow) / closeSpan);\n' +
            '}\n' +
            'var live = priceAt(progress);\n' +
            'var priceMax = controls.effect("Price Max")("Slider");\n' +
            'var px = controls.effect("Price Scale")("Slider");\n' +
            'var openY = (priceMax - open) * px;\n' +
            'var liveY = (priceMax - live) * px;\n' +
            '[0, (openY + liveY) / 2];';
        bodyShape.property("ADBE Vector Rect Size").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var idx = thisLayer.effect("Candle Index")("Slider");\n' +
            'var current = controls.effect("Current Second")("Slider");\n' +
            'var progress = clamp(current - idx, 0, 1);\n' +
            'var open = thisLayer.effect("Open")("Slider");\n' +
            'var high = thisLayer.effect("High")("Slider");\n' +
            'var low = thisLayer.effect("Low")("Slider");\n' +
            'var close = thisLayer.effect("Close")("Slider");\n' +
            'var segHigh = 0.28;\n' +
            'var segLow = 0.68;\n' +
            'if (segHigh <= 0) segHigh = 0.25;\n' +
            'if (segLow <= segHigh) segLow = segHigh + 0.2;\n' +
            'var upSpan = Math.max(0.0001, segHigh);\n' +
            'var downSpan = Math.max(0.0001, segLow - segHigh);\n' +
            'var closeSpan = Math.max(0.0001, 1 - segLow);\n' +
            'function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }\n' +
            'function priceAt(p) {\n' +
            '  if (p <= 0) return open;\n' +
            '  if (p < segHigh) return lerp(open, high, p / upSpan);\n' +
            '  if (p < segLow) return lerp(high, low, (p - segHigh) / downSpan);\n' +
            '  if (p >= 1) return close;\n' +
            '  return lerp(low, close, (p - segLow) / closeSpan);\n' +
            '}\n' +
            'var live = priceAt(progress);\n' +
            'var px = controls.effect("Price Scale")("Slider");\n' +
            'var width = controls.effect("Candle Width")("Slider");\n' +
            'var height = Math.max(2, Math.abs(live - open) * px);\n' +
            '[width, height];';

        var bodyFill = bodyGroupLayer.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        bodyFill.property("ADBE Vector Fill Color").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var idx = thisLayer.effect("Candle Index")("Slider");\n' +
            'var current = controls.effect("Current Second")("Slider");\n' +
            'var progress = clamp(current - idx, 0, 1);\n' +
            'var open = thisLayer.effect("Open")("Slider");\n' +
            'var high = thisLayer.effect("High")("Slider");\n' +
            'var low = thisLayer.effect("Low")("Slider");\n' +
            'var close = thisLayer.effect("Close")("Slider");\n' +
            'var segHigh = 0.28;\n' +
            'var segLow = 0.68;\n' +
            'if (segHigh <= 0) segHigh = 0.25;\n' +
            'if (segLow <= segHigh) segLow = segHigh + 0.2;\n' +
            'var upSpan = Math.max(0.0001, segHigh);\n' +
            'var downSpan = Math.max(0.0001, segLow - segHigh);\n' +
            'var closeSpan = Math.max(0.0001, 1 - segLow);\n' +
            'function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }\n' +
            'function priceAt(p) {\n' +
            '  if (p <= 0) return open;\n' +
            '  if (p < segHigh) return lerp(open, high, p / upSpan);\n' +
            '  if (p < segLow) return lerp(high, low, (p - segHigh) / downSpan);\n' +
            '  if (p >= 1) return close;\n' +
            '  return lerp(low, close, (p - segLow) / closeSpan);\n' +
            '}\n' +
            'var live = priceAt(progress);\n' +
            'var bull = controls.effect("Bull Color")("Color");\n' +
            'var bear = controls.effect("Bear Color")("Color");\n' +
            '(live >= open) ? bull : bear;';
    }

    /**
     * Follower line and label
     */
    var followerLine = comp.layers.addShape();
    followerLine.name = "Follower Line";
    followerLine.inPoint = 0;
    followerLine.outPoint = COMP_DURATION;
    followerLine.property("Transform").property("Anchor Point").setValue([0, 0]);
    followerLine.property("Transform").property("Opacity").expression =
        'thisComp.layer("Chart Controls").effect("Show Follower")("Checkbox") > 0 ? 100 : 0;';
    followerLine.property("Transform").property("Position").expression =
        'var controls = thisComp.layer("Chart Controls");\n' +
        'var left = controls.effect("Chart Left")("Slider");\n' +
        'var width = controls.effect("Chart Width")("Slider");\n' +
        'var top = controls.effect("Chart Top")("Slider");\n' +
        'var priceMax = controls.effect("Price Max")("Slider");\n' +
        'var scale = controls.effect("Price Scale")("Slider");\n' +
        'var total = Math.max(1, controls.effect("Total Candles")("Slider"));\n' +
        'var cursor = clamp(controls.effect("Current Second")("Slider"), 0, total - 0.001);\n' +
        'var idx = Math.floor(cursor);\n' +
        'var frac = cursor - idx;\n' +
        'var name = "Candle_" + ("00" + (idx + 1)).slice(-3);\n' +
        'try {\n' +
        '  var candle = thisComp.layer(name);\n' +
        '  var open = candle.effect("Open")("Slider");\n' +
        '  var high = candle.effect("High")("Slider");\n' +
        '  var low = candle.effect("Low")("Slider");\n' +
        '  var close = candle.effect("Close")("Slider");\n' +
        '  var segHigh = 0.28;\n' +
        '  var segLow = 0.68;\n' +
        '  if (segHigh <= 0) segHigh = 0.25;\n' +
        '  if (segLow <= segHigh) segLow = segHigh + 0.2;\n' +
        '  var upSpan = Math.max(0.0001, segHigh);\n' +
        '  var downSpan = Math.max(0.0001, segLow - segHigh);\n' +
        '  var closeSpan = Math.max(0.0001, 1 - segLow);\n' +
        '  function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }\n' +
        '  function priceAt(p) {\n' +
        '    if (p <= 0) return open;\n' +
        '    if (p < segHigh) return lerp(open, high, p / upSpan);\n' +
        '    if (p < segLow) return lerp(high, low, (p - segHigh) / downSpan);\n' +
        '    if (p >= 1) return close;\n' +
        '    return lerp(low, close, (p - segLow) / closeSpan);\n' +
        '  }\n' +
        '  var live = priceAt(frac);\n' +
        '  var yOffset = (priceMax - live) * scale;\n' +
        '  [left + width / 2, top + yOffset];\n' +
        '} catch(err) {\n' +
        '  value;\n' +
        '}';
    var followerContents = followerLine.property("ADBE Root Vectors Group");
    var followerGroup = followerContents.addProperty("ADBE Vector Group");
    followerGroup.name = "Follower";
    var followerRect = followerGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
    followerRect.property("ADBE Vector Rect Roundness").setValue(0);
    followerRect.property("ADBE Vector Rect Position").setValue([0, 0]);
    followerRect.property("ADBE Vector Rect Size").expression =
        'var controls = thisComp.layer("Chart Controls");\n' +
        'var width = controls.effect("Chart Width")("Slider");\n' +
        'var thickness = Math.max(1, controls.effect("Follower Thickness")("Slider"));\n' +
        '[width, thickness];';
    var followerFill = followerGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
    followerFill.property("ADBE Vector Fill Color").expression =
        'thisComp.layer("Chart Controls").effect("Follower Color")("Color");';

    var followerLabel = comp.layers.addText("Follower Price");
    followerLabel.name = "Follower Price Text";
    followerLabel.inPoint = 0;
    followerLabel.outPoint = COMP_DURATION;
    var followerDoc = followerLabel.property("Source Text").value;
    followerDoc.fontSize = 30;
    followerDoc.fillColor = [1, 1, 1];
    if (typeof ParagraphJustification !== "undefined") {
        followerDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
    }
    followerLabel.property("Source Text").setValue(followerDoc);
    followerLabel.property("Transform").property("Opacity").expression =
        'thisComp.layer("Chart Controls").effect("Show Follower")("Checkbox") > 0 ? 100 : 0;';
    followerLabel.property("Transform").property("Position").expression =
        'var controls = thisComp.layer("Chart Controls");\n' +
        'var left = controls.effect("Chart Left")("Slider");\n' +
        'var width = controls.effect("Chart Width")("Slider");\n' +
        'var offset = controls.effect("Follower Label Offset")("Slider");\n' +
        'var top = controls.effect("Chart Top")("Slider");\n' +
        'var priceMax = controls.effect("Price Max")("Slider");\n' +
        'var scale = controls.effect("Price Scale")("Slider");\n' +
        'var total = Math.max(1, controls.effect("Total Candles")("Slider"));\n' +
        'var cursor = clamp(controls.effect("Current Second")("Slider"), 0, total - 0.001);\n' +
        'var idx = Math.floor(cursor);\n' +
        'var frac = cursor - idx;\n' +
        'var name = "Candle_" + ("00" + (idx + 1)).slice(-3);\n' +
        'try {\n' +
        '  var candle = thisComp.layer(name);\n' +
        '  var open = candle.effect("Open")("Slider");\n' +
        '  var high = candle.effect("High")("Slider");\n' +
        '  var low = candle.effect("Low")("Slider");\n' +
        '  var close = candle.effect("Close")("Slider");\n' +
        '  var segHigh = 0.28;\n' +
        '  var segLow = 0.68;\n' +
        '  if (segHigh <= 0) segHigh = 0.25;\n' +
        '  if (segLow <= segHigh) segLow = segHigh + 0.2;\n' +
        '  var upSpan = Math.max(0.0001, segHigh);\n' +
        '  var downSpan = Math.max(0.0001, segLow - segHigh);\n' +
        '  var closeSpan = Math.max(0.0001, 1 - segLow);\n' +
        '  function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }\n' +
        '  function priceAt(p) {\n' +
        '    if (p <= 0) return open;\n' +
        '    if (p < segHigh) return lerp(open, high, p / upSpan);\n' +
        '    if (p < segLow) return lerp(high, low, (p - segHigh) / downSpan);\n' +
        '    if (p >= 1) return close;\n' +
        '    return lerp(low, close, (p - segLow) / closeSpan);\n' +
        '  }\n' +
        '  var live = priceAt(frac);\n' +
        '  var target = [left + width + offset, top + (priceMax - live) * scale];\n' +
        '  var rect = thisLayer.sourceRectAtTime(time, false);\n' +
        '  var offsetVec = [rect.left + rect.width / 2, rect.top + rect.height / 2];\n' +
        '  target - offsetVec;\n' +
        '} catch(err) {\n' +
        '  value;\n' +
        '}';
    followerLabel.property("Source Text").expression =
        'var controls = thisComp.layer("Chart Controls");\n' +
        'var doc = value;\n' +
        'var color = controls.effect("Follower Text Color")("Color");\n' +
        'doc.fillColor = [color[0], color[1], color[2]];\n' +
        'doc.applyFill = true;\n' +
        'var total = Math.max(1, controls.effect("Total Candles")("Slider"));\n' +
        'var cursor = clamp(controls.effect("Current Second")("Slider"), 0, total - 0.001);\n' +
        'var idx = Math.floor(cursor);\n' +
        'var frac = cursor - idx;\n' +
        'var name = "Candle_" + ("00" + (idx + 1)).slice(-3);\n' +
        'try {\n' +
        '  var candle = thisComp.layer(name);\n' +
        '  var open = candle.effect("Open")("Slider");\n' +
        '  var high = candle.effect("High")("Slider");\n' +
        '  var low = candle.effect("Low")("Slider");\n' +
        '  var close = candle.effect("Close")("Slider");\n' +
        '  var segHigh = 0.28;\n' +
        '  var segLow = 0.68;\n' +
        '  if (segHigh <= 0) segHigh = 0.25;\n' +
        '  if (segLow <= segHigh) segLow = segHigh + 0.2;\n' +
        '  var upSpan = Math.max(0.0001, segHigh);\n' +
        '  var downSpan = Math.max(0.0001, segLow - segHigh);\n' +
        '  var closeSpan = Math.max(0.0001, 1 - segLow);\n' +
        '  function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }\n' +
        '  function priceAt(p) {\n' +
        '    if (p <= 0) return open;\n' +
        '    if (p < segHigh) return lerp(open, high, p / upSpan);\n' +
        '    if (p < segLow) return lerp(high, low, (p - segHigh) / downSpan);\n' +
        '    if (p >= 1) return close;\n' +
        '    return lerp(low, close, (p - segLow) / closeSpan);\n' +
        '  }\n' +
        '  var live = priceAt(frac);\n' +
        '  var formatted = Number(live).toFixed(2);\n' +
        '  doc.text = "$" + formatted;\n' +
        '} catch(err) {\n' +
        '  doc.text = "$--";\n' +
        '}\n' +
        'doc;';

    var followerLabelBG = comp.layers.addShape();
    followerLabelBG.name = "Follower Price Background";
    followerLabelBG.inPoint = 0;
    followerLabelBG.outPoint = COMP_DURATION;
    followerLabelBG.property("Transform").property("Anchor Point").setValue([0, 0]);
    followerLabelBG.property("Transform").property("Opacity").expression =
        'thisComp.layer("Chart Controls").effect("Show Follower")("Checkbox") > 0 ? 100 : 0;';
    followerLabelBG.property("Transform").property("Position").expression =
        'var textLayer = thisComp.layer("Follower Price Text");\n' +
        'var rect = textLayer.sourceRectAtTime(time, false);\n' +
        'var pos = textLayer.transform.position;\n' +
        'pos + [rect.left + rect.width / 2, rect.top + rect.height / 2];';
    var followerLabelContents = followerLabelBG.property("ADBE Root Vectors Group");
    var followerLabelGroup = followerLabelContents.addProperty("ADBE Vector Group");
    followerLabelGroup.name = "Background";
    var followerLabelRect = followerLabelGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
    followerLabelRect.property("ADBE Vector Rect Roundness").setValue(6);
    followerLabelRect.property("ADBE Vector Rect Position").setValue([0, 0]);
    followerLabelRect.property("ADBE Vector Rect Size").expression =
        'var controls = thisComp.layer("Chart Controls");\n' +
        'var textLayer = thisComp.layer("Follower Price Text");\n' +
        'var padding = controls.effect("Follower Box Padding")("Slider");\n' +
        'var rect = textLayer.sourceRectAtTime(time, false);\n' +
        'var width = rect.width + padding * 2;\n' +
        'var height = rect.height + padding * 2;\n' +
        '[Math.max(width, 10), Math.max(height, 10)];';
    var followerLabelFill = followerLabelGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
    followerLabelFill.property("ADBE Vector Fill Color").expression =
        'thisComp.layer("Chart Controls").effect("Follower Color")("Color");';
    followerLabelBG.moveAfter(followerLabel);

    /**
     * Live price readout
     */
    var priceText = comp.layers.addText("Live Price");
    priceText.name = "Live Price";
    priceText.inPoint = 0;
    priceText.outPoint = COMP_DURATION;
    priceText.property("Position").expression =
        'var controls = thisComp.layer("Chart Controls");\n' +
        'var left = controls.effect("Chart Left")("Slider");\n' +
        'var width = controls.effect("Chart Width")("Slider");\n' +
        'var top = controls.effect("Chart Top")("Slider");\n' +
        '[left + width, top - 40];';
    var textDoc = priceText.property("Source Text").value;
    textDoc.fontSize = 42;
    textDoc.fillColor = [0.85, 0.92, 0.96];
    if (typeof ParagraphJustification !== "undefined") {
        textDoc.justification = ParagraphJustification.RIGHT_JUSTIFY;
    }
    priceText.property("Source Text").setValue(textDoc);
    priceText.property("Source Text").expression =
        'var controls = thisComp.layer("Chart Controls");\n' +
        'var total = controls.effect("Total Candles")("Slider");\n' +
        'var cursor = controls.effect("Current Second")("Slider");\n' +
        'var index = Math.floor(Math.min(cursor, total - 1));\n' +
        'var nextFrac = clamp(cursor - index, 0, 1);\n' +
        'var name = "Candle_" + ("00" + (index + 1)).slice(-3);\n' +
        'try {\n' +
        '  var candle = thisComp.layer(name);\n' +
        '  var open = candle.effect("Open")("Slider");\n' +
        '  var high = candle.effect("High")("Slider");\n' +
        '  var low = candle.effect("Low")("Slider");\n' +
        '  var close = candle.effect("Close")("Slider");\n' +
        '  var segHigh = 0.28;\n' +
        '  var segLow = 0.68;\n' +
        '  if (segHigh <= 0) segHigh = 0.25;\n' +
        '  if (segLow <= segHigh) segLow = segHigh + 0.2;\n' +
        '  var upSpan = Math.max(0.0001, segHigh);\n' +
        '  var downSpan = Math.max(0.0001, segLow - segHigh);\n' +
        '  var closeSpan = Math.max(0.0001, 1 - segLow);\n' +
        '  function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }\n' +
        '  function priceAt(p) {\n' +
        '    if (p <= 0) return open;\n' +
        '    if (p < segHigh) return lerp(open, high, p / upSpan);\n' +
        '    if (p < segLow) return lerp(high, low, (p - segHigh) / downSpan);\n' +
        '    if (p >= 1) return close;\n' +
        '    return lerp(low, close, (p - segLow) / closeSpan);\n' +
        '  }\n' +
        '  var live = priceAt(nextFrac);\n' +
        '  var formatted = Number(live).toFixed(2);\n' +
        '  "Live Price: " + formatted;\n' +
        '} catch(err) {\n' +
        '  "Live Price: --";\n' +
        '}';

    app.endUndoGroup();
})();
