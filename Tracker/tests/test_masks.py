import json
from pathlib import Path
import sys
import tempfile
import unittest
import cv2
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'worker'))
from solve import masks
from sam_masks import input_hash

class MaskTests(unittest.TestCase):
    def fixture(self,root,guard):
        class Job:
            path=Path(root)
            config={'ai_masks':True,'mask_backend':'sam2','sam_box':[.3,.2,.7,.8],'guard_prompt_boxes':guard,'subject_end_frame':0}
            warnings=[]
        j=Job()
        for folder in ['masks','ai_masks','sam_masks']:(j.path/folder).mkdir()
        names=['000000.jpg','000004.jpg']
        for n in names:
            for folder in ['ai_masks','sam_masks']:cv2.imwrite(str(j.path/folder/(n+'.png')),np.zeros((100,100),np.uint8))
        (j.path/'sam_metrics.json').write_text(json.dumps({'sam_input_hash':input_hash(j.config),'frames':2,'empty_frames':[0]}))
        return j,names,dict(proxy_width=100,proxy_height=100,active_rows=[5,95],start_frame=0,end_frame=4)
    def test_lost_subject_is_not_silently_accepted(self):
        with tempfile.TemporaryDirectory() as root:
            j,n,m=self.fixture(root,False)
            with self.assertRaisesRegex(ValueError,'SAM lost'):masks(j,m,n)
    def test_explicit_envelope_respects_reviewed_exit(self):
        with tempfile.TemporaryDirectory() as root:
            j,n,m=self.fixture(root,True);masks(j,m,n)
            before=cv2.imread(str(j.path/'masks'/(n[0]+'.png')),0)
            after=cv2.imread(str(j.path/'masks'/(n[1]+'.png')),0)
            self.assertEqual(before[50,50],0)
            self.assertEqual(after[50,50],255)
            self.assertEqual(after[0,50],0)
            self.assertTrue(j.warnings)

if __name__=='__main__':unittest.main()
