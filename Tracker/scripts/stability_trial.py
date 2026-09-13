"""Experimental temporal camera fit. Explicitly not independent ground-truth validation."""
import json,sys,time
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
from scipy.sparse import lil_matrix
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'worker'))
from geometry import camera_to_ae
src=Path(sys.argv[1]);out=Path(sys.argv[2]);strength=float(sys.argv[3]) if len(sys.argv)>3 else .5
out.mkdir(exist_ok=True);d=json.loads((src/'result.json').read_text());m=d['models'][0];interval=max(m['ranges'],key=lambda r:r[1]-r[0]);poses=[p for p in m['poses'] if interval[0]<=p['frame']<=interval[1]];n=len(poses)
pointmap={p['id']:np.array(p['position'])/1000 for p in m['points']};obs={o['frame']:o['points'] for o in m['observations']}
R=np.array([p['R'] for p in poses]);C=np.array([p['position'] for p in poses])/1000
scale=np.median([np.linalg.norm(x-C[0]) for x in pointmap.values()]);C/=scale
x0=np.column_stack([Rotation.from_matrix(R).as_rotvec(),C]);idx=[];xyz=[];uv=[];held=[]
for i,p in enumerate(poses):
 rows=obs[p['frame']];rows=rows[::max(1,len(rows)//80)]
 for k,o in enumerate(rows):
  idx.append(i);xyz.append(pointmap[o['id']]/scale);uv.append(np.array(o['uv'])*.25);held.append(k%5==0)
idx=np.array(idx);xyz=np.array(xyz);uv=np.array(uv);held=np.array(held);train=~held
f=poses[0]['zoom']*.25;pp=np.array([d['metadata']['width'],d['metadata']['height']])*.125

def predictions(x):
 x=x.reshape(n,6);rot=Rotation.from_rotvec(x[:,:3]).as_matrix();q=np.einsum('nij,nj->ni',rot[idx],xyz-x[idx,3:]);z=np.maximum(q[:,2],1e-4);return f*q[:,:2]/z[:,None]+pp

def residual(x):
 rows=x.reshape(n,6);data=(predictions(rows)-uv)[train].ravel();smooth=np.diff(rows,n=2,axis=0)*f*strength
 return np.concatenate([data,smooth.ravel()])
numtrain=int(train.sum());sparse=lil_matrix((numtrain*2+(n-2)*6,n*6),dtype=np.int8)
for j,i in enumerate(idx[train]):sparse[j*2:j*2+2,i*6:i*6+6]=1
for i in range(n-2):
 for k in range(6):
  for t in range(3):sparse[numtrain*2+i*6+k,(i+t)*6+k]=1
started=time.monotonic();fit=least_squares(residual,x0.ravel(),jac_sparsity=sparse.tocsr(),method='trf',loss='soft_l1',f_scale=1.,max_nfev=30,ftol=1e-5,xtol=1e-5)
x=fit.x.reshape(n,6);pred=predictions(x);before=predictions(x0)

def stats(x):
 rot=Rotation.from_rotvec(x[:,:3]);delta=(rot[1:]*rot[:-1].inv()).as_rotvec();return dict(rotation_step_deg=np.percentile(np.linalg.norm(delta,axis=1)*180/np.pi,[50,95,99,100]).tolist(),rotation_accel_deg=np.percentile(np.linalg.norm(np.diff(delta,axis=0),axis=1)*180/np.pi,[50,95,99,100]).tolist())
report=dict(strength=strength,seconds=time.monotonic()-started,success=bool(fit.success),message=fit.message,before=stats(x0),after=stats(x),heldout_before_px=np.percentile(np.linalg.norm(before[held]-uv[held],axis=1)*4,[50,95,99]).tolist(),heldout_after_px=np.percentile(np.linalg.norm(pred[held]-uv[held],axis=1)*4,[50,95,99]).tolist(),caveat='Held-out only from this pose refit. Geometry and correspondence selection were previously fitted; not independent truth.')
rot=Rotation.from_rotvec(x[:,:3]).as_matrix()
for i,p in enumerate(poses):
 t=-rot[i]@(x[i,3:]*scale);p['R']=rot[i].tolist();p['t']=t.tolist();p['position'],p['orientation']=camera_to_ae(rot[i],t)
for frame in m['observations']:
 if interval[0]<=frame['frame']<=interval[1]:
  p=poses[frame['frame']-interval[0]];rr=np.array(p['R']);tt=np.array(p['t'])
  for o in frame['points']:
   q=rr@pointmap[o['id']]+tt;o['projected']=(q[:2]/q[2]*p['zoom']+pp*4).tolist()
angles=np.degrees(np.unwrap(np.radians([p['orientation'] for p in poses]),axis=0))
for p,a in zip(poses,angles):p['orientation']=a.tolist()
d['warnings'].append('EXPERIMENTAL temporal regularization. May suppress real handheld motion. Host/visual acceptance pending; original summary metrics are pre-refit.')
d['temporal_trial']=report
(out/'result.json').write_text(json.dumps(d));(out/'stability.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
