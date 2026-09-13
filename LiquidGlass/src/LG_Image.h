/*
 *  LG_Image.h — the float buffers every render pass works on.
 *
 *  After Effects hands us premultiplied 8, 16 or 32 bit worlds. Rather than
 *  writing three copies of the shading maths, everything is converted once into
 *  premultiplied float here, processed, and converted back on the way out.
 *  That costs one pass over the frame and buys a single, readable pipeline.
 */
#pragma once

#include <algorithm>
#include <cmath>
#include <functional>
#include <vector>

namespace lg {

inline float Clamp01(float v) {
    return v < 0.f ? 0.f : (v > 1.f ? 1.f : v);
}

inline float Lerp(float a, float b, float t) {
    return a + (b - a) * t;
}

/** Single channel image — alpha, thickness, masks. */
struct Plane {
    int width  = 0;
    int height = 0;
    std::vector<float> data;

    void Resize(int w, int h) {
        width  = w;
        height = h;
        data.assign(static_cast<size_t>(w) * static_cast<size_t>(h), 0.f);
    }

    float *Row(int y) { return data.data() + static_cast<size_t>(y) * width; }
    const float *Row(int y) const { return data.data() + static_cast<size_t>(y) * width; }

    /** Clamped fetch — every sampler in the rig reads past the edge somewhere. */
    float At(int x, int y) const {
        x = x < 0 ? 0 : (x >= width ? width - 1 : x);
        y = y < 0 ? 0 : (y >= height ? height - 1 : y);
        return data[static_cast<size_t>(y) * width + x];
    }

    float Sample(float fx, float fy) const {
        const int x0 = static_cast<int>(std::floor(fx));
        const int y0 = static_cast<int>(std::floor(fy));
        const float tx = fx - x0;
        const float ty = fy - y0;
        const float a = Lerp(At(x0, y0), At(x0 + 1, y0), tx);
        const float b = Lerp(At(x0, y0 + 1), At(x0 + 1, y0 + 1), tx);
        return Lerp(a, b, ty);
    }
};

/**
 * Premultiplied RGBA image. Premultiplied is what After Effects hands us and
 * what a blur wants — colour never bleeds out of a transparent region — so the
 * pipeline stays in that space and only unpremultiplies at the few points that
 * need a real colour, inside the glass.
 */
struct Rgba {
    int width  = 0;
    int height = 0;
    std::vector<float> data;   // interleaved r,g,b,a

    void Resize(int w, int h) {
        width  = w;
        height = h;
        data.assign(static_cast<size_t>(w) * static_cast<size_t>(h) * 4u, 0.f);
    }

    float *Pixel(int x, int y) {
        return data.data() + (static_cast<size_t>(y) * width + x) * 4u;
    }
    const float *Pixel(int x, int y) const {
        return data.data() + (static_cast<size_t>(y) * width + x) * 4u;
    }

    const float *ClampedPixel(int x, int y) const {
        x = x < 0 ? 0 : (x >= width ? width - 1 : x);
        y = y < 0 ? 0 : (y >= height ? height - 1 : y);
        return Pixel(x, y);
    }

    /** Bilinear sample, clamped at the edges. Writes four floats to out. */
    void Sample(float fx, float fy, float *out) const {
        const int x0 = static_cast<int>(std::floor(fx));
        const int y0 = static_cast<int>(std::floor(fy));
        const float tx = fx - x0;
        const float ty = fy - y0;
        const float *p00 = ClampedPixel(x0,     y0);
        const float *p10 = ClampedPixel(x0 + 1, y0);
        const float *p01 = ClampedPixel(x0,     y0 + 1);
        const float *p11 = ClampedPixel(x0 + 1, y0 + 1);
        for (int c = 0; c < 4; ++c) {
            const float a = Lerp(p00[c], p10[c], tx);
            const float b = Lerp(p01[c], p11[c], tx);
            out[c] = Lerp(a, b, ty);
        }
    }

    /** Only the channel a dispersion pass actually needs. */
    float SampleChannel(float fx, float fy, int c) const {
        const int x0 = static_cast<int>(std::floor(fx));
        const int y0 = static_cast<int>(std::floor(fy));
        const float tx = fx - x0;
        const float ty = fy - y0;
        const float a = Lerp(ClampedPixel(x0, y0)[c],     ClampedPixel(x0 + 1, y0)[c],     tx);
        const float b = Lerp(ClampedPixel(x0, y0 + 1)[c], ClampedPixel(x0 + 1, y0 + 1)[c], tx);
        return Lerp(a, b, ty);
    }
};

/** How many rows each worker in a parallel pass should take. */
int  WorkerCount();
void ParallelRows(int height, const std::function<void(int, int)> &band);

}  // namespace lg
