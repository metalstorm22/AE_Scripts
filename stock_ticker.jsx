/**
 * Stock Ticker Builder
 * Creates a looping stock ticker bar with per-symbol coloring (green for gains, red for losses)
 * and continuously scrolling animation driven by slider controls.
 *
 * Drop this file into After Effects' Scripts folder (or run via File > Scripts > Run Script File)
 * to generate the ticker inside the active project.
 */
(function stockTickerBuilder() {
    var SCRIPT_NAME = "Stock Ticker Builder";

    var COMP_SETTINGS = {
        name: "Live Stock Ticker",
        width: 1920,
        height: 180,
        duration: 120,
        frameRate: 30
    };

    var TICKER_OPTIONS = {
        font: "ArialMT",
        fontSize: 64,
        tracking: 20,
        gap: 140,
        scrollSpeed: 260,
        rightPadding: 220,
        backgroundColor: [0.078, 0.094, 0.118],
        strokeColor: [0.173, 0.2, 0.241],
        positiveColor: [0.301, 0.784, 0.412],
        negativeColor: [0.851, 0.305, 0.298],
        neutralColor: [0.75, 0.75, 0.75]
    };

    var TICKER_DATA = [
        {symbol: "AAPL", price: 190.95, change: 0.95, percent: 0.0050},
        {symbol: "MSFT", price: 398.00, change: -2.00, percent: -0.0050},
        {symbol: "NVDA", price: 126.00, change: 6.00, percent: 0.0500},
        {symbol: "AMZN", price: 180.00, change: 0.00, percent: 0.0000},
        {symbol: "GOOGL", price: 151.50, change: 1.50, percent: 0.0100},
        {symbol: "TSLA", price: 242.50, change: -7.50, percent: -0.0300},
        {symbol: "META", price: 510.00, change: 10.00, percent: 0.0200},
        {symbol: "JPM", price: 149.25, change: -0.75, percent: -0.0050},
        {symbol: "JNJ", price: 163.20, change: 3.20, percent: 0.0200},
        {symbol: "BRK.B", price: 430.00, change: 0.00, percent: 0.0000},
        {symbol: "SPY", price: 502.50, change: 2.50, percent: 0.0050},
        {symbol: "V", price: 268.65, change: -1.35, percent: -0.0050},
        {symbol: "AMD", price: 111.10, change: 1.10, percent: 0.0100},
        {symbol: "NFLX", price: 582.00, change: -18.00, percent: -0.0300}
    ];

    if (!TICKER_DATA.length) {
        alert("Stock Ticker Builder: No ticker data supplied.");
        return;
    }

    function addSlider(layer, name, value) {
        var effectGroup = layer.property("ADBE Effect Parade");
        if (!effectGroup) {
            throw new Error("Unable to access the Effects group on layer: " + layer.name);
        }
        var effect = effectGroup.addProperty("ADBE Slider Control");
        if (!effect) {
            throw new Error("Failed to add slider control: " + name);
        }
        effect.name = name;
        var slider = effect.property("ADBE Slider Control-0001");
        if (!slider) {
            throw new Error("Slider parameter missing on effect: " + name);
        }
        slider.setValue(value);
        return slider;
    }

    function formatTicker(item, includeBullet) {
        var arrow = "";
        if (item.change > 0) {
            arrow = "▲";
        } else if (item.change < 0) {
            arrow = "▼";
        }

        var priceText = item.price.toFixed(2);
        var deltaAbs = Math.abs(item.change).toFixed(2);
        var changeText;
        if (arrow !== "") {
            changeText = arrow + deltaAbs;
        } else {
            changeText = deltaAbs;
        }

        var percentAbs = Math.abs(item.percent * 100).toFixed(2);
        var percentPrefix = "";
        if (item.percent > 0) {
            percentPrefix = "+";
        } else if (item.percent < 0) {
            percentPrefix = "-";
        }
        var percentText = "(" + percentPrefix + percentAbs + "%)";

        var label = item.symbol + " " + priceText + " " + changeText + " " + percentText;
        if (includeBullet) {
            label += " •";
        }
        return label;
    }

    app.beginUndoGroup(SCRIPT_NAME);
    try {
        if (!app.project) {
            app.newProject();
        }

        var project = app.project;
        var comp = project.items.addComp(
            COMP_SETTINGS.name,
            COMP_SETTINGS.width,
            COMP_SETTINGS.height,
            1,
            COMP_SETTINGS.duration,
            COMP_SETTINGS.frameRate
        );
        comp.bgColor = TICKER_OPTIONS.backgroundColor;

        var backgroundLayer = comp.layers.addShape();
        backgroundLayer.name = "Ticker Background";
        var contents = backgroundLayer.property("Contents");
        var container = contents.addProperty("ADBE Vector Group");
        container.name = "Background";
        var shapes = container.property("Contents");
        var rectShape = shapes.addProperty("ADBE Vector Shape - Rect");
        rectShape.property("ADBE Vector Rect Size").setValue([COMP_SETTINGS.width, COMP_SETTINGS.height]);
        rectShape.property("ADBE Vector Rect Position").setValue([0, 0]);
        var fill = shapes.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([
            TICKER_OPTIONS.backgroundColor[0],
            TICKER_OPTIONS.backgroundColor[1],
            TICKER_OPTIONS.backgroundColor[2],
            TICKER_OPTIONS.backgroundColor.length > 3 ? TICKER_OPTIONS.backgroundColor[3] : 1
        ]);
        var stroke = shapes.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("ADBE Vector Stroke Color").setValue([
            TICKER_OPTIONS.strokeColor[0],
            TICKER_OPTIONS.strokeColor[1],
            TICKER_OPTIONS.strokeColor[2],
            TICKER_OPTIONS.strokeColor.length > 3 ? TICKER_OPTIONS.strokeColor[3] : 1
        ]);
        stroke.property("ADBE Vector Stroke Width").setValue(4);
        backgroundLayer.moveToEnd();

        var controlLayer = comp.layers.addNull();
        controlLayer.name = "Ticker Controller";
        controlLayer.label = 9; // light green for visibility
        controlLayer.property("ADBE Transform Group").property("Position").setValue([0, 0]);

        var speedControl = addSlider(controlLayer, "Scroll Speed (px/s)", TICKER_OPTIONS.scrollSpeed);
        var startOffsetControl = addSlider(controlLayer, "Start Offset", 0);
        var cycleControl = addSlider(controlLayer, "Cycle Width", 1);
        var rightEdge = COMP_SETTINGS.width + TICKER_OPTIONS.rightPadding;
        var rightEdgeControl = addSlider(controlLayer, "Right Edge", rightEdge);
        var baselineControl = addSlider(controlLayer, "Baseline Y", COMP_SETTINGS.height / 2);

        var totalWidth = 0;

        for (var i = 0; i < TICKER_DATA.length; i++) {
            var includeBullet = i !== TICKER_DATA.length - 1;
            var label = formatTicker(TICKER_DATA[i], includeBullet);

            var textLayer = comp.layers.addText(label);
            textLayer.name = TICKER_DATA[i].symbol + " Quote";
            textLayer.moveBefore(controlLayer);

            var textProp = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
            var textDocument = textProp.value;
            textDocument.font = TICKER_OPTIONS.font;
            textDocument.fontSize = TICKER_OPTIONS.fontSize;
            textDocument.applyFill = true;
            if (TICKER_DATA[i].change > 0) {
                textDocument.fillColor = TICKER_OPTIONS.positiveColor;
            } else if (TICKER_DATA[i].change < 0) {
                textDocument.fillColor = TICKER_OPTIONS.negativeColor;
            } else {
                textDocument.fillColor = TICKER_OPTIONS.neutralColor;
            }
            textDocument.applyStroke = false;
            textDocument.tracking = TICKER_OPTIONS.tracking;
            if (typeof ParagraphJustification !== "undefined") {
                textDocument.justification = ParagraphJustification.LEFT_JUSTIFY;
            }
            textProp.setValue(textDocument);

            var rect = textLayer.sourceRectAtTime(0, false);
            textLayer.property("ADBE Transform Group").property("Anchor Point").setValue([
                rect.left,
                rect.top + rect.height / 2
            ]);
            textLayer.property("ADBE Transform Group").property("Position").setValue([
                rightEdge - totalWidth,
                COMP_SETTINGS.height / 2
            ]);

            var baseOffset = addSlider(textLayer, "Base Offset", totalWidth);
            baseOffset.setValue(totalWidth);

            var expression =
                'var ctrl = thisComp.layer("Ticker Controller");\n' +
                'var speed = ctrl.effect("Scroll Speed (px/s)")("Slider");\n' +
                'var span = Math.max(1, ctrl.effect("Cycle Width")("Slider"));\n' +
                'var rightEdge = ctrl.effect("Right Edge")("Slider");\n' +
                'var baseline = ctrl.effect("Baseline Y")("Slider");\n' +
                'var start = ctrl.effect("Start Offset")("Slider");\n' +
                'var base = effect("Base Offset")("Slider");\n' +
                'var travel = (base + start + speed * time) % span;\n' +
                'if (travel < 0) travel += span;\n' +
                'var x = rightEdge - travel;\n' +
                '[x, baseline];';
            textLayer.property("ADBE Transform Group").property("Position").expression = expression;

            var entryWidth = rect.width + TICKER_OPTIONS.gap;
            totalWidth += entryWidth;
        }

        cycleControl.setValue(totalWidth);

        comp.openInViewer();
    } catch (err) {
        var message = SCRIPT_NAME + " error: " + err.toString();
        if (err.line) {
            message += " (line " + err.line + ")";
        }
        alert(message);
    } finally {
        app.endUndoGroup();
    }
})();
