/* SceneTrack host library. ExtendScript ES3; no evaluation of job JSON. */
var SceneTrack = (function () {
    function parse(text) {
        // Other AE scripts can install a global JSON polyfill whose regex replacements
        // stall on large solve files. Use our bounded parser consistently.
        var i=0;
        function ws(){while (/\s/.test(text.charAt(i)) && i<text.length)i++;}
        function str(){var out='',c,h;i++;while(i<text.length){c=text.charAt(i++);if(c==='"')return out;if(c==='\\'){c=text.charAt(i++);if(c==='u'){h=text.substr(i,4);if(!/^[0-9a-fA-F]{4}$/.test(h))throw Error('Invalid JSON escape');out+=String.fromCharCode(parseInt(h,16));i+=4;}else {var a={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};if(!a.hasOwnProperty(c))throw Error('Invalid JSON escape');out+=a[c];}}else{if(c<' ')throw Error('Invalid JSON string');out+=c;}}throw Error('Unterminated JSON');}
        function value(depth){if(depth>64)throw Error('JSON too deep');ws();var c=text.charAt(i),o,k,m;if(c==='"')return str();if(c==='{'||c==='['){var array=c==='[';o=array?[]:{};i++;ws();if(text.charAt(i)===(array?']':'}')){i++;return o;}while(true){if(array)o.push(value(depth+1));else {ws();if(text.charAt(i)!=='"')throw Error('Invalid JSON key');k=str();ws();if(text.charAt(i++)!==':')throw Error('Invalid JSON');o[k]=value(depth+1);}ws();c=text.charAt(i++);if(c===(array?']':'}'))return o;if(c!==',')throw Error('Invalid JSON');}}m=/^(true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.substr(i,512));if(!m)throw Error('Invalid JSON value');i+=m[0].length;return m[0]==='true'?true:m[0]==='false'?false:m[0]==='null'?null:Number(m[0]);}
        var result=value(0);ws();if(i!==text.length)throw Error('Invalid JSON trailing data');return result;
    }
    function stringify(v){if(v===null)return 'null';if(typeof v==='string')return '"'+v.replace(/[\\"\x00-\x1f]/g,function(c){var n=c.charCodeAt(0).toString(16);return '\\u'+('0000'+n).slice(-4);})+'"';if(typeof v==='number'){if(!isFinite(v))throw Error('Nonfinite JSON');return String(v);}if(typeof v==='boolean')return String(v);var a=[],k;if(v instanceof Array){for(k=0;k<v.length;k++)a.push(stringify(v[k]));return '['+a.join(',')+']';}for(k in v)if(v.hasOwnProperty(k))a.push(stringify(k)+':'+stringify(v[k]));return '{'+a.join(',')+'}';}
    function read(file){file=File(file);file.encoding='UTF-8';if(!file.open('r'))throw Error('Cannot read '+file.fsName);var s=file.read();file.close();return parse(s);}
    function write(file,value){file=File(file);file.encoding='UTF-8';if(!file.open('w'))throw Error('Cannot write '+file.fsName+'\nEnable Allow Scripts to Write Files and Access Network in AE preferences.');file.write(stringify(value));file.close();}
    function quote(s){return "'"+String(s).replace(/'/g,"'\\''")+"'";}
    function finiteArray(v,n){if(!(v instanceof Array)||v.length!==n)return false;for(var i=0;i<n;i++)if(typeof v[i]!=='number'||!isFinite(v[i]))return false;return true;}
    function validate(data){if(data.schema!=='scenetrack/1'||!data.metadata||!data.models||!data.models.length)throw Error('Not a SceneTrack result.');var m=data.metadata;if(!(m.width>0&&m.height>0&&m.fps>0&&m.frame_count>0))throw Error('Invalid clip metadata.');for(var j=0;j<data.models.length;j++){var model=data.models[j];for(var i=0;i<model.poses.length;i++){var p=model.poses[i];if(!finiteArray(p.position,3)||!finiteArray(p.orientation,3)||!(p.zoom>0)||!isFinite(p.zoom)||p.frame<0||p.frame>=m.frame_count)throw Error('Invalid camera pose.');}for(i=0;i<model.points.length;i++)if(!finiteArray(model.points[i].position,3))throw Error('Invalid point.');}return data;}
    function linear(prop){for(var k=1;k<=prop.numKeys;k++)prop.setInterpolationTypeAtKey(k,KeyframeInterpolationType.LINEAR,KeyframeInterpolationType.LINEAR);if(prop.isSpatial&&prop.matchName==='ADBE Position')for(k=1;k<=prop.numKeys;k++){prop.setSpatialAutoBezierAtKey(k,false);prop.setSpatialContinuousAtKey(k,false);prop.setSpatialTangentsAtKey(k,[0,0,0],[0,0,0]);}}
    function importCamera(data,model,range,target){
        validate(data);
        var meta=data.metadata,sourceFile=File(meta.source);if(!sourceFile.exists)throw Error('Reconnect the source drive before importing.');
        var times=[],positions=[],orientations=[],zooms=[],i,p;
        for(i=0;i<model.poses.length;i++){p=model.poses[i];if(p.frame>=range[0]&&p.frame<=range[1]){times.push(p.frame/meta.fps+(target?target.startTime:0));positions.push(p.position);orientations.push(p.orientation);zooms.push(p.zoom);}}
        if(times.length!==range[1]-range[0]+1)throw Error('The range contains missing camera frames. Choose a contiguous validated range.');
        app.beginUndoGroup('SceneTrack - Create Camera');
        try{
            if(!app.project)app.newProject();
            var comp;
            if(target){comp=target.comp;}else{
            var footage=app.project.importFile(new ImportOptions(sourceFile));
            comp=app.project.items.addComp('SceneTrack - '+sourceFile.displayName+' ['+range[0]+'-'+range[1]+']',meta.width,meta.height,1,meta.frame_count/meta.fps,meta.fps);
            comp.layers.add(footage);
            }
            var root=comp.layers.addNull();root.name='SceneTrack World';root.threeDLayer=true;root.property('ADBE Transform Group').property('ADBE Anchor Point').setValue([0,0,0]);root.property('ADBE Transform Group').property('ADBE Position').setValue([0,0,0]);
            var camera=comp.layers.addCamera('SceneTrack Camera',[meta.width/2,meta.height/2]);camera.autoOrient=AutoOrientType.NO_AUTO_ORIENT;
            var tr=camera.property('ADBE Transform Group');tr.property('ADBE Position').setValuesAtTimes(times,positions);tr.property('ADBE Orientation').setValuesAtTimes(times,orientations);
            camera.property('ADBE Camera Options Group').property('ADBE Camera Zoom').setValuesAtTimes(times,zooms);
            linear(tr.property('ADBE Position'));linear(tr.property('ADBE Orientation'));linear(camera.property('ADBE Camera Options Group').property('ADBE Camera Zoom'));
            camera.inPoint=range[0]/meta.fps+(target?target.startTime:0);camera.outPoint=(range[1]+1)/meta.fps+(target?target.startTime:0);camera.parent=root;
            if(!target){comp.workAreaStart=camera.inPoint;comp.workAreaDuration=camera.outPoint-camera.inPoint;comp.time=camera.inPoint;
            comp.comment='SceneTrack v0.1; model '+model.id+'; validated range '+range.join('-')+'. Arbitrary world scale. Check rendered insert stability.';
            }
            comp.openInViewer();return {comp:comp,root:root,camera:camera,range:range};
        }finally{app.endUndoGroup();}
    }
    function nulls(session,points){if(!session||!isValid(session.comp))throw Error('Create a camera first.');if(!points.length)throw Error('Select scene points in the preview first.');app.beginUndoGroup('SceneTrack - Create Nulls');try{for(var i=0;i<points.length;i++){var n=session.comp.layers.addNull();n.name='SceneTrack Point '+points[i].id;n.threeDLayer=true;n.property('ADBE Transform Group').property('ADBE Position').setValue(points[i].position);n.inPoint=session.camera.inPoint;n.outPoint=session.camera.outPoint;n.parent=session.root;}}finally{app.endUndoGroup();}}
    function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}function length(a){return Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]);}function norm(a){var n=length(a);if(n<1e-8)throw Error('Choose three separated, non-collinear points.');return [a[0]/n,a[1]/n,a[2]/n];}
    function solid(session,points){if(!session||!isValid(session.comp))throw Error('Create a camera first.');if(points.length!==3)throw Error('Select exactly three points on the same physical plane.');var a=points[0].position,b=points[1].position,c=points[2].position,ab=sub(b,a),ac=sub(c,a),span=Math.max(length(ab),length(ac));if(length(cross(ab,ac))<span*span*.001)throw Error('These points are too nearly collinear. Choose a wider triangle.');var x=norm(sub(b,a)),z=norm(cross(x,sub(c,a))),y=cross(z,x);var angle=[Math.atan2(-z[1],z[2]),Math.atan2(z[0],Math.sqrt(x[0]*x[0]+y[0]*y[0])),Math.atan2(-y[0],x[0])];for(var i=0;i<3;i++)angle[i]*=180/Math.PI;app.beginUndoGroup('SceneTrack - Create Solid');try{var layer=session.comp.layers.addSolid([.15,.6,.45],'SceneTrack Surface',200,200,1);layer.threeDLayer=true;var tr=layer.property('ADBE Transform Group');tr.property('ADBE Position').setValue([(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3]);tr.property('ADBE Orientation').setValue(angle);var scale=Math.max(length(sub(b,a)),length(sub(c,a)))/2;tr.property('ADBE Scale').setValue([scale,scale,scale]);layer.inPoint=session.camera.inPoint;layer.outPoint=session.camera.outPoint;layer.parent=session.root;}finally{app.endUndoGroup();}}
    return {parse:parse,stringify:stringify,read:read,write:write,quote:quote,validate:validate,importCamera:importCamera,createNulls:nulls,createSolid:solid};
})();
