"""Camera conventions: OpenCV world-to-camera, pixels at full source resolution."""
import numpy as np
import cv2
from scipy.spatial.transform import Rotation


def camera_to_ae(R, t, scale=1000.0):
    # Both OpenCV and AE camera coordinates are X right, Y down, Z forward.
    # AE uses intrinsic XYZ (Rx * Ry * Rz), measured by ae_geometry_probe.jsx.
    R = np.asarray(R, float)
    center = -R.T @ np.asarray(t, float).reshape(3)
    angles = Rotation.from_matrix(R.T).as_euler('XYZ', degrees=True)
    return (center * scale).tolist(), angles.tolist()


def project(xyz, R, t, K):
    q = np.asarray(xyz) @ np.asarray(R).T + np.asarray(t).reshape(3)
    uvw = q @ np.asarray(K).T
    return uvw[:, :2] / uvw[:, 2:3], q[:, 2]


def solve_pnp(xyz, uv, K, R0=None, t0=None):
    xyz, uv = np.asarray(xyz, np.float64), np.asarray(uv, np.float64)
    if len(xyz) < 12:
        return None
    rv = cv2.Rodrigues(R0)[0] if R0 is not None else None
    tv = np.asarray(t0, np.float64).reshape(3, 1) if t0 is not None else None
    ok, rv, tv, inliers = cv2.solvePnPRansac(xyz, uv, K, None, rvec=rv, tvec=tv,
        useExtrinsicGuess=R0 is not None, iterationsCount=500, reprojectionError=2.5,
        confidence=0.999, flags=cv2.SOLVEPNP_ITERATIVE if R0 is not None else cv2.SOLVEPNP_EPNP)
    if not ok or inliers is None or len(inliers) < 12 or len(inliers)/len(xyz) < .35:
        return None
    ii = inliers.ravel()
    rv, tv = cv2.solvePnPRefineLM(xyz[ii], uv[ii], K, None, rv, tv)
    R = cv2.Rodrigues(rv)[0]
    predicted, depth = project(xyz[ii], R, tv, K)
    err = np.linalg.norm(predicted - uv[ii], axis=1)
    if np.median(err) > 1.5 or np.mean(depth > 0) < .95:
        return None
    return R, tv.ravel(), ii, err


def contiguous_ranges(frames):
    frames = sorted(set(frames))
    ranges = []
    for f in frames:
        if not ranges or f != ranges[-1][1]+1:
            ranges.append([f, f])
        else:
            ranges[-1][1] = f
    return ranges
