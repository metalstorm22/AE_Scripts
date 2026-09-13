#!/usr/bin/env python3
"""SceneTrack local worker. No cloud inference. Never modifies source footage."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import traceback
import cv2
import numpy as np
import pycolmap as colmap
from geometry import camera_to_ae, project, solve_pnp, contiguous_ranges
from panel_data import pack as pack_panel

ROOT = Path(__file__).resolve().parents[1]


def atomic_json(path, data):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, allow_nan=False), encoding='utf8')
    os.replace(tmp, path)


class Job:
    def __init__(self, path):
        self.path = Path(path).resolve()
        self.config = json.loads((self.path/'config.json').read_text())
        self.token = colmap.CancellationToken()
        self.start = time.monotonic()
        self.warnings = []
        threading.Thread(target=self.watch_cancel, daemon=True).start()

    def watch_cancel(self):
        while not self.token.is_cancelled:
            if (self.path/'cancel').exists():
                self.token.cancel()
                return
            time.sleep(.25)

    def check(self):
        if self.token.is_cancelled or (self.path/'cancel').exists():
            raise InterruptedError('Cancelled')

    def status(self, stage, progress, message, **extra):
        self.check()
        atomic_json(self.path/'status.json', dict(stage=stage, progress=progress,
            message=message, elapsed=round(time.monotonic()-self.start, 1), warnings=self.warnings, **extra))


def prepare(job):
    cfg = job.config
    source = Path(cfg['source'])
    if not source.is_file():
        raise ValueError('Source footage is unavailable. Reconnect its drive and retry.')
    cap = cv2.VideoCapture(str(source))
    if not cap.isOpened():
        raise ValueError('Cannot decode the selected footage.')
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    start, end = int(cfg.get('start_frame', 0)), int(cfg.get('end_frame', count-1))
    if not 0 <= start < end < count or fps <= 0:
        raise ValueError('Invalid source frame range or frame rate.')
    if cfg.get('fps') and abs(cfg['fps']-fps) > .01:
        raise ValueError('The composition and footage frame rates must match.')
    stride = max(1, int(cfg.get('stride', 4)))
    factor = min(1.0, int(cfg.get('width', 960))/w)
    pw, ph = int(round(w*factor)), int(round(h*factor))
    names = []
    for folder in ['frames','images','masks','ai_masks','models']:
        (job.path/folder).mkdir(exist_ok=True)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    gamma = float(cfg.get('gamma', 1.8))
    if not .5 <= gamma <= 4:
        raise ValueError('Gamma must be between 0.5 and 4.')
    lut = np.uint8(np.clip((np.arange(256)/255.)**(1/gamma)*255, 0, 255))
    samples = []
    for frame in range(start, end+1):
        job.check()
        ok, rgb = cap.read()
        if not ok:
            raise ValueError(f'Decoding stopped at frame {frame}; no solve was published.')
        rgb = cv2.resize(rgb, (pw,ph), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(rgb, cv2.COLOR_BGR2GRAY)
        if frame == start:
            # Black borders are excluded, not cropped: principal point stays in source coordinates.
            visible_rows = np.flatnonzero(np.mean(gray > 3, axis=1) > .08)
            y0, y1 = (int(visible_rows[0]), int(visible_rows[-1])+1) if len(visible_rows) else (0, ph)
        if len(samples) < 50:
            samples.append(float(np.median(gray[y0:y1])))
        enhanced = cv2.LUT(rgb, lut)
        lab = cv2.cvtColor(enhanced, cv2.COLOR_BGR2LAB)
        lab[:,:,0] = clahe.apply(lab[:,:,0])
        enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        name = f'{frame:06d}.jpg'
        cv2.imwrite(str(job.path/'frames'/name), enhanced, [cv2.IMWRITE_JPEG_QUALITY, 96])
        if (frame-start)%stride == 0 or frame == end:
            names.append(name)
            os.link(job.path/'frames'/name, job.path/'images'/name)
        if (frame-start)%24 == 0:
            job.status('prepare', 2+13*(frame-start)/(end-start), f'Preparing frame {frame-start+1} / {end-start+1}')
    cap.release()
    meta = dict(source=str(source), width=w, height=h, proxy_width=pw, proxy_height=ph,
        fps=fps, start_frame=start, end_frame=end, frame_count=count, active_rows=[y0,y1],
        scale_x=pw/w, scale_y=ph/h, stride=stride, keyframes=len(names))
    meta['config_hash'] = hashlib.sha256(json.dumps(cfg,sort_keys=True).encode()).hexdigest()
    if np.median(samples) < 25:
        job.warnings.append('Very dark footage: enhancement reveals recorded detail but cannot restore missing texture.')
    atomic_json(job.path/'metadata.json', meta)
    return meta, names


def masks(job, meta, names):
    cfg = job.config
    backend = cfg.get('mask_backend', 'vision')
    if cfg.get('ai_masks', True) and backend == 'sam2':
        metrics_path = job.path/'sam_metrics.json'
        from sam_masks import input_hash
        expected_hash = input_hash(cfg)
        cached_metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else {}
        sam_cached = cached_metrics.get('sam_input_hash') == expected_hash and cached_metrics.get('frames') == len(names) and all((job.path/'sam_masks'/(n+'.png')).exists() for n in names)
        if not sam_cached:
            with (job.path/'sam.log').open('w') as log:
                proc = subprocess.Popen([sys.executable,str(ROOT/'worker/sam_masks.py'),'--job',str(job.path)],stdout=log,stderr=log)
                try:
                    while proc.poll() is None:
                        job.check()
                        n = len(list((job.path/'sam_masks').glob('*.png')))
                        job.status('mask',15+15*n/len(names),f'SAM subject masks: {n} / {len(names)}')
                        time.sleep(.5)
                except BaseException:
                    proc.terminate()
                    proc.wait()
                    raise
                if proc.returncode != 0:
                    raise ValueError('SAM masking failed. See sam.log. Try a smaller range or disable SAM explicitly.')
        metrics = json.loads(metrics_path.read_text())
        if metrics.get('empty_frames') and not cfg.get('guard_prompt_boxes'):
            raise ValueError('SAM lost the subject on some frames. Inspect masks and solve shorter ranges with a fresh subject box.')
        if cfg.get('guard_prompt_boxes'):
            job.warnings.append('Conservative prompt-box exclusions are enabled between corrections. Review that these envelopes contain the moving subject; SAM alone lost the subject on '+str(len(metrics.get('empty_frames',[])))+' sampled frames.')
    cached = all((job.path/'ai_masks'/(n+'.png')).exists() for n in names)
    if cfg.get('ai_masks', True) and not cached:
        helper = ROOT/'build/masker'
        if not helper.exists():
            raise ValueError('Apple Vision helper is missing. Run scripts/setup.sh before using AI masks.')
        with (job.path/'masker.log').open('w') as log:
            proc = subprocess.Popen([str(helper), str(job.path/'images'), str(job.path/'ai_masks')], stdout=log, stderr=log)
            try:
                while proc.poll() is None:
                    job.check()
                    n = len(list((job.path/'ai_masks').glob('*.png')))
                    base,span = (30,5) if backend=='sam2' else (15,20)
                    job.status('mask', base+span*n/len(names), f'AI people and text masks: {n} / {len(names)}')
                    time.sleep(.5)
            except BaseException:
                proc.terminate()
                proc.wait()
                raise
            if proc.returncode != 0:
                raise ValueError('Apple Vision masking failed; inspect masker.log. AI masking was not silently skipped.')
    pw, ph = meta['proxy_width'], meta['proxy_height']
    y0, y1 = meta['active_rows']
    areas = []
    for name in names:
        mask = np.full((ph,pw), 255, np.uint8)
        mask[:y0+3] = 0
        mask[max(y0,y1-int(ph*.025)):] = 0  # burn-in strip / bottom letterbox
        mask[:,:3] = 0
        mask[:,-3:] = 0
        if cfg.get('ai_masks', True):
            ai = cv2.imread(str(job.path/'ai_masks'/(name+'.png')), 0)
            if ai is None:
                raise ValueError('A requested AI mask is missing.')
            excluded = np.uint8(ai > 35)*255
            excluded = cv2.dilate(excluded, np.ones((17,17), np.uint8))
            mask[excluded > 0] = 0
            if backend == 'sam2':
                sam = cv2.imread(str(job.path/'sam_masks'/(name+'.png')),0)
                if sam is None or sam.shape != mask.shape:
                    raise ValueError('A SAM mask is missing or has incorrect dimensions.')
                # Tracking needs conservative exclusions, not a rotoscoping edge.
                # Fill segmentation holes so face/clothing cannot leak into SfM.
                yy,xx = np.where(sam > 0)
                if len(xx) >= 3:
                    cv2.fillConvexPoly(sam,cv2.convexHull(np.column_stack([xx,yy]).astype(np.int32)),255)
                mask[cv2.dilate(sam,np.ones((17,17),np.uint8)) > 0] = 0
                if cfg.get('guard_prompt_boxes') and int(Path(name).stem)<=cfg.get('subject_end_frame',meta['end_frame']):
                    prompts={int(k):v for k,v in cfg.get('sam_prompts',{}).items()}
                    prompts.setdefault(meta['start_frame'],cfg['sam_box'])
                    frames=sorted(prompts)
                    f=int(Path(name).stem)
                    a=max((k for k in frames if k<=f),default=frames[0])
                    b=min((k for k in frames if k>=f),default=frames[-1])
                    mix=0 if a==b else (f-a)/(b-a)
                    rect=np.array(prompts[a])*(1-mix)+np.array(prompts[b])*mix
                    x0,b0,x1,b1=rect
                    mask[max(0,int(b0*ph)-8):min(ph,int(math.ceil(b1*ph))+8),max(0,int(x0*pw)-8):min(pw,int(math.ceil(x1*pw))+8)]=0
        for box in cfg.get('exclude_rects', []):
            x0,b0,x1,b1 = box
            mask[int(b0*ph):int(math.ceil(b1*ph)),int(x0*pw):int(math.ceil(x1*pw))] = 0
        areas.append(float(np.mean(mask == 0)))
        cv2.imwrite(str(job.path/'masks'/(name+'.png')), mask)
    atomic_json(job.path/'mask_summary.json', dict(ai_enabled=cfg.get('ai_masks',True),backend=backend,
        excluded_fraction_median=float(np.median(areas)), excluded_fraction_max=float(max(areas))))


def reconstruct(job, meta, names):
    database = job.path/'features.db'
    reader = colmap.ImageReaderOptions()
    reader.camera_model = 'SIMPLE_PINHOLE'
    reader.mask_path = str(job.path/'masks')
    focal = job.config.get('focal_px')
    if focal:
        reader.camera_params = f"{float(focal)*meta['scale_x']},{meta['proxy_width']/2},{meta['proxy_height']/2}"
    reader.default_focal_length_factor = 1.2
    extraction = colmap.FeatureExtractionOptions()
    extraction.num_threads = 6
    extraction.sift.max_num_features = 6000
    extraction.sift.peak_threshold = .003
    job.status('features', 36, 'Finding background features outside exclusion masks')
    colmap.extract_features(database, job.path/'images', image_names=names,
        camera_mode=colmap.CameraMode.SINGLE, reader_options=reader,
        extraction_options=extraction, device=colmap.Device.cpu, cancellation_token=job.token)
    job.check()
    pairing = colmap.SequentialPairingOptions()
    pairing.overlap = 12
    pairing.quadratic_overlap = True
    matching = colmap.FeatureMatchingOptions()
    matching.num_threads = 6
    matching.guided_matching = True
    job.status('match', 45, 'Matching background features across time')
    colmap.match_sequential(database, matching_options=matching, pairing_options=pairing,
        device=colmap.Device.cpu, cancellation_token=job.token)
    job.check()
    options = colmap.IncrementalPipelineOptions()
    options.num_threads = 6
    options.random_seed = 7
    options.min_model_size = 5
    options.max_num_models = 6
    options.init_num_trials = 100
    options.ignore_watermarks = True
    options.mapper.init_min_num_inliers = 35
    options.mapper.init_min_tri_angle = 2.0
    options.mapper.abs_pose_min_num_inliers = 20
    options.mapper.filter_max_reproj_error = 2.0
    options.mapper.filter_min_tri_angle = 1.0
    options.triangulation.min_angle = 1.0
    options.ba_refine_focal_length = not bool(focal)
    options.mapper.abs_pose_refine_focal_length = not bool(focal)
    options.ba_refine_extra_params = False
    options.mapper.abs_pose_refine_extra_params = False
    options.max_runtime_seconds = int(job.config.get('max_solve_seconds', 600))
    job.status('solve', 55, 'Solving camera and 3D points; testing geometric consistency')
    registered = [0]
    def on_registered():
        job.check()
        registered[0] += 1
        job.status('solve',55,'Solving camera: '+str(registered[0])+' registration steps')
    maps = colmap.incremental_mapping(database, job.path/'images', job.path/'models', options=options,
        next_image_callback=on_registered, cancellation_token=job.token)
    job.check()
    if not maps:
        raise ValueError('No defensible 3D reconstruction. Try a shorter range with visible background detail, add exclusion masks, or supply a focal length. No camera was invented.')
    return maps


def export_model(job, meta, reconstruction, model_id):
    points = reconstruction.points3D
    good = {int(i): p for i,p in points.items() if p.error < 2.0 and p.track.length() >= 3}
    if len(good) < 20:
        return None
    keyframes = {}
    for image in reconstruction.images.values():
        if not image.has_pose:
            continue
        pose = image.cam_from_world()
        camera = reconstruction.cameras[image.camera_id]
        K = camera.calibration_matrix()
        obs = [(int(p.point3D_id),p.xy) for p in image.points2D if p.has_point3D() and int(p.point3D_id) in good]
        if len(obs) < 12:
            continue
        frame = int(Path(image.name).stem)
        keyframes[frame] = dict(R=pose.rotation.matrix(),t=pose.translation,K=K,obs=obs)
    if len(keyframes) < 3:
        return None
    start,end = min(keyframes),max(keyframes)
    poses, overlay = [], []
    keyids = sorted(keyframes)
    last_gray = None
    last_key = None
    proxy_points = {i: p.xyz for i,p in good.items()}
    for frame in range(start,end+1):
        job.check()
        # Estimate every frame, including held-out frames, from reconstructed scene points.
        # Never interpolate over an unregistered gap or glue disconnected reconstructions.
        key = min(keyids,key=lambda x: abs(x-frame))
        if abs(key-frame) > meta['stride']:
            continue
        ref = keyframes[key]
        if last_key != key:
            last_gray = cv2.imread(str(job.path/'frames'/f'{key:06d}.jpg'),0)
            last_key = key
        current = cv2.imread(str(job.path/'frames'/f'{frame:06d}.jpg'),0)
        ids = np.array([o[0] for o in ref['obs']])
        source_uv = np.float32([o[1] for o in ref['obs']])
        if frame == key:
            uv, keep = source_uv, np.ones(len(ids),bool)
        else:
            target,st,_ = cv2.calcOpticalFlowPyrLK(last_gray,current,source_uv,None,winSize=(31,31),maxLevel=4)
            back,st2,_ = cv2.calcOpticalFlowPyrLK(current,last_gray,target,None,winSize=(31,31),maxLevel=4)
            keep = (st.ravel()>0)&(st2.ravel()>0)&(np.linalg.norm(back-source_uv,axis=1)<.8)
            uv = target
        ids,uv = ids[keep],uv[keep]
        # Conservatively union the exclusion masks bracketing this source frame,
        # so an LK track cannot move onto a foreground object between keyframes.
        offset = (frame-meta['start_frame'])//meta['stride']*meta['stride']+meta['start_frame']
        bracket = {offset,min(offset+meta['stride'],meta['end_frame'])}
        usable = np.ones(len(ids),bool)
        for mask_frame in bracket:
            frame_mask = cv2.imread(str(job.path/'masks'/f'{mask_frame:06d}.jpg.png'),0)
            if frame_mask is None:
                raise ValueError('Missing frame exclusion mask during camera validation.')
            x,y = np.rint(uv).astype(int).T
            valid = (x>=0)&(x<meta['proxy_width'])&(y>=0)&(y<meta['proxy_height'])
            allowed = np.zeros(len(ids),bool)
            allowed[valid] = frame_mask[y[valid],x[valid]]>0
            usable &= allowed
        ids,uv=ids[usable],uv[usable]
        xyz = np.array([proxy_points[int(i)] for i in ids])
        solution = solve_pnp(xyz,uv,ref['K'],ref['R'],ref['t'])
        if solution is None:
            continue
        R,t,ii,errors = solution
        projected, _ = project(xyz[ii],R,t,ref['K'])
        hull = cv2.convexHull(np.float32(uv[ii]))
        coverage = cv2.contourArea(hull)/(meta['proxy_width']*meta['proxy_height'])
        if coverage < .015:
            continue
        position,orientation = camera_to_ae(R,t)
        row = dict(frame=frame,time=frame/meta['fps'],position=position,orientation=orientation,
            zoom=float(ref['K'][0,0]/meta['scale_x']),inliers=len(ii),
            error_px=float(np.median(errors)/meta['scale_x']),coverage=coverage,
            method='registered' if frame in keyframes else 'held_out_pnp',
            R=R.tolist(),t=t.tolist())
        poses.append(row)
        overlay.append(dict(frame=frame,points=[dict(id=int(ids[i]),uv=(uv[i]/[meta['scale_x'],meta['scale_y']]).tolist(),
            projected=(projected[k]/[meta['scale_x'],meta['scale_y']]).tolist()) for k,i in enumerate(ii)]))
        if frame%24 == 0:
            job.status('validate', 75+20*(frame-start)/max(1,end-start),f'Validating source frame {frame}; model {model_id}')
    if len(poses) < 5:
        return None
    held = [p['error_px'] for p in poses if p['method']=='held_out_pnp']
    rows = []
    for i,p in sorted(good.items(),key=lambda x:(-x[1].track.length(),x[1].error)):
        rows.append(dict(id=i,position=(p.xyz*1000).tolist(),error_px=float(p.error/meta['scale_x']),observations=p.track.length()))
    angles = np.degrees(np.unwrap(np.radians([p['orientation'] for p in poses]),axis=0))
    for p,a in zip(poses,angles):
        p['orientation'] = a.tolist()
    ranges = contiguous_ranges([p['frame'] for p in poses])
    return dict(id=model_id,poses=poses,points=rows,observations=overlay,ranges=ranges,
        summary=dict(solved_frames=len(poses),registered_keyframes=len(keyframes),points=len(good),
            median_error_px=float(np.median([p['error_px'] for p in poses])),
            held_out_median_error_px=float(np.median(held)) if held else None,
            coverage_fraction=len(poses)/(meta['end_frame']-meta['start_frame']+1)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', required=True)
    parser.add_argument('--resume', action='store_true', help='Reuse prepared frames only if configuration is unchanged')
    args = parser.parse_args()
    job = Job(args.job)
    cv2.setNumThreads(4)
    cv2.setRNGSeed(7)
    try:
        job.status('prepare',0,'Reading footage')
        if args.resume:
            meta = json.loads((job.path/'metadata.json').read_text())
            digest = hashlib.sha256(json.dumps(job.config,sort_keys=True).encode()).hexdigest()
            if meta.get('config_hash') != digest:
                raise ValueError('Configuration changed. Start a new job instead of reusing cached frames.')
            names = sorted(p.name for p in (job.path/'images').glob('*.jpg'))
        else:
            meta,names = prepare(job)
        masks(job,meta,names)
        maps = reconstruct(job,meta,names)
        worker_log=job.path/'worker.log'
        if worker_log.exists() and 'Matrix not positive definite' in worker_log.read_text(errors='replace'):
            job.warnings.append('Bundle adjustment reported an ill-conditioned system. This is a provisional reconstruction; inspect camera motion and rendered inserts before acceptance.')
        models = []
        for model_id,reconstruction in sorted(maps.items(),key=lambda kv:-kv[1].num_reg_images()):
            result = export_model(job,meta,reconstruction,int(model_id))
            if result:
                models.append(result)
        if not models:
            raise ValueError('Reconstruction did not pass per-frame validation. Inspect masks and try a shorter or sharper range.')
        models.sort(key=lambda m:-m['summary']['solved_frames'])
        best = models[0]
        if best['summary']['coverage_fraction'] < .99:
            job.warnings.append('Partial solve: only the listed contiguous ranges can be imported. Missing frames are not interpolated.')
        if len(models)>1:
            job.warnings.append('Disconnected reconstructions have separate coordinate systems. Choose a model; they are not stitched.')
        job.warnings.append('Unknown world scale. Error measures track consistency, not independent ground-truth camera accuracy.')
        atomic_json(job.path/'result.json', dict(schema='scenetrack/1',metadata=meta,models=models,warnings=job.warnings,
            engine='COLMAP SIFT + bundle adjustment + per-frame PnP',ai=('SAM 2.1 Tiny + Apple Vision exclusion' if job.config.get('mask_backend')=='sam2' else 'Apple Vision people and text exclusion') if job.config.get('ai_masks',True) else 'disabled'))
        pack_panel(json.loads((job.path/'result.json').read_text()), job.path/'panel.json')
        job.status('complete',100,f"{best['summary']['solved_frames']} frames passed consistency checks; {best['summary']['points']} scene points", result=str(job.path/'result.json'))
    except InterruptedError:
        atomic_json(job.path/'status.json',dict(stage='cancelled',progress=0,message='Cancelled. Source footage is unchanged.'))
    except BaseException as e:
        if job.token.is_cancelled or (job.path/'cancel').exists():
            atomic_json(job.path/'status.json',dict(stage='cancelled',progress=0,message='Cancelled. Source footage is unchanged.'))
            return
        traceback.print_exc()
        atomic_json(job.path/'status.json',dict(stage='failed',progress=0,message=str(e),warnings=job.warnings))
        raise


if __name__ == '__main__':
    main()
