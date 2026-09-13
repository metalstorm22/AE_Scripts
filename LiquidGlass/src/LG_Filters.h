/*
 *  LG_Filters.h — the separable primitives the glass is assembled from.
 *
 *  Three operations carry the whole effect: an exact Euclidean distance field
 *  (which the bevel, the rim ring and the dispersion core are all read out of),
 *  a blur (frost and antialiasing), and a gradient (the surface normal that
 *  does the bending). All of them are separable and row-parallel.
 */
#pragma once

#include "LG_Image.h"

namespace lg {

/**
 * Box blur, repeated. Three iterations of a box is within a couple of percent
 * of a true Gaussian and costs a fraction of it, which is what makes a 200px
 * frost radius affordable at 4K.
 */
void BlurPlane(Plane &plane, float radius, int iterations);
void BlurRgba(Rgba &image, float radius, int iterations);

/**
 * Signed distance to the silhouette edge, in pixels: positive inside, negative
 * outside. Exact Euclidean, by the Felzenszwalb-Huttenlocher transform.
 *
 * This replaces the obvious implementations — blur the alpha, or erode it with
 * a sliding-window minimum — because both are anisotropic. A separable minimum
 * erodes with a *square*, so choking a rounded shape by 60px leaves a rounded
 * rectangle with straight sides, and the boundary shows up as a rectangular
 * seam across the middle of the glass. A distance field has no such preferred
 * direction, and every inset the effect needs is then a threshold on it.
 */
void SignedDistance(const Plane &coverage, Plane &distance);

/** Offset a plane by a whole-pixel translation, clamping at the edges. */
void OffsetPlane(const Plane &src, float dx, float dy, Plane &dst);

/**
 * Surface height from the distance field. The bevel ramps over `edgeWidth`
 * pixels in from the rim; curvature blends a linear chamfer into a spherical
 * dome, which is the difference between a bevelled slab and a lens.
 */
void HeightFromDistance(const Plane &distance, float edgeWidth, float curvature01,
                        Plane &height);

/** Smooth 0..1 ramp of a distance field between two insets, in pixels. */
void ThresholdDistance(const Plane &distance, float at, float softness, Plane &out);

/** Central-difference gradient of `height`, in pixels. */
void GradientOf(const Plane &height, Plane &gx, Plane &gy);

}  // namespace lg
