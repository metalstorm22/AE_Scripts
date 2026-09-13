import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'worker'))
from sam_masks import window_starts

class WindowTests(unittest.TestCase):
    def test_every_correction_starts_a_window(self):
        names=[f'{i*4:06d}.jpg' for i in range(244)]
        prompts={'188':[], '284':[], '328':[], '376':[], '752':[]}
        windows=list(window_starts(names,prompts))
        self.assertTrue({47,71,82,94,188}.issubset({a for a,b in windows}))
        self.assertEqual(set(range(244)),{i for a,b in windows for i in range(a,b)})
        for a,b in windows:self.assertLessEqual(b-a,48)
        for (_,b),(a,_) in zip(windows,windows[1:]):self.assertEqual(b-1,a)
    def test_short_clip(self):
        self.assertEqual(list(window_starts(['000000.jpg','000004.jpg'],{})),[(0,2)])

if __name__=='__main__':unittest.main()
