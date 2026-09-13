"""Prompted SAM 2.1 Tiny video exclusion masks, bounded to 48-frame windows."""
import gc
import json
import os
from pathlib import Path
import resource
import shutil
import time
import hashlib
import cv2
import numpy as np


def input_hash(config):
    keys=['source','start_frame','end_frame','width','gamma','stride','sam_box','sam_prompts','subject_end_frame']
    return hashlib.sha256(json.dumps({k:config.get(k) for k in keys},sort_keys=True).encode()).hexdigest()


def window_starts(names, prompts):
    corrections = {i for i,n in enumerate(names) if str(int(Path(n).stem)) in prompts}
    first = 0
    while first < len(names):
        stop = min(first+48,len(names))
        next_prompt = min((i for i in corrections if first<i<stop),default=None)
        if next_prompt is not None:
            stop = next_prompt+1
        yield first,stop
        if stop == len(names):break
        first = stop-1


def generate(job, names, progress_callback=None):
    import torch
    from sam2.build_sam import build_sam2_video_predictor
    root = Path(__file__).resolve().parents[1]
    checkpoint = root/'models/sam2.1_hiera_tiny.pt'
    if not checkpoint.exists():
        raise ValueError('SAM 2.1 Tiny weights are missing. Run scripts/setup_sam.sh.')
    box = job.config.get('sam_box')
    all_names = list(names)
    subject_end = int(job.config.get('subject_end_frame',int(Path(names[-1]).stem)))
    names = [n for n in names if int(Path(n).stem)<=subject_end]
    if not names:
        raise ValueError('Subject exit must be after the starting prompt.')
    if not box or len(box) != 4:
        raise ValueError('SAM needs a subject prompt. Draw a box around the moving subject on the start frame.')
    if not (0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1):
        raise ValueError('SAM prompt coordinates must form a rectangle within the frame.')
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    torch.set_num_threads(4)
    predictor = build_sam2_video_predictor('configs/sam2.1/sam2.1_hiera_t.yaml',str(checkpoint),
        device=device,apply_postprocessing=False)
    output = job.path/'sam_masks'
    output.mkdir(exist_ok=True)
    started = time.monotonic()
    last_mask = None
    prompts = job.config.get('sam_prompts', {})
    frame_ids = {str(int(Path(n).stem)) for n in names}
    for frame,rectangle in prompts.items():
        if frame not in frame_ids:
            raise ValueError(f'Correction frame {frame} is outside the sampled solve range.')
        if len(rectangle)!=4 or not (0<=rectangle[0]<rectangle[2]<=1 and 0<=rectangle[1]<rectangle[3]<=1):
            raise ValueError(f'Invalid correction rectangle at frame {frame}.')
    empty = []
    peak_mps = 0
    # One shared overlap frame carries the actual previous mask into the next window.
    for first,stop in window_starts(names,prompts):
        job.check()
        batch = names[first:stop]
        window = job.path/'sam_window'
        if window.exists():
            shutil.rmtree(window)
        window.mkdir()
        for i,name in enumerate(batch):
            os.link(job.path/'images'/name,window/f'{i:06d}.jpg')
        with torch.inference_mode():
            state = predictor.init_state(str(window),offload_video_to_cpu=True,offload_state_to_cpu=False)
            correction = prompts.get(str(int(Path(batch[0]).stem)))
            if first == 0 or correction is not None:
                image = cv2.imread(str(job.path/'images'/batch[0]))
                h,w=image.shape[:2]
                predictor.add_new_points_or_box(state,frame_idx=0,obj_id=1,box=np.float32(correction or box)*[w,h,w,h])
            else:
                predictor.add_new_mask(state,frame_idx=0,obj_id=1,mask=last_mask)
            for index,ids,logits in predictor.propagate_in_video(state):
                job.check()
                mask = np.uint8(np.any(logits.cpu().numpy()>0,axis=(0,1)))*255
                name = batch[index]
                cv2.imwrite(str(output/(name+'.png')),mask)
                last_mask = mask>0
                if np.count_nonzero(mask)<20:
                    empty.append(int(Path(name).stem))
                if device=='mps':
                    peak_mps=max(peak_mps,torch.mps.driver_allocated_memory())
                if progress_callback:
                    progress_callback(min(first+index+1,len(names)),len(names),device)
        del state
        gc.collect()
        if device=='mps':torch.mps.empty_cache()
    empty = [int(Path(n).stem) for n in names if cv2.countNonZero(cv2.imread(str(output/(n+'.png')),0))<20]
    absent = [n for n in all_names if int(Path(n).stem)>subject_end]
    shape=cv2.imread(str(job.path/'images'/all_names[0]),0).shape
    for n in absent:
        job.check()
        cv2.imwrite(str(output/(n+'.png')),np.zeros(shape,np.uint8))
    metrics=dict(model='SAM 2.1 Hiera Tiny',device=device,frames=len(all_names),inference_frames=len(names),
        seconds=round(time.monotonic()-started,2),window_frames=48,
        process_peak_rss_mb=round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024**2,1),
        peak_mps_driver_mb=round(peak_mps/1024**2,1),
        config_hash=hashlib.sha256(json.dumps(job.config,sort_keys=True).encode()).hexdigest(),
        sam_input_hash=input_hash(job.config),
        correction_prompts=len(prompts),empty_frames=sorted(set(empty)),expected_absent_frames=[int(Path(n).stem) for n in absent])
    (job.path/'sam_metrics.json').write_text(json.dumps(metrics))
    return metrics


if __name__=='__main__':
    import argparse
    # Keep PyTorch and COLMAP in separate processes: their macOS wheels bundle
    # different OpenMP runtimes. Never suppress the runtime safety check.
    class Job:
        def __init__(self, path):
            self.path = Path(path).resolve()
            self.config = json.loads((self.path/'config.json').read_text())
        def check(self):
            if (self.path/'cancel').exists():
                raise InterruptedError('Cancelled')
    parser=argparse.ArgumentParser()
    parser.add_argument('--job',required=True)
    parser.add_argument('--limit',type=int)
    args=parser.parse_args()
    job=Job(args.job)
    names=sorted(p.name for p in (job.path/'images').glob('*.jpg'))
    if args.limit:names=names[:args.limit]
    print(json.dumps(generate(job,names,lambda n,total,device:print(f'SAM {n}/{total} {device}',flush=True))))
