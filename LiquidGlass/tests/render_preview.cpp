/*
 *  render_preview — renders one frame of the glass without After Effects.
 *
 *  The shading pipeline has no host dependency, which means it can be driven
 *  from a plain main(). Build with `make preview` and look at the PNG; a change
 *  that breaks the look shows up here in a second instead of after an AE
 *  restart.
 */
#include "LG_Filters.h"
#include "LG_Glass.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

namespace {

const int kWidth  = 900;
const int kHeight = 600;

/** A backdrop with enough structure that refraction and dispersion are visible:
 *  colour bands plus hard stripes, which is what shows a bend. */
lg::Rgba MakeBackdrop() {
    lg::Rgba img;
    img.Resize(kWidth, kHeight);
    for (int y = 0; y < kHeight; ++y) {
        for (int x = 0; x < kWidth; ++x) {
            const float u = static_cast<float>(x) / kWidth;
            const float v = static_cast<float>(y) / kHeight;
            float r = 0.95f * u + 0.10f * (1.f - v);
            float g = 0.30f + 0.55f * v;
            float b = 0.85f * (1.f - u) + 0.15f * v;
            // Diagonal stripes make any displacement obvious.
            if (static_cast<int>((x + y) / 36) % 2 == 0) {
                r *= 0.55f; g *= 0.55f; b *= 0.55f;
            }
            float *p = img.Pixel(x, y);
            p[0] = r; p[1] = g; p[2] = b; p[3] = 1.f;
        }
    }
    return img;
}

/** Antialiased superellipse — the same squircle the script generates. */
lg::Plane MakeSquircle(float cx, float cy, float rx, float ry, float n) {
    lg::Plane a;
    a.Resize(kWidth, kHeight);
    const int kSub = 3;  // 3x3 supersample for a clean edge
    for (int y = 0; y < kHeight; ++y) {
        float *row = a.Row(y);
        for (int x = 0; x < kWidth; ++x) {
            int hits = 0;
            for (int sy = 0; sy < kSub; ++sy) {
                for (int sx = 0; sx < kSub; ++sx) {
                    const float px = x + (sx + 0.5f) / kSub;
                    const float py = y + (sy + 0.5f) / kSub;
                    const float dx = std::fabs((px - cx) / rx);
                    const float dy = std::fabs((py - cy) / ry);
                    if (std::pow(dx, n) + std::pow(dy, n) <= 1.f) {
                        ++hits;
                    }
                }
            }
            row[x] = static_cast<float>(hits) / (kSub * kSub);
        }
    }
    return a;
}

void WritePPM(const lg::Rgba &img, const std::string &path) {
    FILE *f = std::fopen(path.c_str(), "wb");
    if (!f) {
        std::fprintf(stderr, "cannot write %s\n", path.c_str());
        std::exit(1);
    }
    std::fprintf(f, "P6\n%d %d\n255\n", img.width, img.height);
    for (int y = 0; y < img.height; ++y) {
        for (int x = 0; x < img.width; ++x) {
            const float *p = img.Pixel(x, y);
            // Premultiplied over white, so the preview shows what a viewer sees.
            for (int c = 0; c < 3; ++c) {
                const float v = lg::Clamp01(p[c] + (1.f - p[3]));
                const unsigned char byte = static_cast<unsigned char>(v * 255.f + 0.5f);
                std::fwrite(&byte, 1, 1, f);
            }
        }
    }
    std::fclose(f);
}

}  // namespace

int main(int argc, char **argv) {
    const std::string outPath = (argc > 1) ? argv[1] : "preview.ppm";

    lg::Rgba backdrop = MakeBackdrop();
    lg::Plane alpha = MakeSquircle(kWidth * 0.5f, kHeight * 0.5f, 280.f, 150.f, 5.f);

    lg::Settings s;
    s.refractStrength = 120.f;
    s.refractScale    = 1.06f;
    s.curvature       = 0.5f;
    s.edgeWidth       = 45.f;
    s.dispersion      = 0.30f;
    s.dispersionEdge  = 60.f;
    s.dispersionBlur  = 12.f;
    s.frost           = 8.f;
    s.tint            = 0.15f;
    s.glassOpacity    = 1.f;
    s.rimIntensity    = 1.f;
    s.rimWidth        = 4.f;
    s.rimSoftness     = 1.5f;
    s.lightAngle      = 315.f;
    s.shadowEnable    = true;
    s.shadowOpacity   = 0.38f;
    s.shadowDistance  = 14.f;
    s.shadowSoftness  = 70.f;
    s.quality         = lg::Quality::FromPopup(3);

    lg::ShapeField field;
    field.Build(alpha, s);

    lg::Rgba out;
    lg::Render(backdrop, field, s, out);

    // Cheap sanity checks, so a broken build fails loudly instead of writing
    // a plausible-looking black frame.
    double centre = 0.0, corner = 0.0;
    for (int c = 0; c < 3; ++c) {
        centre += out.Pixel(kWidth / 2, kHeight / 2)[c];
        corner += out.Pixel(4, 4)[c];
    }
    std::printf("centre luma %.4f  corner luma %.4f  shape centroid (%.1f, %.1f)\n",
                centre / 3.0, corner / 3.0, field.centerX, field.centerY);

    if (centre <= 0.001) {
        std::fprintf(stderr, "FAIL: glass rendered black\n");
        return 1;
    }
    const double *unusedGuard = NULL;
    (void)unusedGuard;

    WritePPM(out, outPath);
    std::printf("wrote %s\n", outPath.c_str());
    return 0;
}
