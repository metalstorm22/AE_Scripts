"""Build a self-contained AE review import and actual host projection probe."""
import argparse
import json
from pathlib import Path
import sys
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'worker'))
from geometry import project

parser=argparse.ArgumentParser();parser.add_argument('--job',required=True);args=parser.parse_args()
job=Path(args.job).resolve();root=Path(__file__).resolve().parents[1]
data=json.loads((job/'result.json').read_text());m=data['models'][0];interval=max(m['ranges'],key=lambda r:r[1]-r[0]);poses=[p for p in m['poses'] if interval[0]<=p['frame']<=interval[1]]
points={p['id']:p for p in m['points']};observations={o['frame']:o['points'] for o in m['observations']};checks=[]
for index in np.linspace(0,len(poses)-1,5,dtype=int):
 p=poses[index];K=np.array([[p['zoom'],0,data['metadata']['width']/2],[0,p['zoom'],data['metadata']['height']/2],[0,0,1]])
 for o in observations[p['frame']][:4]:
  pt=points[o['id']];uv,depth=project(np.array([pt['position']])/1000,p['R'],p['t'],K)
  checks.append(dict(frame=p['frame'],position=pt['position'],expected=uv[0].tolist()))
minimal=dict(schema=data['schema'],metadata=data['metadata'],warnings=data['warnings'],models=[dict(id=m['id'],poses=poses,points=m['points'][:12],ranges=[interval])])
code='#target aftereffects\n'+(root/'ae/lib.jsx').read_text()+'\n(function(){\nvar data='+json.dumps(minimal,separators=(',',':'))+';\nvar checks='+json.dumps(checks)+';\nvar output='+json.dumps(str(job/'ae-host-check.json'))+';\n'
code+='''var report={passed:false,checks:[],maxErrorPx:0};
try {
var session=SceneTrack.importCamera(data,data.models[0],data.models[0].ranges[0]);
SceneTrack.createNulls(session,data.models[0].points);
app.beginUndoGroup('SceneTrack projection verification');
try {
var point=session.comp.layers.addNull();point.threeDLayer=true;point.name='SceneTrack Projection Probe';point.enabled=false;
var readout=session.comp.layers.addNull();readout.enabled=false;
var prop=readout.property('ADBE Transform Group').property('ADBE Position');
prop.expression='var p=thisComp.layer("SceneTrack Projection Probe");var q=p.toComp(p.anchorPoint);[q[0],q[1]]';
for(var i=0;i<checks.length;i++){var c=checks[i];session.comp.time=c.frame/data.metadata.fps;point.property('ADBE Transform Group').property('ADBE Position').setValue(c.position);var uv=prop.value;var dx=uv[0]-c.expected[0],dy=uv[1]-c.expected[1];var error=Math.sqrt(dx*dx+dy*dy);report.maxErrorPx=Math.max(report.maxErrorPx,error);report.checks.push({frame:c.frame,expected:c.expected,actual:uv,errorPx:error,expressionError:prop.expressionError});}
point.remove();readout.remove();session.comp.time=session.camera.inPoint;
report.passed=report.maxErrorPx<0.1&&report.checks.length===checks.length;for(var k=0;k<report.checks.length;k++){if(report.checks[k].expressionError||!isFinite(report.checks[k].errorPx))report.passed=false;}
}finally{app.endUndoGroup();}
} catch(e){report.error=e.toString();report.line=e.line;}
SceneTrack.write(output,report);
alert(report.passed?'SceneTrack review camera created. Host projection check passed. Inspect insert stability before production use.':'SceneTrack host check did not pass. See ae-host-check.json; do not approve this camera yet.');
})();
'''
out=job/'Import Camera Review.jsx';out.write_text(code);print(out)
