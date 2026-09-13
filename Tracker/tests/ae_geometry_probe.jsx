#target aftereffects
#include "../ae/lib.jsx"
(function(){
    app.beginUndoGroup('SceneTrack geometry verification');
    var report=[];
    try {
        var comp=app.project.items.addComp('SceneTrack - Camera Convention Test',1920,1080,1,4,24);
        var camera=comp.layers.addCamera('Camera',[960,540]);camera.autoOrient=AutoOrientType.NO_AUTO_ORIENT;
        camera.property('ADBE Camera Options Group').property('ADBE Camera Zoom').setValue(1200);
        var point=comp.layers.addNull();point.threeDLayer=true;point.name='Probe Point';
        var readout=comp.layers.addNull();readout.name='Projection Readout';
        var prop=readout.property('ADBE Transform Group').property('ADBE Position');
        prop.expression='var p=thisComp.layer("Probe Point"); var q=p.toComp(p.anchorPoint); [q[0],q[1]]';
        var cases=[{a:[0,0,0],p:[0,0,0],x:[100,50,1000]}, {a:[10,20,30],p:[30,-20,40],x:[100,50,1000]}, {a:[-20,5,-15],p:[-100,20,0],x:[-80,-70,2000]}];
        for(var i=0;i<cases.length;i++){var c=cases[i];camera.property('ADBE Transform Group').property('ADBE Position').setValue(c.p);camera.property('ADBE Transform Group').property('ADBE Orientation').setValue(c.a);point.property('ADBE Transform Group').property('ADBE Position').setValue(c.x);report.push({input:c,uv:prop.value,error:prop.expressionError});}
        SceneTrack.write(File($.fileName).parent.parent.fsName+'/jobs/ae-geometry-probe.json',report);
    } catch(e) {SceneTrack.write(File($.fileName).parent.parent.fsName+'/jobs/ae-geometry-probe.json',{error:e.toString(),line:e.line});}
    finally{app.endUndoGroup();}
})();
