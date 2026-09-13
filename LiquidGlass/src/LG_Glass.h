/*
 *  LG_Glass.h — the look, expressed as data and one render entry point.
 *
 *  Settings arrive already resolved: percentages turned into fractions, pixel
 *  distances multiplied by the host's downsample factor. The renderer never
 *  touches an After Effects type, so the same code path serves 8, 16 and 32 bit
 *  and could be driven by a test harness.
 */
#pragma once

#include "LG_Image.h"

namespace lg {

struct Quality {
    int  blurIterations = 3;
    bool dispersive     = true;

    static Quality FromPopup(int popupValue);
};

struct Settings {
    // Refraction
    float refractStrength = 120.f;   // pixels of maximum bend
    float refractScale    = 1.f;     // 1.0 = no magnification
    float curvature       = 0.5f;    // 0 linear bevel, 1 dome
    float edgeWidth       = 45.f;    // pixels the bevel is spread over

    // Dispersion
    float dispersion      = 0.22f;   // fraction of the bend split across RGB
    float dispersionEdge  = 60.f;    // pixels the split reaches in from the rim
    float dispersionBlur  = 12.f;    // feather on that boundary

    // Body
    float frost        = 8.f;        // pixels
    float tint         = 0.15f;
    float tintColor[3] = {0.55f, 0.75f, 1.f};
    float glassOpacity = 1.f;

    // Specular
    float rimIntensity      = 1.f;
    float rimWidth          = 4.f;   // pixels
    float rimSoftness       = 1.5f;  // pixels
    float lightAngle        = 315.f; // degrees, 0 = up, clockwise (AE's dial)
    float lightColor[3]     = {1.f, 1.f, 1.f};
    float highlightDistance = 0.f;   // pixels the highlight rides along the normal

    // Shadow
    bool  shadowEnable   = true;
    float shadowOpacity  = 0.38f;
    float shadowDistance = 14.f;     // pixels
    float shadowSoftness = 70.f;     // pixels

    Quality quality;

    /** How far outside the shape the effect can reach — drives the render request. */
    float Padding() const;
};

/**
 * Everything the glass needs to know about its own silhouette. Built once per
 * frame from the shape layer's alpha and reused by every pass.
 */
struct ShapeField {
    Plane coverage;    // crisp alpha
    Plane height;      // shaped, blurred coverage
    Plane gradX;       // surface normal, x
    Plane gradY;       // surface normal, y
    Plane core;        // 1 inside the achromatic middle, 0 in the dispersive band
    Plane ring;        // the specular rim band
    Plane shadow;      // offset, blurred coverage
    float centerX = 0.f;
    float centerY = 0.f;

    void Build(const Plane &alpha, const Settings &s);
};

/** Backdrop in, glass out. Both buffers are premultiplied; they may not alias. */
void Render(const Rgba &src, const ShapeField &field, const Settings &s, Rgba &dst);

}  // namespace lg
