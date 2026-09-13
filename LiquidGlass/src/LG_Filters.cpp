#include "LG_Filters.h"

#include <limits>
#include <vector>

namespace lg {
namespace {

/**
 * Prefix-sum box pass. O(width) per row instead of O(width * radius), which is
 * what keeps a large frost radius from dominating the render.
 */
void BoxRowPassFast(const float *src, float *dst, int width, int stride, int r) {
    if (r <= 0) {
        for (int x = 0; x < width; ++x) {
            dst[static_cast<size_t>(x) * stride] = src[static_cast<size_t>(x) * stride];
        }
        return;
    }

    float sum = 0.f;
    for (int k = -r; k <= r; ++k) {
        const int sx = k < 0 ? 0 : (k >= width ? width - 1 : k);
        sum += src[static_cast<size_t>(sx) * stride];
    }
    const float norm = 1.f / static_cast<float>(2 * r + 1);

    for (int x = 0; x < width; ++x) {
        dst[static_cast<size_t>(x) * stride] = sum * norm;
        int add = x + r + 1;
        int sub = x - r;
        add = add >= width ? width - 1 : add;
        sub = sub < 0 ? 0 : sub;
        sum += src[static_cast<size_t>(add) * stride] - src[static_cast<size_t>(sub) * stride];
    }
}

}  // namespace

void BlurPlane(Plane &plane, float radius, int iterations) {
    if (radius < 0.5f || iterations <= 0 || plane.width <= 0 || plane.height <= 0) {
        return;
    }

    // Splitting the radius over N box passes approximates a Gaussian of the
    // same total width, so Quality can trade passes for speed without the
    // apparent softness changing.
    const int r = std::max(1, static_cast<int>(radius / std::sqrt((float)iterations) + 0.5f));

    Plane scratch;
    scratch.Resize(plane.width, plane.height);

    for (int pass = 0; pass < iterations; ++pass) {
        ParallelRows(plane.height, [&](int y0, int y1) {
            for (int y = y0; y < y1; ++y) {
                BoxRowPassFast(plane.Row(y), scratch.Row(y), plane.width, 1, r);
            }
        });
        ParallelRows(plane.width, [&](int x0, int x1) {
            for (int x = x0; x < x1; ++x) {
                BoxRowPassFast(scratch.data.data() + x, plane.data.data() + x,
                               plane.height, plane.width, r);
            }
        });
    }
}

void BlurRgba(Rgba &image, float radius, int iterations) {
    if (radius < 0.5f || iterations <= 0 || image.width <= 0 || image.height <= 0) {
        return;
    }

    const int r = std::max(1, static_cast<int>(radius / std::sqrt((float)iterations) + 0.5f));

    Rgba scratch;
    scratch.Resize(image.width, image.height);

    for (int pass = 0; pass < iterations; ++pass) {
        ParallelRows(image.height, [&](int y0, int y1) {
            for (int y = y0; y < y1; ++y) {
                for (int c = 0; c < 4; ++c) {
                    BoxRowPassFast(image.Pixel(0, y) + c, scratch.Pixel(0, y) + c,
                                   image.width, 4, r);
                }
            }
        });
        ParallelRows(image.width, [&](int x0, int x1) {
            for (int x = x0; x < x1; ++x) {
                for (int c = 0; c < 4; ++c) {
                    BoxRowPassFast(scratch.data.data() + static_cast<size_t>(x) * 4 + c,
                                   image.data.data() + static_cast<size_t>(x) * 4 + c,
                                   image.height, image.width * 4, r);
                }
            }
        });
    }
}

void OffsetPlane(const Plane &src, float dx, float dy, Plane &dst) {
    dst.Resize(src.width, src.height);
    ParallelRows(src.height, [&](int y0, int y1) {
        for (int y = y0; y < y1; ++y) {
            float *out = dst.Row(y);
            for (int x = 0; x < src.width; ++x) {
                out[x] = src.Sample(x - dx, y - dy);
            }
        }
    });
}

namespace {

/**
 * One dimensional squared distance transform of a sampled function, in O(n)
 * (Felzenszwalb & Huttenlocher). Run over rows and then columns it yields the
 * exact Euclidean transform of the plane.
 */
void DistanceTransform1D(const float *f, int fStride,
                         float *d, int dStride,
                         int n, int *v, float *z) {
    // A finite sentinel rather than infinity: the parabola intersections below
    // subtract these values, and inf - inf is a NaN that silently poisons the
    // whole row.
    const float kFar = 1e20f;

    int k = 0;
    v[0] = 0;
    z[0] = -kFar;
    z[1] = kFar;

    for (int q = 1; q < n; ++q) {
        const float fq = f[static_cast<size_t>(q) * fStride];
        float s = 0.f;
        for (;;) {
            const float fv = f[static_cast<size_t>(v[k]) * fStride];
            s = ((fq + static_cast<float>(q) * q) - (fv + static_cast<float>(v[k]) * v[k])) /
                (2.f * static_cast<float>(q) - 2.f * static_cast<float>(v[k]));
            if (s > z[k] || k == 0) {
                break;
            }
            --k;
        }
        ++k;
        v[k] = q;
        z[k] = s;
        z[k + 1] = kFar;
    }

    k = 0;
    for (int q = 0; q < n; ++q) {
        while (z[k + 1] < static_cast<float>(q)) {
            ++k;
        }
        const float dx = static_cast<float>(q - v[k]);
        d[static_cast<size_t>(q) * dStride] =
            dx * dx + f[static_cast<size_t>(v[k]) * fStride];
    }
}

/** Squared Euclidean distance to the nearest pixel where `seed` is true. */
void SquaredDistanceToSeeds(const Plane &coverage, bool inside, Plane &out) {
    const float kFar = 1e20f;
    out.Resize(coverage.width, coverage.height);

    for (int y = 0; y < coverage.height; ++y) {
        const float *cov = coverage.Row(y);
        float *dst = out.Row(y);
        for (int x = 0; x < coverage.width; ++x) {
            const bool seed = inside ? (cov[x] >= 0.5f) : (cov[x] < 0.5f);
            dst[x] = seed ? 0.f : kFar;
        }
    }

    ParallelRows(out.height, [&](int y0, int y1) {
        std::vector<int> v(static_cast<size_t>(out.width) + 1);
        std::vector<float> z(static_cast<size_t>(out.width) + 2);
        std::vector<float> scratch(static_cast<size_t>(out.width));
        for (int y = y0; y < y1; ++y) {
            DistanceTransform1D(out.Row(y), 1, scratch.data(), 1, out.width,
                                v.data(), z.data());
            std::copy(scratch.begin(), scratch.end(), out.Row(y));
        }
    });

    ParallelRows(out.width, [&](int x0, int x1) {
        std::vector<int> v(static_cast<size_t>(out.height) + 1);
        std::vector<float> z(static_cast<size_t>(out.height) + 2);
        std::vector<float> scratch(static_cast<size_t>(out.height));
        for (int x = x0; x < x1; ++x) {
            // The column is strided in the source but packed in the scratch, so
            // the two strides genuinely differ — sharing one silently walks off
            // the end of the scratch buffer.
            DistanceTransform1D(out.data.data() + x, out.width, scratch.data(), 1,
                                out.height, v.data(), z.data());
            for (int y = 0; y < out.height; ++y) {
                out.data[static_cast<size_t>(y) * out.width + x] = scratch[y];
            }
        }
    });
}

}  // namespace

void SignedDistance(const Plane &coverage, Plane &distance) {
    Plane dIn, dOut;
    SquaredDistanceToSeeds(coverage, false, dIn);   // distance from inside to the outside
    SquaredDistanceToSeeds(coverage, true, dOut);   // distance from outside to the shape

    distance.Resize(coverage.width, coverage.height);
    ParallelRows(coverage.height, [&](int y0, int y1) {
        for (int y = y0; y < y1; ++y) {
            const float *cov = coverage.Row(y);
            const float *a = dIn.Row(y);
            const float *b = dOut.Row(y);
            float *out = distance.Row(y);
            for (int x = 0; x < coverage.width; ++x) {
                const bool inside = cov[x] >= 0.5f;
                float d = inside ? std::sqrt(a[x]) : -std::sqrt(b[x]);
                // The transform works on a hard threshold, which throws away the
                // antialiased edge. Nudging by the pixel's own coverage puts the
                // zero crossing back on the true edge and keeps the rim smooth.
                d += (Clamp01(cov[x]) - 0.5f);
                out[x] = d;
            }
        }
    });
}

void HeightFromDistance(const Plane &distance, float edgeWidth, float curvature01,
                        Plane &height) {
    height.Resize(distance.width, distance.height);
    const float c = Clamp01(curvature01);
    const float w = edgeWidth > 1.f ? edgeWidth : 1.f;

    ParallelRows(distance.height, [&](int y0, int y1) {
        for (int y = y0; y < y1; ++y) {
            const float *in = distance.Row(y);
            float *out = height.Row(y);
            for (int x = 0; x < distance.width; ++x) {
                const float t = Clamp01(in[x] / w);
                const float k = 1.f - t;
                // A quarter circle in profile: flat across the middle of the
                // slab, falling away hard at the rim. That concentration is
                // where the refraction and the dispersion come from.
                const float dome = std::sqrt(std::max(0.f, 1.f - k * k));
                out[x] = Lerp(t, dome, c);
            }
        }
    });

    // Two things need softening before this field is differentiated: the dome
    // meets the rim vertically, which aliases, and a distance field creases
    // along its medial axis, which fans into visible facets across a bevelled
    // corner. Both disappear under a blur proportional to the bevel itself.
    BlurPlane(height, std::max(1.2f, w * 0.10f), 3);
}

void ThresholdDistance(const Plane &distance, float at, float softness, Plane &out) {
    out.Resize(distance.width, distance.height);
    const float half = std::max(0.5f, softness * 0.5f);
    const float lo = at - half;
    const float span = 2.f * half;

    ParallelRows(distance.height, [&](int y0, int y1) {
        for (int y = y0; y < y1; ++y) {
            const float *in = distance.Row(y);
            float *dst = out.Row(y);
            for (int x = 0; x < distance.width; ++x) {
                const float t = Clamp01((in[x] - lo) / span);
                dst[x] = t * t * (3.f - 2.f * t);  // smoothstep
            }
        }
    });
}

void GradientOf(const Plane &height, Plane &gx, Plane &gy) {
    gx.Resize(height.width, height.height);
    gy.Resize(height.width, height.height);

    ParallelRows(height.height, [&](int y0, int y1) {
        for (int y = y0; y < y1; ++y) {
            float *ox = gx.Row(y);
            float *oy = gy.Row(y);
            for (int x = 0; x < height.width; ++x) {
                ox[x] = (height.At(x + 1, y) - height.At(x - 1, y)) * 0.5f;
                oy[x] = (height.At(x, y + 1) - height.At(x, y - 1)) * 0.5f;
            }
        }
    });
}

}  // namespace lg
