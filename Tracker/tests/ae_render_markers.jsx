#target aftereffects
#targetengine "SceneTrack"
#include "../ae/lib.jsx"
(function(){
 var out={frames:[]}, dir=Folder('/Users/parthgupta/Desktop/Projects/Code Adv/AE_Scripts/Tracker/jobs/challenge-clean/ae-renders');if(!dir.exists)dir.create();
 try{var comp=app.project.activeItem;if(!(comp instanceof CompItem)||comp.name.indexOf('SceneTrack - ')!==0)throw Error('Select the SceneTrack review composition.');
 var points=[{"id": 10174, "position": [-2583.832681510512, -424.1187207152477, 3019.647756806164], "error_px": 2.9249960902596968, "observations": 4}, {"id": 9990, "position": [-3638.017687979685, -302.0195086884474, 2914.7516390979795], "error_px": 4.560675501710796, "observations": 9}, {"id": 9907, "position": [490.8257262686043, -600.412139039769, 3221.619086633138], "error_px": 1.6602813132464949, "observations": 3}, {"id": 10003, "position": [862.6395239856317, -646.3837011754388, 3174.704213962623], "error_px": 3.9216989219882286, "observations": 3}, {"id": 9992, "position": [1172.978490250622, -139.91184864716007, 3596.4580380943803], "error_px": 3.8047417723149586, "observations": 3}, {"id": 9950, "position": [1390.2334843298077, -988.1264972618856, 3056.5636921488663], "error_px": 2.160852782066281, "observations": 5}];for(var n=0;n<points.length;n++){var mark=comp.layers.addSolid([1,.15,.05],'Review Marker '+points[n].id,20,20,1);mark.threeDLayer=true;mark.autoOrient=AutoOrientType.CAMERA_OR_POINT_OF_INTEREST;mark.property('ADBE Transform Group').property('ADBE Position').setValue(points[n].position);}
 var frames=[280,300,320,340,359];out.comp=comp.name;
 for(var i=0;i<frames.length;i++){comp.saveFrameToPng(frames[i]/24,File(dir.fsName+'/'+frames[i]+'.png'));out.frames.push(frames[i]);SceneTrack.write(dir.fsName+'/status.json',out);}
 }catch(e){out.error=e.toString();SceneTrack.write(dir.fsName+'/status.json',out);}
})();
