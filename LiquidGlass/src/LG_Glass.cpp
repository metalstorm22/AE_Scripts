#include "LG_Glass.h"

#include "LG_Filters.h"

namespace lg {
namespace {

const float kEpsilon = 1e-5f;

/** Light direction as a unit vector, in After Effects' dial convention:
 *  0 degrees points up the screen and the angle runs clockwise. */
void LightVector(float degrees, float &lx, float &ly) {
    const float rad = degrees * 3.14159265358979f / 180.f;
    lx = std::sin(rad);
    ly = -std::cos(rad);
}

}  // namespace

Quality Quality::FromPopup(int popupValue) {
    Quality q;
    switch (popupValue) {
        case 1:  q.blurIterations = 1; q.dispersive = false; break;  // Draft
        case 2:  q.blurIterations = 2; q.dispersive = true;  break;  // Standard
        case 4:  q.blurIterations = 4; q.dispersive = true;  break;  // Ultra
        case 3:
        default: q.blurIterations = 3; q.dispersive = true;  break;  // High
    }
    return q;
}

float Settings::Padding() const {
    // Whatever reaches furthest outside the silhouette decides how much source
    // the host has to hand us. Under-requesting here shows up as a hard cut in
    // the refraction near the frame edge.
    float pad = refractStrength + edgeWidth;
    pad = std::max(pad, frost * 2.f);
    pad = std::max(pad, dispersionEdge + dispersionBlur);
    if (shadowEnable) {
        pad = std::max(pad, shadowDistance + shadowSoftness * 2.f);
    }
    return pad + 8.f;
}

void ShapeField::Build(const Plane &alpha, const Settings &s) {
    coverage = alpha;

    // Alpha-weighted centroid. Magnification pivots here, so a shape sitting off
    // to one side of the frame magnifies about itself rather than about the comp.
    double sumX = 0.0, sumY = 0.0, sumW = 0.0;
    for (int y = 0; y < coverage.height; ++y) {
        const float *row = coverage.Row(y);
        for (int x = 0; x < coverage.width; ++x) {
            const float w = row[x];
            if (w > 0.f) {
                sumX += static_cast<double>(x) * w;
                sumY += static_cast<double>(y) * w;
                sumW += w;
            }
        }
    }
    if (sumW > kEpsilon) {
        centerX = static_cast<float>(sumX / sumW);
        centerY = static_cast<float>(sumY / sumW);
    } else {
        centerX = coverage.width * 0.5f;
        centerY = coverage.height * 0.5f;
    }

    // One distance field, read out four different ways. Every inset the effect
    // needs — the bevel, the dispersion core, the specular ring — is a
    // threshold on the same exact, isotropic measurement, so none of them can
    // disagree about where the edge is.
    Plane distance;
    SignedDistance(coverage, distance);

    HeightFromDistance(distance, s.edgeWidth, s.curvature, height);
    GradientOf(height, gradX, gradY);

    // The achromatic middle. Everything outside it disperses, which is where
    // dispersion belongs — a slab that splits colour uniformly across its whole
    // face is the giveaway of a fake.
    ThresholdDistance(distance, s.dispersionEdge, std::max(2.f, s.dispersionBlur), core);

    // The specular band: everything within Edge Width of the rim.
    Plane interior;
    ThresholdDistance(distance, s.rimWidth, std::max(1.f, s.rimSoftness * 2.f), interior);
    ring.Resize(coverage.width, coverage.height);
    for (size_t i = 0; i < ring.data.size(); ++i) {
        ring.data[i] = Clamp01(coverage.data[i]) * (1.f - interior.data[i]);
    }

    if (s.shadowEnable && s.shadowOpacity > 0.f) {
        float lx = 0.f, ly = 0.f;
        LightVector(s.lightAngle, lx, ly);
        // The shadow falls away from the light, so one angle drives the rim,
        // the wash and the contact shadow together.
        OffsetPlane(coverage, -lx * s.shadowDistance, -ly * s.shadowDistance, shadow);
        BlurPlane(shadow, s.shadowSoftness, s.quality.blurIterations);
    }
}

void Render(const Rgba &src, const ShapeField &field, const Settings &s, Rgba &dst) {
    dst.Resize(src.width, src.height);

    // Frosting the plate once and sampling from it is both cheaper and steadier
    // than blurring the refracted result: one blur instead of one per channel,
    // and no smearing of the silhouette back into itself.
    Rgba frosted;
    const Rgba *plate = &src;
    if (s.frost >= 0.5f) {
        frosted = src;
        BlurRgba(frosted, s.frost, s.quality.blurIterations);
        plate = &frosted;
    }

    float lx = 0.f, ly = 0.f;
    LightVector(s.lightAngle, lx, ly);

    // ShapeField only allocates the shadow plane when the shadow is on.
    const bool  hasShadow  = s.shadowEnable && s.shadowOpacity > 0.f &&
                             field.shadow.width == src.width &&
                             field.shadow.height == src.height;
    const float invScale   = (s.refractScale > kEpsilon) ? 1.f / s.refractScale : 1.f;
    // The bevel ramps from 0 to 1 over Edge Width pixels, so its gradient is
    // proportional to 1/EdgeWidth. Scaling by half the width brings a typical
    // mid-bevel normal to about 0.5, which makes Strength read as pixels of
    // bend at the point most of the image is refracted through.
    const float normalGain = (s.edgeWidth > 1.f ? s.edgeWidth : 1.f) * 0.5f;
    const float dispersion = s.quality.dispersive ? s.dispersion : 0.f;

    ParallelRows(src.height, [&](int y0, int y1) {
        for (int y = y0; y < y1; ++y) {
            for (int x = 0; x < src.width; ++x) {
                const float *base = src.Pixel(x, y);
                float outR = base[0], outG = base[1], outB = base[2], outA = base[3];

                // Contact shadow, cast onto the backdrop and under the glass.
                if (hasShadow) {
                    const float sh = Clamp01(field.shadow.At(x, y)) * s.shadowOpacity;
                    if (sh > 0.f) {
                        const float keep = 1.f - sh;
                        outR *= keep;
                        outG *= keep;
                        outB *= keep;
                        outA = sh + outA * keep;
                    }
                }

                const float k = Clamp01(field.coverage.At(x, y)) * s.glassOpacity;
                if (k <= kEpsilon) {
                    // Outside the glass there is nothing left to do, and that is
                    // most of the frame — this branch is why the effect is
                    // affordable at all.
                    float *out = dst.Pixel(x, y);
                    out[0] = outR; out[1] = outG; out[2] = outB; out[3] = outA;
                    continue;
                }

                // Surface normal. The gradient of a field that ramps over
                // Edge Width pixels is proportional to 1/EdgeWidth, so scaling
                // by it keeps Refraction denominated in pixels of bend.
                const float nx = field.gradX.At(x, y) * normalGain;
                const float ny = field.gradY.At(x, y) * normalGain;

                // Magnification pivots on the shape, then the surface bends the
                // ray on top of that.
                const float qx = field.centerX + (x - field.centerX) * invScale;
                const float qy = field.centerY + (y - field.centerY) * invScale;
                const float bx = nx * s.refractStrength;
                const float by = ny * s.refractStrength;

                float rgb[3];
                float sampled[4];
                plate->Sample(qx + bx, qy + by, sampled);
                rgb[1] = sampled[1];
                float refA = sampled[3];

                if (dispersion > kEpsilon) {
                    // Only the rim band splits: 1 in the middle, 0 at the edge.
                    const float edge = 1.f - Clamp01(field.core.At(x, y));
                    const float spread = dispersion * edge;
                    const float kR = 1.f - spread;
                    const float kB = 1.f + spread;
                    rgb[0] = plate->SampleChannel(qx + bx * kR, qy + by * kR, 0);
                    rgb[2] = plate->SampleChannel(qx + bx * kB, qy + by * kB, 2);
                } else {
                    rgb[0] = sampled[0];
                    rgb[2] = sampled[2];
                }

                // The plate is premultiplied; the glass body needs a real colour
                // so that it stays opaque over a transparent backdrop.
                if (refA > kEpsilon) {
                    const float inv = 1.f / refA;
                    rgb[0] *= inv;
                    rgb[1] *= inv;
                    rgb[2] *= inv;
                }

                // Tint absorbs rather than adds — that is what a coloured pane does.
                if (s.tint > 0.f) {
                    rgb[0] = Lerp(rgb[0], rgb[0] * s.tintColor[0], s.tint);
                    rgb[1] = Lerp(rgb[1], rgb[1] * s.tintColor[1], s.tint);
                    rgb[2] = Lerp(rgb[2], rgb[2] * s.tintColor[2], s.tint);
                }

                // Specular. The rim band is sampled a little way along the light
                // direction so Highlight Distance can slide the catch up the edge.
                float ndl = 0.f;
                const float nlen = std::sqrt(nx * nx + ny * ny);
                if (nlen > kEpsilon) {
                    // The gradient climbs inward, so the outward normal is its
                    // negative — that is the face the light actually strikes.
                    ndl = (-nx / nlen) * lx + (-ny / nlen) * ly;
                }
                const float band = field.ring.Sample(x + lx * s.highlightDistance,
                                                     y + ly * s.highlightDistance);
                const float front = std::max(0.f, ndl);
                const float back  = std::max(0.f, -ndl);
                // The far edge never goes fully dark: a glass rim that vanishes
                // on two sides reads as a flat sticker.
                const float spec = band * (front * front + 0.3f * back * back) * s.rimIntensity;

                // A soft directional wash across the face, the inner sheen.
                const float wash = s.tint * 0.5f * front * Clamp01(field.height.At(x, y));

                rgb[0] += s.lightColor[0] * (spec + wash);
                rgb[1] += s.lightColor[1] * (spec + wash);
                rgb[2] += s.lightColor[2] * (spec + wash);

                // Premultiplied over.
                const float keep = 1.f - k;
                float *out = dst.Pixel(x, y);
                out[0] = rgb[0] * k + outR * keep;
                out[1] = rgb[1] * k + outG * keep;
                out[2] = rgb[2] * k + outB * keep;
                out[3] = k + outA * keep;
            }
        }
    });
}

}  // namespace lg
