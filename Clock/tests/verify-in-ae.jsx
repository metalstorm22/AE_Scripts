/* Render-queue verification. Leaves one disposable comp, never saves the project. */
(function () {
    var root=File($.fileName).parent.parent;
    var output=new Folder(root.fsName+'/verification');output.create();
    var report=[], flags=[], queue=app.project.renderQueue, item=null, started=false;
    function log(s){report.push(s);}
    try {
        $.global.TC_TEST_MODE=true;
        $.evalFile(new File(root.fsName+'/Ticking Clock.jsx'));
        $.global.TC_TEST_MODE=false;
        app.beginUndoGroup('Ticking Clock verification');started=true;
        var comp=app.project.items.addComp('TC verification - disposable',1280,400,1,8,30);
        var layer=comp.layers.addText('Clock');
        var p=layer.property('ADBE Text Properties').property('ADBE Text Document');
        var d=p.value;d.font='Menlo-Regular';d.fontSize=100;d.applyFill=true;
        d.fillColor=[1,1,1];d.applyStroke=false;d.justification=ParagraphJustification.CENTER_JUSTIFY;p.setValue(d);
        $.global.TC_API.apply(layer);$.global.TC_API.apply(layer);
        if(comp.numLayers!==1)throw new Error('Expected exactly one layer');
        if(layer.property('ADBE Effect Parade').numProperties!==$.global.TC_API.schema.length)throw new Error('Apply duplicated controls');
        function set(name,value){layer.property('ADBE Effect Parade').property('TC | '+name).property(1).setValue(value);}
        function errors(group){
            for(var n=1;n<=group.numProperties;n++){
                var v=group.property(n);
                if(v.propertyType===PropertyType.PROPERTY){if(v.expressionError)throw new Error(v.name+': '+v.expressionError);}
                else errors(v);
            }
        }
        for(var n=1;n<=queue.numItems;n++)if(queue.item(n).status===RQItemStatus.QUEUED){flags.push(queue.item(n));queue.item(n).render=false;}
        function render(label,t){
            comp.time=Math.round(t*30)/30;
            log(label+' @ '+comp.time+': '+p.value.text);
            item=queue.items.add(comp);item.timeSpanStart=comp.time;item.timeSpanDuration=1/30;
            item.outputModule(1).applyTemplate('JPEG');
            item.outputModule(1).file=new File(output.fsName+'/'+label+'_[#####].jpg');
            queue.render();
            if(item.status!==RQItemStatus.DONE)throw new Error('Render did not complete: '+label);
            item.remove();item=null;errors(layer);
        }
        set('Time / Start time (sec)',43199);set('Display / AM / PM',1);
        render('before-noon',0);render('rolling-noon',1.1);render('after-noon',1.8);
        set('Display / Show seconds',0);render('no-seconds',1.8);
        set('Time / Start time (sec)',0);set('Time / Speed',-1);set('Display / Show seconds',1);
        render('countdown-roll',1.1);render('countdown-settled',1.8);
        set('Motion / Move up',1);render('upward-roll',1.1);
        set('Colons / Show colons',0);render('no-colons',1.8);
        var duplicate=layer.duplicate();duplicate.name='Renamed clock';errors(duplicate);duplicate.remove();
        set('Time / Start time (sec)',36525);set('Time / Speed',1);set('Motion / Move up',0);set('Colons / Show colons',1);
        comp.time=0;comp.openInViewer();layer.selected=true;
        log('PASS on After Effects '+app.version+': one layer, repeated apply, expressions, duplication, eight render-queue samples.');
        log('JPEG samples require visual inspection. saveFrameToPng showed unreliable static glyph clipping in this environment and is not used for acceptance.');
    }catch(e){log('FAIL: '+e.toString()+' line '+e.line);}
    finally{
        $.global.TC_TEST_MODE=false;
        if(item){try{item.remove();}catch(_){}}
        for(var n=0;n<flags.length;n++)flags[n].render=true;
        if(started)app.endUndoGroup();
        var file=new File(output.fsName+'/report.txt');file.open('w');file.write(report.join('\n'));file.close();
    }
})();
