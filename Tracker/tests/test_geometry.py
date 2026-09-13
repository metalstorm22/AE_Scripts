import sys
from pathlib import Path
import unittest
import cv2
import numpy as np
from scipy.spatial.transform import Rotation
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'worker'))
from geometry import project,solve_pnp,contiguous_ranges,camera_to_ae

class GeometryTests(unittest.TestCase):
    def test_camera_recovery_with_moving_foreground_outliers(self):
        rng=np.random.default_rng(11)
        xyz=rng.uniform([-3,-2,6],[3,2,15],(300,3))
        R=Rotation.from_euler('xyz',[3,-7,2],degrees=True).as_matrix()
        center=np.array([.4,-.1,.2]);t=-R@center
        K=np.array([[900.,0,480],[0,900,270],[0,0,1]])
        uv,_=project(xyz,R,t,K);uv+=rng.normal(0,.2,uv.shape)
        uv[:100]=rng.uniform([0,0],[960,540],(100,2))
        cv2.setRNGSeed(7)
        result=solve_pnp(xyz,uv,K)
        self.assertIsNotNone(result)
        solved,translation,ii,err=result
        angle=Rotation.from_matrix(solved@R.T).magnitude()
        self.assertLess(np.degrees(angle),.1)
        self.assertLess(np.linalg.norm(-solved.T@translation-center),.01)
        self.assertGreater(len(ii),190)
        self.assertLess(np.median(err),.5)
    def test_insufficient_evidence_is_rejected(self):
        self.assertIsNone(solve_pnp(np.zeros((4,3)),np.zeros((4,2)),np.eye(3)))
    def test_missing_frames_are_not_joined(self):
        self.assertEqual(contiguous_ranges([3,2,1,8,9,9,12]),[[1,3],[8,9],[12,12]])
    def test_export_matches_measured_ae_projection(self):
        # Coordinates recorded by the native AE geometry probe, not a mock host.
        cases = [([10,20,30],[30,-20,40],[100,50,1000],[824.61204003352,980.585855106234]),
                 ([-20,5,-15],[-100,20,0],[-80,-70,2000],[1000.72024089658,32.8914437768039])]
        for angles, center, point, expected in cases:
            R=Rotation.from_euler('XYZ',angles,degrees=True).as_matrix().T
            position, exported=camera_to_ae(R,-R@np.asarray(center),scale=1)
            native=Rotation.from_euler('XYZ',exported,degrees=True).as_matrix().T
            q=native@(np.asarray(point)-position)
            np.testing.assert_allclose([960,540]+1200*q[:2]/q[2],expected,atol=1e-8)

    def test_export_preserves_camera_center(self):
        R=Rotation.from_euler('xyz',[10,20,30],degrees=True).as_matrix()
        c=np.array([1,2,3]);position,_=camera_to_ae(R,-R@c)
        np.testing.assert_allclose(position,c*1000)

if __name__=='__main__':unittest.main()
