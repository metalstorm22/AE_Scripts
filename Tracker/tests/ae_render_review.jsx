#target aftereffects
#targetengine "SceneTrack"
#include "../ae/lib.jsx"
(function(){
 var out={frames:[]}, dir=Folder('/Users/parthgupta/Desktop/Projects/Code Adv/AE_Scripts/Tracker/jobs/challenge-clean/ae-renders');if(!dir.exists)dir.create();
 try{var comp=app.project.activeItem;if(!(comp instanceof CompItem)||comp.name.indexOf('SceneTrack - ')!==0)throw Error('Select the SceneTrack review composition.');
 var frames=[280,300,320,340,359];out.comp=comp.name;
 for(var i=0;i<frames.length;i++){comp.saveFrameToPng(frames[i]/24,File(dir.fsName+'/'+frames[i]+'.png'));out.frames.push(frames[i]);SceneTrack.write(dir.fsName+'/status.json',out);}
 }catch(e){out.error=e.toString();SceneTrack.write(dir.fsName+'/status.json',out);}
})();
