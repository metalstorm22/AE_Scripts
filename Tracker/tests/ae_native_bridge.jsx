#target aftereffects
#include "../ae/native_bridge.jsx"
(function(){var out={};try{
 var root='/Users/parthgupta/Desktop/Projects/Code Adv/AE_Scripts/Tracker',path=root+'/jobs/challenge-clean/result.json',data=SceneTrack.read(root+'/jobs/challenge-clean/panel.json'),model=data.models[0];
 var comp=app.project.items.addComp('SceneTrack Native Placement Test',3840,2160,1,45,24);var layer=comp.layers.add(app.project.importFile(new ImportOptions(File(data.metadata.source))));layer.startTime=2;comp.time=2;comp.openInViewer();
 SceneTrack.write(root+'/jobs/native-bridge-host-test.json',{stage:'prepared',passed:false});
 var obs=model.observations[0].points,ids=[obs[0].id,obs[1].id,obs[obs.length-1].id];var start=new Date().getTime();
 SceneTrackNative(layer.id,path,ids,'camera');out.cameraMs=new Date().getTime()-start;out.layersAfterCamera=comp.numLayers;
 SceneTrackNative(layer.id,path,ids,'null');out.layersAfterNulls=comp.numLayers;
 SceneTrackNative(layer.id,path,ids,'solid');out.layersAfterSolid=comp.numLayers;
 var camera=null;for(var i=1;i<=comp.numLayers;i++)if(comp.layer(i) instanceof CameraLayer)camera=comp.layer(i);
 out.cameraIn=camera.inPoint;out.firstKey=camera.property('ADBE Transform Group').property('ADBE Orientation').keyTime(1);
 out.workAreaPreserved=comp.workAreaStart===0&&comp.workAreaDuration===45;
 var count=comp.numLayers;layer.stretch=50;try{SceneTrackNative(layer.id,path,ids,'camera');out.retimingRejected=false;}catch(e){out.retimingRejected=true;}out.noLayersOnRejection=count===comp.numLayers;layer.stretch=100;
 out.passed=out.layersAfterCamera===3&&out.layersAfterNulls===6&&out.layersAfterSolid===7&&out.cameraIn===2&&out.firstKey===2&&out.workAreaPreserved&&out.retimingRejected&&out.noLayersOnRejection;
 }catch(e){out.error=e.toString();out.line=e.line;}SceneTrack.write('/Users/parthgupta/Desktop/Projects/Code Adv/AE_Scripts/Tracker/jobs/native-bridge-host-test.json',out);
})();
