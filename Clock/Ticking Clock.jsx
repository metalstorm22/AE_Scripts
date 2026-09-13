/* Ticking Clock 4.1 | Single text layer | After Effects 2020+
   Run via File > Scripts > Run Script File, or install in ScriptUI Panels.
   Native expression controls + text animators; no external runtime dependency.
*/
(function (host) {
    var PREFIX = "TC | ";
    var schema = [
        ["Time", "Start time (sec)", "slider", 36525, -86400000, 86400000],
        ["Time", "Speed", "slider", 1, -100, 100],
        ["Time", "Manual", "check", 0],
        ["Time", "Manual time (sec)", "slider", 36525, -86400000, 86400000],
        ["Display", "Show seconds", "check", 1],
        ["Display", "24-hour", "check", 1],
        ["Display", "AM / PM", "check", 0],
        ["Display", "Leading hour zero", "check", 1],
        ["Display", "Tracking", "slider", 0, -500, 2000],
        ["Motion", "Duration (sec)", "slider", 0.32, 0, 2],
        ["Motion", "Travel (px)", "slider", 90, 0, 2000],
        ["Motion", "Move up", "check", 0],
        ["Motion", "Cascade (sec)", "slider", 0.025, 0, 0.15],
        ["Colons", "Show colons", "check", 1],
        ["Colons", "Pulse", "check", 1],
        ["Colons", "Minimum opacity (%)", "slider", 35, 0, 100],
        ["Colons", "Pulse rate (Hz)", "slider", 1, 0, 20]
    ];
    function fxName(s) { return PREFIX + s[0] + " / " + s[1]; }
    // Kept self-contained: the expression does not refer to a layer name or panel.
    function clockCore() {
        function c(group, name) { return effect("TC | " + group + " / " + name)(1).value; }
        function mod(n, m) { return ((n % m) + m) % m; }
        function pad(n) { return n < 10 ? "0" + n : "" + n; }
        var manual = c("Time", "Manual") > 0.5;
        var rate = c("Time", "Speed");
        var total = manual ? c("Time", "Manual time (sec)") :
            c("Time", "Start time (sec)") + Math.max(0, time - inPoint) * rate;
        if (manual) {
            var dt = Math.min(thisComp.frameDuration, 0.01);
            rate = (total - effect("TC | Time / Manual time (sec)")(1).valueAtTime(time - dt)) / dt;
        }
        var dir = rate < 0 ? -1 : 1;
        var tick = dir > 0 ? Math.floor(total + 1e-7) : Math.ceil(total - 1e-7);
        var seconds = c("Display", "Show seconds") > 0.5;
        // AM/PM implies a 12-hour display even if the 24-hour checkbox is on.
        var suffix = c("Display", "AM / PM") > 0.5;
        function format(n) {
            var h = mod(Math.floor(n / 3600), 24);
            var m = mod(Math.floor(n / 60), 60);
            var s = mod(n, 60);
            var hh = (suffix || c("Display", "24-hour") < 0.5) ? (h % 12 || 12) : h;
            // Figure space retains the hours column when the zero is hidden.
            var hours = hh < 10 ? (c("Display", "Leading hour zero") > 0.5 ? "0" : "\u2007") + hh : "" + hh;
            return hours + ":" + pad(m) + (seconds ? ":" + pad(s) : "") +
                (suffix ? (h < 12 ? " AM" : " PM") : "");
        }
        var current = format(tick), previous = format(tick - dir);
        var phase = dir > 0 ? total - tick : tick - total;
        var speed = Math.abs(rate);
        var cycle = speed > 1e-6 ? 1 / speed : 1;
        var age = Math.max(0, phase) / Math.max(1e-6, speed);
        var duration = Math.max(0, c("Motion", "Duration (sec)"));
        return {c:c, current:current, previous:previous, age:age, cycle:cycle,
            active:time > inPoint + 1e-6 && speed > 1e-6 && duration > 0,
            duration:duration, seconds:seconds};
    }
    function characterState(k, i) {
        var ch = k.current.charAt(i);
        var rank = i === 0 ? 5 : i === 1 ? 4 : i === 3 ? 3 : i === 4 ? 2 : i === 6 ? 1 : 0;
        if (!k.seconds) rank = Math.max(0, rank - 2);
        var delay = Math.min(k.cycle * 0.12, Math.max(0, k.c("Motion", "Cascade (sec)"))) * rank;
        var dur = Math.min(k.duration, Math.max(0.000001, k.cycle * 0.98 - delay));
        var u = k.active ? Math.max(0, Math.min(1, (k.age - delay) / dur)) : 1;
        var changed = k.active && ch !== k.previous.charAt(i);
        // Two eased halves: fade old out, replace at zero opacity, fade new in.
        var incoming = u >= 0.5;
        var half = incoming ? (u - 0.5) * 2 : u * 2;
        var p = half * half * (3 - 2 * half);
        return {ch:ch, changed:changed, incoming:incoming, p:p,
            glyph:changed && !incoming ? k.previous.charAt(i) : ch};
    }
    var core = clockCore.toString() + "\n" + characterState.toString() + "\nvar k=clockCore();\n";
    var expressions = {
        source: core + "var result='';\nfor(var i=0;i<k.current.length;i++) result+=characterState(k,i).glyph;\nresult;"
    };
    // Emit the same tested calculations inline for AE expression selectors.
    var inlineClock = clockCore.toString();
    inlineClock = inlineClock.substring(inlineClock.indexOf("{")+1,inlineClock.lastIndexOf("return {c:c"));
    var inlineCharacter = characterState.toString();
    inlineCharacter = inlineCharacter.substring(inlineCharacter.indexOf("{")+1,inlineCharacter.lastIndexOf("return {ch:ch"));
    inlineCharacter = inlineCharacter.replace(/k\./g, "");
    var selectorCode = inlineClock + "\nvar active=time>inPoint+0.000001 && speed>0.000001 && duration>0;\nvar i=textIndex-1;\n" + inlineCharacter;
    expressions.position = selectorCode + "\nvar moveDir=c('Motion','Move up')>0.5?-1:1;\n" +
        "changed ? moveDir*(incoming?-(1-p):p)*100 : 0;";
    expressions.opacity = selectorCode + "\nvar alpha=changed?(incoming?p:1-p):1;\n" +
        "if(ch===':'){\nalpha=c('Colons','Show colons')>0.5?1:0;\n" +
        "if(c('Colons','Pulse')>0.5){\nvar low=Math.max(0,Math.min(100,c('Colons','Minimum opacity (%)')))/100;\n" +
        "alpha*=low+(1-low)*(0.5+0.5*Math.cos(2*Math.PI*Math.max(0,time-inPoint)*Math.max(0,c('Colons','Pulse rate (Hz)'))));\n" +
        "}}\n(1-alpha)*100;";
    // Keep temporary names out of AE's layer-property scope. A selector can also
    // be queried outside character evaluation: use a neutral amount in that case.
    function safeSelector(code) {
        var split=code.lastIndexOf("\n")+1;
        return "(function(tcIndex){\ntry {\n" +
            "if(typeof tcIndex !== 'number' || !isFinite(tcIndex) || tcIndex < 1) return 0;\n" +
            code.substring(0,split).replace(/\btextIndex\b/g,"tcIndex") +
            "var tcAmount=" + code.substring(split) +
            "\nreturn isFinite(tcAmount) ? tcAmount : 0;\n" +
            "} catch(tcError) { return 0; }\n})(textIndex);";
    }
    expressions.position=safeSelector(expressions.position);
    expressions.opacity=safeSelector(expressions.opacity);
    function textProp(layer) { return layer.property("ADBE Text Properties").property("ADBE Text Document"); }
    function installed(layer) { return !!layer.property("ADBE Effect Parade").property(fxName(schema[0])); }
    function selected() {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem) || comp.selectedLayers.length !== 1 || !(comp.selectedLayers[0] instanceof TextLayer))
            throw new Error("Select exactly one text layer in the active composition.");
        return comp.selectedLayers[0];
    }
    function addAnimator(layer, name, match, value, propertyExpression, selectorExpression) {
        var a = layer.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
        a.name = PREFIX + name;
        var p = a.property("ADBE Text Animator Properties").addProperty(match);
        if (propertyExpression) p.expression = propertyExpression;
        else p.setValue(value);
        var selectors = a.property("ADBE Text Selectors");
        var selector = selectors.addProperty("ADBE Text Expressible Selector");
        selector.property("ADBE Text Expressible Amount").expression = selectorExpression;
    }
    function apply(layer) {
        if (installed(layer)) { ensureTracking(layer); return; }
        var source = textProp(layer);
        if (source.expression || source.numKeys > 0)
            throw new Error("This layer already has animated Source Text. Apply to a fresh text layer to preserve that animation.");
        if (source.value.boxText)
            throw new Error("Use point text: a paragraph text box can wrap the clock. Create a text layer with a single click, then apply.");
        if (layer.property("ADBE Text Properties").property("ADBE Text Animators").numProperties > 0)
            throw new Error("This layer already has text animators. Apply to a fresh text layer to preserve their appearance.");
        var fx = layer.property("ADBE Effect Parade");
        var made = [];
        try {
            for (var i = 0; i < schema.length; i++) {
                var def = schema[i];
                var f = fx.addProperty(def[2] === "check" ? "ADBE Checkbox Control" : "ADBE Slider Control");
                f.name = fxName(def); made.push(f.name);
                f.property(1).setValue(def[3]);
            }
            source.expression = expressions.source;
            addAnimator(layer, "Roll", "ADBE Text Position 3D", null,
                "[0,Math.max(0,effect('TC | Motion / Travel (px)')(1)),0];", expressions.position);
            addAnimator(layer, "Fade and colons", "ADBE Text Opacity", 0, null, expressions.opacity);
            ensureTracking(layer);
            if (source.expressionError) throw new Error(source.expressionError);
        } catch (err) {
            // Restore the original text; only remove objects owned by this apply.
            source.expression = "";
            var aa = layer.property("ADBE Text Properties").property("ADBE Text Animators");
            for (var j = aa.numProperties; j >= 1; j--) if (aa.property(j).name.indexOf(PREFIX) === 0) aa.property(j).remove();
            for (var n = made.length - 1; n >= 0; n--) if (fx.property(made[n])) fx.property(made[n]).remove();
            throw err;
        }
    }
    function ensureTracking(layer) {
        var effects=layer.property("ADBE Effect Parade");
        var effectName=PREFIX+"Display / Tracking";
        var createdEffect=false;
        try {
            if(!effects.property(effectName)) {
                var control=effects.addProperty("ADBE Slider Control");
                control.name=effectName;control.property(1).setValue(0);createdEffect=true;
            }
            var animators=layer.property("ADBE Text Properties").property("ADBE Text Animators");
            if(!animators.property(PREFIX+"Tracking")) {
                addAnimator(layer,"Tracking","ADBE Text Tracking Amount",null,
                    "effect('TC | Display / Tracking')(1);","100;");
            }
        } catch(error) {
            if(createdEffect && effects.property(effectName)) effects.property(effectName).remove();
            throw error;
        }
    }
    // Explicit hook for the companion verification script; normal runs show UI.
    if (typeof TC_TEST_MODE !== "undefined" && TC_TEST_MODE) {
        $.global.TC_API = {apply:apply, schema:schema, expressions:expressions, clockCore:clockCore, characterState:characterState};
        return;
    }
    if (!(host instanceof Panel)) {
        var previousWindow=Window.find("palette","Ticking Clock");
        if(previousWindow) previousWindow.close();
    }
    var win = host instanceof Panel ? host : new Window("palette", "Ticking Clock", undefined, {resizeable:true});
    win.orientation = "column"; win.alignChildren = ["fill", "top"]; win.spacing = 10; win.margins = 14;
    var title = win.add("statictext", undefined, "TICKING CLOCK  /  4.1");
    var toolbar = win.add("group"); toolbar.alignment = ["fill","top"];
    var applyButton = toolbar.add("button", undefined, "Apply to text");
    var createButton = toolbar.add("button", undefined, "New clock");
    var refreshButton = toolbar.add("button", undefined, "Refresh");
    var status = win.add("statictext", undefined, "Select a text layer, then Apply."); status.characters = 42;
    var tabs = win.add("tabbedpanel"); tabs.alignChildren = ["fill","top"]; tabs.preferredSize = [360,310];
    var groups = {}, widgets = [];
    var descriptions = {
        Time:"Start accepts HH:MM:SS or seconds. Negative speed counts down.",
        Display:"Tracking adds spacing in 1/1000 em. Font and color: Character panel.",
        Motion:"Only changing digits roll. Duration 0 disables rolling.",
        Colons:"Pulse runs in composition time, independent of clock speed."
    };
    function guarded(fn) {
        return function () {
            app.beginUndoGroup("Ticking Clock");
            try { fn(); } catch (e) { alert("Ticking Clock\n\n" + e.toString()); }
            finally { app.endUndoGroup(); }
        };
    }
    function readLayer() {
        var l = selected();
        if (!installed(l)) throw new Error("Apply Ticking Clock to this text layer first.");
        return l;
    }
    function refresh() {
        var l;
        try { l = readLayer(); } catch (_) { status.text = "Select a clock layer, then Refresh."; return; }
        for (var i = 0; i < widgets.length; i++) {
            var w = widgets[i], p = l.property("ADBE Effect Parade").property(fxName(w.def));
            if (!p) throw new Error("Clock controls are missing. Undo the deletion or apply to a fresh layer.");
            var val = p.property(1).valueAtTime(l.containingComp.time, false);
            if (w.def[2] === "check") w.input.value = val > 0.5;
            else if (w.def[1] === "Start time (sec)" && val >= 0 && val === Math.floor(val)) {
                var h = Math.floor(val / 3600), m = Math.floor(val / 60) % 60, s = val % 60;
                w.input.text = (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
            } else w.input.text = "" + Math.round(val * 1000) / 1000;
        }
        status.text = l.name;
    }
    function bind(def, input) {
        var handler = guarded(function () {
            var l = readLayer();
            var value = def[2] === "check" ? (input.value ? 1 : 0) : Number(input.text);
            if (def[1] === "Start time (sec)" && input.text.indexOf(":") >= 0) {
                var match = /^\s*(\d+):([0-5]\d):([0-5]\d)\s*$/.exec(input.text);
                if (!match) throw new Error("Enter a start time such as 10:08:45, or a number of seconds.");
                value = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
            }
            if (!isFinite(value) || (def[2] !== "check" && input.text.replace(/\s/g, "") === "")) throw new Error("Enter a number for " + def[1] + ".");
            if (def[2] !== "check") value = Math.max(def[4],Math.min(def[5],value));
            var p = l.property("ADBE Effect Parade").property(fxName(def)).property(1);
            if (p.expressionEnabled) throw new Error("This control has an expression. Edit it in Effect Controls.");
            if (p.numKeys) p.setValueAtTime(l.containingComp.time,value); else p.setValue(value);
            refresh();
        });
        if(def[2] === "check") input.onClick=handler;
        else input.onChange=handler;
    }
    for (var i = 0; i < schema.length; i++) {
        var def = schema[i], tab = groups[def[0]];
        if (!tab) {
            tab = tabs.add("tab", undefined, def[0]); tab.orientation = "column"; tab.alignChildren = ["fill","top"]; tab.margins = 12;
            groups[def[0]] = tab;
        }
        var row = tab.add("group"); row.alignChildren = ["left","center"];
        var input;
        if (def[2] === "check") { input = row.add("checkbox", undefined, def[1]); input.value = def[3] > 0; }
        else {
            var label = row.add("statictext", undefined, def[1] === "Start time (sec)" ? "Start time" : def[1]); label.preferredSize.width = 170;
            input = row.add("edittext", undefined, def[1] === "Start time (sec)" ? "10:08:45" : ""+def[3]); input.characters = 10;
        }
        widgets.push({def:def,input:input}); bind(def,input);
    }
    for (var group in groups) if (groups.hasOwnProperty(group)) {
        var note = groups[group].add("statictext", undefined, descriptions[group], {multiline:true}); note.preferredSize = [320,42];
    }
    var foot = win.add("statictext", undefined, "Move / scale: layer Transform. Keyframes: Effect Controls.", {multiline:true});
    foot.preferredSize.height = 30;
    applyButton.onClick = guarded(function () { apply(selected()); refresh(); });
    createButton.onClick = guarded(function () {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) throw new Error("Open a composition first.");
        var l = comp.layers.addText("00:00:00"); l.name = "Ticking Clock";
        try {
            var d = textProp(l).value; d.font = "Menlo-Regular"; d.fontSize = 120;
            d.applyFill = true; d.fillColor = [1,1,1]; d.applyStroke = false;
            d.justification = ParagraphJustification.CENTER_JUSTIFY; textProp(l).setValue(d);
            apply(l);
            for (var n = 1; n <= comp.numLayers; n++) comp.layer(n).selected = false;
            l.selected = true; refresh();
        } catch (err) { l.remove(); throw err; }
    });
    refreshButton.onClick = guarded(refresh);
    tabs.selection = groups.Time;
    win.onResizing = win.onResize = function () { this.layout.resize(); };
    win.layout.layout(true);
    if (win instanceof Window) { win.center(); win.show(); }
})(this);
