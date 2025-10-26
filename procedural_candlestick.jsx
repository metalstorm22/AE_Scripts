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
    var gridContents = gridLayer.property("ADBE Root Vectors Group");
    var gridGroup = gridContents.addProperty("ADBE Vector Group");
    gridGroup.name = "Grid";
    var gridRect = gridGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
    gridRect.property("ADBE Vector Rect Size").setValue([chartWidth, chartHeight]);
    gridRect.property("ADBE Vector Rect Position").setValue([0, 0]);
    var gridStroke = gridGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");
    gridStroke.property("ADBE Vector Stroke Color").setValue([0.2, 0.26, 0.35, 1]);
    gridStroke.property("ADBE Vector Stroke Width").setValue(2);
    var gridTransform = gridGroup.property("ADBE Vector Transform Group");
    gridTransform.property("ADBE Vector Position").setValue([chartLeft + chartWidth / 2, chartTop + chartHeight / 2]);

    // horizontal guides
    var gridLinesGroup = gridContents.addProperty("ADBE Vector Group");
    gridLinesGroup.name = "Guides";
    var gridLines = gridLinesGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
    gridLines.property("ADBE Vector Rect Size").setValue([chartWidth, 1]);
    gridLines.property("ADBE Vector Rect Position").setValue([0, 0]);
    var guideStroke = gridLinesGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
    guideStroke.property("ADBE Vector Fill Color").setValue([0.15, 0.18, 0.24, 1]);
    var guideTransform = gridLinesGroup.property("ADBE Vector Transform Group");
    guideTransform.property("ADBE Vector Position").setValue([chartLeft + chartWidth / 2, chartTop + chartHeight / 2]);
    guideTransform.property("ADBE Vector Scale").setValue([100, 100]);

    // duplicate guide stripes
    var guideRepeater = gridLinesGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Repeater");
    if (guideRepeater) {
        guideRepeater.property("ADBE Vector Repeater Copies").setValue(5);
        var repeaterTransform = guideRepeater.property("ADBE Vector Repeater Transform");
        if (repeaterTransform) {
            var repeaterPosition = repeaterTransform.property("ADBE Vector Position");
            if (repeaterPosition) {
                repeaterPosition.setValue([0, chartHeight / 5]);
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
    addSlider(controls, "Chart Left", chartLeft);
    addSlider(controls, "Candle Width", candleWidth);
    addSlider(controls, "Candle Gap", candleGap);
    addSlider(controls, "Price Min", minPrice);
    addSlider(controls, "Price Max", maxPrice);
    addSlider(controls, "Price Scale", priceScale);
    addColorControl(controls, "Bull Color", [0.1, 0.7, 0.35, 1]);
    addColorControl(controls, "Bear Color", [0.85, 0.2, 0.28, 1]);
    addColorControl(controls, "Wick Color", [0.9, 0.9, 0.95, 1]);

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
            'var close = thisLayer.effect("Close")("Slider");\n' +
            'var high = thisLayer.effect("High")("Slider");\n' +
            'var low = thisLayer.effect("Low")("Slider");\n' +
            'var priceMax = controls.effect("Price Max")("Slider");\n' +
            'var px = controls.effect("Price Scale")("Slider");\n' +
            'var liveClose = open + (close - open) * progress;\n' +
            'var baseHigh = Math.max(open, liveClose);\n' +
            'var baseLow = Math.min(open, liveClose);\n' +
            'var liveHigh = baseHigh + (Math.max(high, baseHigh) - baseHigh) * progress;\n' +
            'var liveLow = baseLow + (Math.min(low, baseLow) - baseLow) * progress;\n' +
            'var highY = (priceMax - liveHigh) * px;\n' +
            'var lowY = (priceMax - liveLow) * px;\n' +
            '[0, (highY + lowY) / 2];';
        wickShape.property("ADBE Vector Rect Size").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var idx = thisLayer.effect("Candle Index")("Slider");\n' +
            'var current = controls.effect("Current Second")("Slider");\n' +
            'var progress = clamp(current - idx, 0, 1);\n' +
            'var open = thisLayer.effect("Open")("Slider");\n' +
            'var close = thisLayer.effect("Close")("Slider");\n' +
            'var high = thisLayer.effect("High")("Slider");\n' +
            'var low = thisLayer.effect("Low")("Slider");\n' +
            'var px = controls.effect("Price Scale")("Slider");\n' +
            'var liveClose = open + (close - open) * progress;\n' +
            'var baseHigh = Math.max(open, liveClose);\n' +
            'var baseLow = Math.min(open, liveClose);\n' +
            'var liveHigh = baseHigh + (Math.max(high, baseHigh) - baseHigh) * progress;\n' +
            'var liveLow = baseLow + (Math.min(low, baseLow) - baseLow) * progress;\n' +
            'var height = Math.max(2, Math.abs(liveHigh - liveLow) * px);\n' +
            'var width = Math.max(1, thisComp.layer("Chart Controls").effect("Candle Width")("Slider") * 0.18);\n' +
            '[width, height];';

        var wickFill = wickGroupLayer.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        wickFill.property("ADBE Vector Fill Color").expression =
            'thisComp.layer("Chart Controls").effect("Wick Color")("Color");';

        // Body group
        var bodyGroupLayer = candleContents.addProperty("ADBE Vector Group");
        bodyGroupLayer.name = "Body";
        var bodyShape = bodyGroupLayer.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        bodyShape.property("ADBE Vector Rect Roundness").setValue(6);
        bodyShape.property("ADBE Vector Rect Position").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var idx = thisLayer.effect("Candle Index")("Slider");\n' +
            'var current = controls.effect("Current Second")("Slider");\n' +
            'var progress = clamp(current - idx, 0, 1);\n' +
            'var open = thisLayer.effect("Open")("Slider");\n' +
            'var close = thisLayer.effect("Close")("Slider");\n' +
            'var priceMax = controls.effect("Price Max")("Slider");\n' +
            'var px = controls.effect("Price Scale")("Slider");\n' +
            'var liveClose = open + (close - open) * progress;\n' +
            'var openY = (priceMax - open) * px;\n' +
            'var closeY = (priceMax - liveClose) * px;\n' +
            '[0, (openY + closeY) / 2];';
        bodyShape.property("ADBE Vector Rect Size").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var idx = thisLayer.effect("Candle Index")("Slider");\n' +
            'var current = controls.effect("Current Second")("Slider");\n' +
            'var progress = clamp(current - idx, 0, 1);\n' +
            'var open = thisLayer.effect("Open")("Slider");\n' +
            'var close = thisLayer.effect("Close")("Slider");\n' +
            'var px = controls.effect("Price Scale")("Slider");\n' +
            'var width = controls.effect("Candle Width")("Slider");\n' +
            'var liveClose = open + (close - open) * progress;\n' +
            'var height = Math.max(2, Math.abs(liveClose - open) * px);\n' +
            '[width, height];';

        var bodyFill = bodyGroupLayer.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        bodyFill.property("ADBE Vector Fill Color").expression =
            'var controls = thisComp.layer("Chart Controls");\n' +
            'var idx = thisLayer.effect("Candle Index")("Slider");\n' +
            'var current = controls.effect("Current Second")("Slider");\n' +
            'var progress = clamp(current - idx, 0, 1);\n' +
            'var open = thisLayer.effect("Open")("Slider");\n' +
            'var close = thisLayer.effect("Close")("Slider");\n' +
            'var liveClose = open + (close - open) * progress;\n' +
            'var bull = controls.effect("Bull Color")("Color");\n' +
            'var bear = controls.effect("Bear Color")("Color");\n' +
            '(liveClose >= open) ? bull : bear;';
    }

    /**
     * Live price readout
     */
    var priceText = comp.layers.addText("Live Price");
    priceText.name = "Live Price";
    priceText.inPoint = 0;
    priceText.outPoint = COMP_DURATION;
    priceText.property("Position").setValue([chartRight, chartTop - 40]);
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
        'var candle = thisComp.layer(name);\n' +
        'var open = candle.effect("Open")("Slider");\n' +
        'var close = candle.effect("Close")("Slider");\n' +
        'var interim = open + (close - open) * nextFrac;\n' +
        'var rounded = Math.round(interim * 100) / 100;\n' +
        '"Live Price: " + rounded;';

    app.endUndoGroup();
})();
