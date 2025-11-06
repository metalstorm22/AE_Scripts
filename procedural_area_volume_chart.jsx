/**
 * Procedural area + volume chart generator for Adobe After Effects.
 * Builds a gradient filled price area, stacked volume bars and grid/axis labels
 * so the layout can be regenerated or tweaked by editing the numeric data below.
 *
 * Drop inside AE's Scripts folder (or run via File > Scripts > Run Script File).
 */
(function () {
    app.beginUndoGroup("Procedural Area Volume Chart");

    var COMP_WIDTH = 1920;
    var COMP_HEIGHT = 1080;
    var FRAME_RATE = 30;
    var COMP_DURATION = 12;

    if (!app.project) {
        app.newProject();
    }

    var project = app.project;
    var comp = project.items.addComp(
        "Procedural Area Volume Chart",
        COMP_WIDTH,
        COMP_HEIGHT,
        1,
        COMP_DURATION,
        FRAME_RATE
    );
    comp.bgColor = [0.05, 0.05, 0.05];

    /**
     * Simple deterministic pseudo random generator so results stay consistent.
     */
    function createRandom(seed) {
        var state = seed % 2147483647;
        if (state <= 0) {
            state += 2147483646;
        }
        return function () {
            state = (state * 16807) % 2147483647;
            return (state - 1) / 2147483646;
        };
    }

    var rand = createRandom(872917);

    // Adjust point count and ranges below to plug in real world data.
    var POINTS = 96;
    var basePrice = 112400;
    var priceValue = basePrice;
    var priceData = [];
    var volumeData = [];
    var candleDirection = [];

    var i;
    for (i = 0; i < POINTS; i += 1) {
        var drift = (i / (POINTS - 1)) * 1450;
        var shock = (rand() - 0.45) * 260;
        priceValue += drift * 0.04 + shock;
        if (priceValue < basePrice * 0.95) {
            priceValue = basePrice * 0.95;
        }
        priceData.push(priceValue);
        candleDirection.push(i === 0 ? true : priceValue >= priceData[i - 1]);

        var baseVolume = 160 + rand() * 620;
        if (i % 18 === 0) {
            baseVolume *= 1.8;
        }
        volumeData.push(baseVolume);
    }

    var minPrice = priceData[0];
    var maxPrice = priceData[0];
    for (i = 1; i < priceData.length; i += 1) {
        if (priceData[i] < minPrice) {
            minPrice = priceData[i];
        }
        if (priceData[i] > maxPrice) {
            maxPrice = priceData[i];
        }
    }

    var maxVolume = volumeData[0];
    for (i = 1; i < volumeData.length; i += 1) {
        if (volumeData[i] > maxVolume) {
            maxVolume = volumeData[i];
        }
    }

    var chartLeft = 140;
    var chartRightMargin = 160;
    var chartTop = 140;
    var chartWidth = COMP_WIDTH - chartLeft - chartRightMargin;
    var chartHeight = COMP_HEIGHT - chartTop - 260;
    var baselineY = chartTop + chartHeight;
    var priceHeight = chartHeight * 0.78;
    var volumeHeight = chartHeight * 0.36;

    /**
     * Utility to generate zero tangents for straight line segments.
     */
    function zeroTangents(count) {
        var tangents = [];
        for (var t = 0; t < count; t += 1) {
            tangents.push([0, 0]);
        }
        return tangents;
    }

    /**
     * Convenience for adding text layers with styling.
     */
    function addTextLayer(text, size, color, position, justification, tracking) {
        var layer = comp.layers.addText(text);
        var textProp = layer.property("Source Text");
        var textDoc = textProp.value;
        textDoc.fontSize = size;
        textDoc.fillColor = color;
        textDoc.applyFill = true;
        textDoc.applyStroke = false;
        textDoc.justification = justification || ParagraphJustification.LEFT_JUSTIFY;
        if (tracking !== undefined) {
            textDoc.tracking = tracking;
        }
        textProp.setValue(textDoc);
        layer.property("Transform").property("Position").setValue(position);
        layer.property("Transform").property("Anchor Point").setValue([0, 0]);
        return layer;
    }

    /**
     * Background frame with rounded corners similar to TradingView styling.
     */
    var frameLayer = comp.layers.addShape();
    frameLayer.name = "Chart Frame";
    frameLayer.property("Transform").property("Anchor Point").setValue([0, 0]);
    frameLayer.property("Transform").property("Position").setValue([0, 0]);
    var frameContents = frameLayer.property("Contents");
    var frameGroup = frameContents.addProperty("ADBE Vector Group");
    frameGroup.name = "Frame";
    var frameVectors = frameGroup.property("Contents");
    var frameRect = frameVectors.addProperty("ADBE Vector Shape - Rect");
    frameRect.property("ADBE Vector Rect Size").setValue([COMP_WIDTH - 80, COMP_HEIGHT - 80]);
    frameRect.property("ADBE Vector Rect Roundness").setValue(38);
    var frameFill = frameVectors.addProperty("ADBE Vector Graphic - Fill");
    frameFill.property("ADBE Vector Fill Color").setValue([0.05, 0.06, 0.07, 1]);
    frameFill.property("ADBE Vector Fill Opacity").setValue(100);
    var frameStroke = frameVectors.addProperty("ADBE Vector Graphic - Stroke");
    frameStroke.property("ADBE Vector Stroke Color").setValue([0.12, 0.12, 0.12, 1]);
    frameStroke.property("ADBE Vector Stroke Width").setValue(2);
    frameGroup
        .property("ADBE Vector Transform Group")
        .property("ADBE Vector Position")
        .setValue([COMP_WIDTH / 2, COMP_HEIGHT / 2]);

    /**
     * Chart grid lines (horizontal and sparse verticals).
     */
    var gridLayer = comp.layers.addShape();
    gridLayer.name = "Grid Lines";
    gridLayer.property("Transform").property("Anchor Point").setValue([0, 0]);
    gridLayer.property("Transform").property("Position").setValue([0, 0]);
    var gridContents = gridLayer.property("Contents");
    var gridColor = [0.16, 0.18, 0.2, 1];

    var horizontalSteps = 6;
    for (i = 0; i < horizontalSteps; i += 1) {
        var ratio = i / (horizontalSteps - 1);
        var lineGroup = gridContents.addProperty("ADBE Vector Group");
        lineGroup.name = "H-" + (i + 1);
        var lineVectors = lineGroup.property("Contents");
        var lineRect = lineVectors.addProperty("ADBE Vector Shape - Rect");
        lineRect.property("ADBE Vector Rect Size").setValue([chartWidth, 1.2]);
        var lineFill = lineVectors.addProperty("ADBE Vector Graphic - Fill");
        lineFill.property("ADBE Vector Fill Color").setValue(gridColor);
        lineFill.property("ADBE Vector Fill Opacity").setValue(i === 0 ? 60 : 35);
        lineGroup
            .property("ADBE Vector Transform Group")
            .property("ADBE Vector Position")
            .setValue([chartLeft + chartWidth / 2, chartTop + chartHeight * ratio]);
    }

    var verticalSteps = 7;
    for (i = 0; i < verticalSteps; i += 1) {
        var hRatio = i / (verticalSteps - 1);
        var vGroup = gridContents.addProperty("ADBE Vector Group");
        vGroup.name = "V-" + (i + 1);
        var vVectors = vGroup.property("Contents");
        var vRect = vVectors.addProperty("ADBE Vector Shape - Rect");
        vRect.property("ADBE Vector Rect Size").setValue([1, chartHeight]);
        var vFill = vVectors.addProperty("ADBE Vector Graphic - Fill");
        vFill.property("ADBE Vector Fill Color").setValue([0.12, 0.13, 0.15, 1]);
        vFill.property("ADBE Vector Fill Opacity").setValue(30);
        vGroup
            .property("ADBE Vector Transform Group")
            .property("ADBE Vector Position")
            .setValue([chartLeft + chartWidth * hRatio, chartTop + chartHeight / 2]);
    }

    /**
     * Price area path and outline.
     */
    var areaLayer = comp.layers.addShape();
    areaLayer.name = "Price Area";
    areaLayer.property("Transform").property("Anchor Point").setValue([0, 0]);
    areaLayer.property("Transform").property("Position").setValue([0, 0]);
    var areaContents = areaLayer.property("Contents");
    var areaGroup = areaContents.addProperty("ADBE Vector Group");
    areaGroup.name = "Area";
    var areaVectors = areaGroup.property("Contents");
    var areaPath = areaVectors.addProperty("ADBE Vector Shape - Group");

    var vertices = [];
    var stepX = chartWidth / (priceData.length - 1);
    vertices.push([chartLeft, baselineY]);
    for (i = 0; i < priceData.length; i += 1) {
        var normalized = (priceData[i] - minPrice) / (maxPrice - minPrice);
        var priceY = baselineY - normalized * priceHeight;
        if (priceY < chartTop + 40) {
            priceY = chartTop + 40;
        }
        vertices.push([chartLeft + stepX * i, priceY]);
    }
    vertices.push([chartLeft + chartWidth, baselineY]);

    var areaShape = new Shape();
    areaShape.vertices = vertices;
    areaShape.inTangents = zeroTangents(vertices.length);
    areaShape.outTangents = zeroTangents(vertices.length);
    areaShape.closed = true;
    areaPath.property("ADBE Vector Shape").setValue(areaShape);

    var areaFill = areaVectors.addProperty("ADBE Vector Graphic - Fill");
    areaFill.property("ADBE Vector Fill Color").setValue([0.02, 0.45, 0.22, 1]);
    areaFill.property("ADBE Vector Fill Opacity").setValue(85);

    var areaStroke = areaVectors.addProperty("ADBE Vector Graphic - Stroke");
    areaStroke.property("ADBE Vector Stroke Color").setValue([0.18, 0.75, 0.35, 1]);
    areaStroke.property("ADBE Vector Stroke Width").setValue(2.5);

    /**
     * Dotted guideline for latest price.
     */
    var priceLineLayer = comp.layers.addShape();
    priceLineLayer.name = "Price Guide";
    priceLineLayer.property("Transform").property("Anchor Point").setValue([0, 0]);
    priceLineLayer.property("Transform").property("Position").setValue([0, 0]);
    var guideContents = priceLineLayer.property("Contents");
    var guideGroup = guideContents.addProperty("ADBE Vector Group");
    guideGroup.name = "Guide";
    var guideVectors = guideGroup.property("Contents");
    var guidePath = guideVectors.addProperty("ADBE Vector Shape - Group");

    var lastPrice = priceData[priceData.length - 1];
    var lastNormalized = (lastPrice - minPrice) / (maxPrice - minPrice);
    var lastY = baselineY - lastNormalized * priceHeight;
    var guideShape = new Shape();
    guideShape.vertices = [
        [chartLeft, lastY],
        [chartLeft + chartWidth, lastY]
    ];
    guideShape.inTangents = zeroTangents(2);
    guideShape.outTangents = zeroTangents(2);
    guideShape.closed = false;
    guidePath.property("ADBE Vector Shape").setValue(guideShape);

    var guideStroke = guideVectors.addProperty("ADBE Vector Graphic - Stroke");
    guideStroke.property("ADBE Vector Stroke Color").setValue([0.06, 0.79, 0.46, 1]);
    guideStroke.property("ADBE Vector Stroke Width").setValue(2);
    guideStroke
        .property("ADBE Vector Stroke Dashes")
        .addProperty("ADBE Vector Stroke Dash 1")
        .setValue(16);
    guideStroke
        .property("ADBE Vector Stroke Dashes")
        .addProperty("ADBE Vector Stroke Gap 1")
        .setValue(12);

    /**
     * Volume bars at the bottom of the chart.
     */
    var barsLayer = comp.layers.addShape();
    barsLayer.name = "Volume Bars";
    barsLayer.property("Transform").property("Anchor Point").setValue([0, 0]);
    barsLayer.property("Transform").property("Position").setValue([0, 0]);
    var barsContents = barsLayer.property("Contents");
    var columnWidth = chartWidth / priceData.length;
    var barWidth = columnWidth * 0.55;

    for (i = 0; i < volumeData.length; i += 1) {
        var volumeRatio = volumeData[i] / maxVolume;
        var barHeight = Math.max(volumeRatio, 0.05) * volumeHeight;
        var barGroup = barsContents.addProperty("ADBE Vector Group");
        barGroup.name = "Bar_" + (i + 1);
        var barVectors = barGroup.property("Contents");
        var barRect = barVectors.addProperty("ADBE Vector Shape - Rect");
        barRect.property("ADBE Vector Rect Size").setValue([barWidth, barHeight]);
        var barFill = barVectors.addProperty("ADBE Vector Graphic - Fill");
        if (candleDirection[i]) {
            barFill.property("ADBE Vector Fill Color").setValue([0.1, 0.7, 0.36, 1]);
        } else {
            barFill.property("ADBE Vector Fill Color").setValue([0.83, 0.35, 0.24, 1]);
        }
        barFill.property("ADBE Vector Fill Opacity").setValue(88);
        barGroup
            .property("ADBE Vector Transform Group")
            .property("ADBE Vector Position")
            .setValue([
                chartLeft + columnWidth * i + columnWidth / 2,
                baselineY - barHeight / 2
            ]);
    }

    /**
     * Price labels on the right axis.
     */
    var labelStep = (maxPrice - minPrice) / 6;
    for (i = 0; i < 6; i += 1) {
        var labelValue = minPrice + labelStep * (5 - i);
        var labelY = chartTop + (chartHeight / 5) * i;
        addTextLayer(
            labelValue.toFixed(2),
            30,
            [0.58, 0.63, 0.69],
            [chartLeft + chartWidth + 40, labelY + 8],
            ParagraphJustification.RIGHT_JUSTIFY,
            50
        );
    }

    /**
     * Highlight badge for the latest price.
     */
    var badgeLayer = comp.layers.addShape();
    badgeLayer.name = "Price Badge";
    badgeLayer.property("Transform").property("Anchor Point").setValue([0, 0]);
    badgeLayer.property("Transform").property("Position").setValue([0, 0]);
    var badgeContents = badgeLayer.property("Contents");
    var badgeGroup = badgeContents.addProperty("ADBE Vector Group");
    badgeGroup.name = "Badge";
    var badgeVectors = badgeGroup.property("Contents");
    var badgeRect = badgeVectors.addProperty("ADBE Vector Shape - Rect");
    badgeRect.property("ADBE Vector Rect Size").setValue([140, 50]);
    badgeRect.property("ADBE Vector Rect Roundness").setValue(16);
    var badgeFill = badgeVectors.addProperty("ADBE Vector Graphic - Fill");
    badgeFill.property("ADBE Vector Fill Color").setValue([0.08, 0.84, 0.48, 1]);
    badgeGroup
        .property("ADBE Vector Transform Group")
        .property("ADBE Vector Position")
        .setValue([chartLeft + chartWidth + 115, lastY]);

    addTextLayer(
        lastPrice.toFixed(2),
        30,
        [0.05, 0.08, 0.09],
        [chartLeft + chartWidth + 85, lastY - 12],
        ParagraphJustification.CENTER_JUSTIFY,
        40
    );

    /**
     * Bottom axis labels (simplified time stamps).
     */
    var bottomLabels = ["30", "Oct", "2", "12:00", "3", "12:00", "5", "12:00"];
    var bottomRatios = [0.03, 0.14, 0.33, 0.45, 0.58, 0.72, 0.88, 0.97];
    for (i = 0; i < bottomLabels.length; i += 1) {
        var labelX = chartLeft + chartWidth * bottomRatios[i];
        addTextLayer(
            bottomLabels[i],
            28,
            [0.43, 0.47, 0.52],
            [labelX, baselineY + 48],
            ParagraphJustification.CENTER_JUSTIFY,
            40
        );
    }

    /**
     * Title label.
     */
    addTextLayer(
        "Synthetic Index",
        34,
        [0.76, 0.78, 0.82],
        [chartLeft, chartTop - 50],
        ParagraphJustification.LEFT_JUSTIFY,
        20
    );

    app.endUndoGroup();
})();
