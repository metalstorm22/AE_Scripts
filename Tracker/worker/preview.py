import json
from pathlib import Path
import sys
import cv2
import numpy as np

source,frame,out=sys.argv[1],int(sys.argv[2]),Path(sys.argv[3])
cap=cv2.VideoCapture(source)
if not cap.isOpened():raise SystemExit('Cannot open footage')
meta=dict(fps=cap.get(cv2.CAP_PROP_FPS),frame_count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
cap.set(cv2.CAP_PROP_POS_FRAMES,frame)
ok,image=cap.read()
cap.release()
if not ok:raise SystemExit('Cannot read preview frame')
image=cv2.resize(image,(640,round(meta['height']*640/meta['width'])))
lut=np.uint8((np.arange(256)/255.)**.5*255)
out.parent.mkdir(parents=True,exist_ok=True)
cv2.imwrite(str(out),cv2.LUT(image,lut))
meta['preview']=str(out)
print(json.dumps(meta))
