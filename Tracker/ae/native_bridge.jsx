#include "lib.jsx"
/* Native effect entry point: address the owning layer, never the current selection. */
function SceneTrackNative(layerID,path,ids,kind,providedData){
 var layer=null,comp=null;
 for(var i=1;i<=app.project.numItems&&!layer;i++){var item=app.project.item(i);if(item instanceof CompItem)for(var j=1;j<=item.numLayers;j++)if(item.layer(j).id===layerID){layer=item.layer(j);comp=item;break;}}
 if(!layer||!layer.source||!layer.source.file)throw Error('Apply SceneTrack to a footage layer.');
 var file=File(path),readFile=file,compact=File(file.parent.fsName+'/placement.json');if(compact.exists&&compact.modified>=file.modified)readFile=compact;
 var cache=$.global.SceneTrackNativeCache,key=readFile.fsName+' '+readFile.modified.getTime(),data;if(providedData)data=SceneTrack.validate(providedData);else if(cache&&cache.key===key)data=cache.data;else{data=SceneTrack.validate(SceneTrack.read(readFile));$.global.SceneTrackNativeCache={key:key,data:data};}
 if(File(data.metadata.source).fsName!==layer.source.file.fsName)throw Error('This solve belongs to different footage. Load the matching source result.');
 if(data.models.length!==1)throw Error('The native preview currently requires a single reconstruction.');
 if(comp.width!==data.metadata.width||comp.height!==data.metadata.height||comp.pixelAspect!==1||Math.abs(comp.frameRate-data.metadata.fps)>.001)throw Error('Use a square-pixel composition matching the solved footage dimensions and frame rate.');
 if(layer.threeDLayer||layer.parent||layer.timeRemapEnabled||layer.stretch!==100)throw Error('Use an unparented 2D footage layer without time remapping or stretch.');
 var tr=layer.property('ADBE Transform Group'),position=tr.property('ADBE Position'),anchor=tr.property('ADBE Anchor Point'),scale=tr.property('ADBE Scale'),rotation=tr.property('ADBE Rotate Z');
 if(position.numKeys||anchor.numKeys||scale.numKeys||rotation.numKeys||position.expressionEnabled||anchor.expressionEnabled||scale.expressionEnabled||rotation.expressionEnabled)throw Error('Remove animated footage transforms before camera creation.');
 if(Math.abs(position.value[0]-comp.width/2)>.001||Math.abs(position.value[1]-comp.height/2)>.001||Math.abs(anchor.value[0]-comp.width/2)>.001||Math.abs(anchor.value[1]-comp.height/2)>.001||Math.abs(scale.value[0]-100)>.001||Math.abs(scale.value[1]-100)>.001||Math.abs(rotation.value)>.001)throw Error('Reset footage transforms before creating the solved camera.');
 var model=data.models[0],frame=Math.round((comp.time-layer.startTime)*data.metadata.fps),range=null;
 for(i=0;i<model.ranges.length;i++){var r=model.ranges[i];if(frame>=r[0]&&frame<=r[1]&&r[1]>r[0]){range=r;break;}}
 if(!range)throw Error('The current frame is outside a continuous solved range. Move to a solved frame.');
 var points=[];for(i=0;i<ids.length;i++)if(ids[i]>=0){for(j=0;j<model.points.length;j++)if(model.points[j].id===ids[i]){points.push(model.points[j]);break;}}
 if(kind==='solid'&&points.length!==3)throw Error('Select three points on the same physical plane.');
 if(kind==='null'&&!points.length)throw Error('Select a visible tracking point first.');
 // A selection can persist while scrubbing, but placement requires evidence on this frame.
 if(kind!=='camera'){var observed={};for(i=0;i<model.observations.length;i++)if(model.observations[i].frame===frame)for(j=0;j<model.observations[i].points.length;j++)observed[model.observations[i].points[j].id]=true;
 for(i=0;i<points.length;i++)if(!observed[points[i].id])throw Error('One selected point is not tracked at this frame. Clear the selection and choose visible points.');}
 var tag='SceneTrack native '+layerID+' '+file.fsName+' '+file.modified.getTime()+' '+range.join('-'),session=null;
 for(i=1;i<=comp.numLayers;i++){var candidate=comp.layer(i);if(candidate instanceof CameraLayer&&candidate.comment===tag&&candidate.parent){session={comp:comp,camera:candidate,root:candidate.parent,range:range};break;}}
 app.beginUndoGroup('SceneTrack - '+kind);
 try{
 if(!session){session=SceneTrack.importCamera(data,model,range,{comp:comp,startTime:layer.startTime});session.camera.comment=tag;}
 if(kind==='null')SceneTrack.createNulls(session,points);
 if(kind==='solid')SceneTrack.createSolid(session,points);
 }finally{app.endUndoGroup();}
 return 'SceneTrack '+kind+' created';
}
