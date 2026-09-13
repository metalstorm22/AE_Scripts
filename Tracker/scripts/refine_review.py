"""Experimental robust, gauge-fixed refinement; never replaces the original result."""
import json,sys,os,time
from pathlib import Path
import pycolmap as c
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'worker'))
from solve import Job,export_model,atomic_json
src=Path(sys.argv[1]).resolve();dst=Path(sys.argv[2]).resolve();dst.mkdir(exist_ok=True)
for name in ['config.json','metadata.json']:(dst/name).write_bytes((src/name).read_bytes())
for folder in ['frames','images','masks']:
 (dst/folder).mkdir(exist_ok=True)
 for p in (src/folder).iterdir():
  if not (dst/folder/p.name).exists():os.link(p,dst/folder/p.name)
old=json.loads((src/'result.json').read_text());r=c.Reconstruction(str(src/'models'/str(old['models'][0]['id'])))
o=c.BundleAdjustmentOptions();o.refine_focal_length=False;o.refine_extra_params=False;o.ceres.loss_function_type=c.LossFunctionType.SOFT_L1;o.ceres.loss_function_scale=1.;o.ceres.auto_select_solver_type=False
opt=o.ceres.solver_options;opt.linear_solver_type=type(opt.linear_solver_type).ITERATIVE_SCHUR;opt.preconditioner_type=type(opt.preconditioner_type).SCHUR_JACOBI;opt.num_threads=6;opt.max_num_iterations=100;opt.max_solver_time_in_seconds=180;opt.function_tolerance=1e-7
cfg=c.BundleAdjustmentConfig()
for i in r.reg_image_ids():cfg.add_image(i)
cfg.fix_gauge(c.BundleAdjustmentGauge.THREE_POINTS)
start=time.monotonic();adjuster=c.create_default_bundle_adjuster(o,cfg,r);summary=adjuster.solve();report={'seconds':time.monotonic()-start,'summary':str(summary),'solver':'ITERATIVE_SCHUR','fixed_focal':True,'gauge':'THREE_POINTS'}
print(report,flush=True);(dst/'refinement.json').write_text(json.dumps(report))
(dst/'models').mkdir(exist_ok=True);r.write(str(dst/'models'))
j=Job(dst);meta=json.loads((dst/'metadata.json').read_text());m=export_model(j,meta,r,0)
if m is None:raise RuntimeError('Refinement did not pass per-frame checks')
warnings=['Experimental robust refinement, fixed to the previous estimated focal length. Not independent camera ground truth.','Host and visual insert validation pending.']
atomic_json(dst/'result.json',dict(schema='scenetrack/1',metadata=meta,models=[m],warnings=warnings,engine='COLMAP robust gauge-fixed refinement + PnP',ai=old['ai']))
print(m['summary'],m['ranges'],flush=True)
