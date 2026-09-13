"""Create a silent proxy diagnostic with actual exclusions and accepted 2D tracks."""
import argparse
import json
from pathlib import Path
import subprocess
import cv2
import numpy as np


def render(job):
    data=json.loads((job/'result.json').read_text());meta=data['metadata'];model=data['models'][0]
    observations={o['frame']:o['points'] for o in model['observations']}
    poses={p['frame']:p for p in model['poses']}
    w,h=meta['proxy_width'],meta['proxy_height']
    out=job/'review.mp4'
    ffmpeg='/opt/homebrew/bin/ffmpeg'
    proc=subprocess.Popen([ffmpeg,'-v','error','-y','-f','rawvideo','-pixel_format','bgr24','-video_size',f'{w}x{h}','-framerate',str(meta['fps']),'-i','-','-an','-c:v','libx264','-preset','veryfast','-threads','2','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
    names=sorted((job/'frames').glob('*.jpg'))
    for index,path in enumerate(names):
        frame=int(path.stem);image=cv2.imread(str(path))
        mask_frame=frame if frame==meta['end_frame'] else (frame-meta['start_frame'])//meta['stride']*meta['stride']+meta['start_frame']
        mask=cv2.imread(str(job/'masks'/f'{mask_frame:06d}.jpg.png'),0)
        excluded=mask==0
        image[excluded]=(image[excluded]*.7+np.array([30,75,170])*.3).astype('uint8')
        for point in observations.get(frame,[]):
            uv=tuple(np.rint(np.array(point['uv'])*[meta['scale_x'],meta['scale_y']]).astype(int))
            projected=tuple(np.rint(np.array(point['projected'])*[meta['scale_x'],meta['scale_y']]).astype(int))
            cv2.line(image,uv,projected,(50,50,255),1)
            cv2.circle(image,uv,2,(100,255,120),1)
        p=poses.get(frame)
        text=f'Frame {frame} | '+(f'{p["inliers"]} inliers | {p["error_px"]:.2f}px residual' if p else 'NO ACCEPTED CAMERA')
        cv2.rectangle(image,(0,0),(w,30),(0,0,0),-1)
        cv2.putText(image,text,(12,21),cv2.FONT_HERSHEY_SIMPLEX,.52,(255,255,255),1,cv2.LINE_AA)
        cv2.putText(image,'ANALYSIS PROXY | orange: excluded | green: observed tracks',(12,h-12),cv2.FONT_HERSHEY_SIMPLEX,.45,(255,255,255),1,cv2.LINE_AA)
        if index in {0,len(names)//3,2*len(names)//3,len(names)-1}:cv2.imwrite(str(job/f'review-{frame:06d}.jpg'),image)
        proc.stdin.write(image.tobytes())
    proc.stdin.close()
    if proc.wait()!=0:raise RuntimeError('ffmpeg review encoding failed')
    print(out)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--job',required=True);args=parser.parse_args();render(Path(args.job))
