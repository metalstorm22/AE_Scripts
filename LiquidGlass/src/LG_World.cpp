#include "LG_World.h"

#include "AE_EffectSuites.h"

namespace lg {
namespace {

const float kInv8  = 1.f / static_cast<float>(PF_MAX_CHAN8);
const float kInv16 = 1.f / static_cast<float>(PF_MAX_CHAN16);

}  // namespace

PF_Err WorldFormat(PF_InData *in_data, const PF_EffectWorld *world, PF_PixelFormat *format) {
    PF_Err err = PF_Err_NONE;
    AEFX_SuiteScoper<PF_WorldSuite2> worldSuite =
        AEFX_SuiteScoper<PF_WorldSuite2>(in_data, kPFWorldSuite, kPFWorldSuiteVersion2, NULL);
    ERR(worldSuite->PF_GetPixelFormat(const_cast<PF_EffectWorld *>(world), format));
    return err;
}

PF_Err WorldToRgba(const PF_EffectWorld *world, PF_PixelFormat format, Rgba &out) {
    if (!world || !world->data) {
        return PF_Err_BAD_CALLBACK_PARAM;
    }

    out.Resize(world->width, world->height);
    const char *base = reinterpret_cast<const char *>(world->data);

    ParallelRows(world->height, [&](int y0, int y1) {
        for (int y = y0; y < y1; ++y) {
            const char *rowBase = base + static_cast<size_t>(y) * world->rowbytes;
            float *dst = out.Pixel(0, y);
            switch (format) {
                case PF_PixelFormat_ARGB128: {
                    const PF_PixelFloat *in = reinterpret_cast<const PF_PixelFloat *>(rowBase);
                    for (int x = 0; x < world->width; ++x, dst += 4) {
                        dst[0] = in[x].red;
                        dst[1] = in[x].green;
                        dst[2] = in[x].blue;
                        dst[3] = in[x].alpha;
                    }
                    break;
                }
                case PF_PixelFormat_ARGB64: {
                    const PF_Pixel16 *in = reinterpret_cast<const PF_Pixel16 *>(rowBase);
                    for (int x = 0; x < world->width; ++x, dst += 4) {
                        dst[0] = in[x].red   * kInv16;
                        dst[1] = in[x].green * kInv16;
                        dst[2] = in[x].blue  * kInv16;
                        dst[3] = in[x].alpha * kInv16;
                    }
                    break;
                }
                default: {
                    const PF_Pixel8 *in = reinterpret_cast<const PF_Pixel8 *>(rowBase);
                    for (int x = 0; x < world->width; ++x, dst += 4) {
                        dst[0] = in[x].red   * kInv8;
                        dst[1] = in[x].green * kInv8;
                        dst[2] = in[x].blue  * kInv8;
                        dst[3] = in[x].alpha * kInv8;
                    }
                    break;
                }
            }
        }
    });

    return PF_Err_NONE;
}

PF_Err WorldToAlpha(const PF_EffectWorld *world, PF_PixelFormat format, Plane &out) {
    if (!world || !world->data) {
        return PF_Err_BAD_CALLBACK_PARAM;
    }

    out.Resize(world->width, world->height);
    const char *base = reinterpret_cast<const char *>(world->data);

    ParallelRows(world->height, [&](int y0, int y1) {
        for (int y = y0; y < y1; ++y) {
            const char *rowBase = base + static_cast<size_t>(y) * world->rowbytes;
            float *dst = out.Row(y);
            switch (format) {
                case PF_PixelFormat_ARGB128: {
                    const PF_PixelFloat *in = reinterpret_cast<const PF_PixelFloat *>(rowBase);
                    for (int x = 0; x < world->width; ++x) {
                        dst[x] = Clamp01(in[x].alpha);
                    }
                    break;
                }
                case PF_PixelFormat_ARGB64: {
                    const PF_Pixel16 *in = reinterpret_cast<const PF_Pixel16 *>(rowBase);
                    for (int x = 0; x < world->width; ++x) {
                        dst[x] = in[x].alpha * kInv16;
                    }
                    break;
                }
                default: {
                    const PF_Pixel8 *in = reinterpret_cast<const PF_Pixel8 *>(rowBase);
                    for (int x = 0; x < world->width; ++x) {
                        dst[x] = in[x].alpha * kInv8;
                    }
                    break;
                }
            }
        }
    });

    return PF_Err_NONE;
}

PF_Err RgbaToWorld(const Rgba &src, int originX, int originY,
                   PF_PixelFormat format, PF_EffectWorld *world) {
    if (!world || !world->data) {
        return PF_Err_BAD_CALLBACK_PARAM;
    }

    char *base = reinterpret_cast<char *>(world->data);

    ParallelRows(world->height, [&](int y0, int y1) {
        for (int y = y0; y < y1; ++y) {
            const int sy = y - originY;
            char *rowBase = base + static_cast<size_t>(y) * world->rowbytes;

            for (int x = 0; x < world->width; ++x) {
                const int sx = x - originX;
                float r = 0.f, g = 0.f, b = 0.f, a = 0.f;
                if (sy >= 0 && sy < src.height && sx >= 0 && sx < src.width) {
                    const float *p = src.Pixel(sx, sy);
                    r = p[0]; g = p[1]; b = p[2]; a = p[3];
                }

                switch (format) {
                    case PF_PixelFormat_ARGB128: {
                        PF_PixelFloat *out = reinterpret_cast<PF_PixelFloat *>(rowBase);
                        // 32 bit is scene-referred: values above 1 are legal and
                        // clipping them here would throw away highlight detail.
                        out[x].red = r; out[x].green = g; out[x].blue = b;
                        out[x].alpha = Clamp01(a);
                        break;
                    }
                    case PF_PixelFormat_ARGB64: {
                        PF_Pixel16 *out = reinterpret_cast<PF_Pixel16 *>(rowBase);
                        out[x].red   = static_cast<A_u_short>(Clamp01(r) * PF_MAX_CHAN16 + 0.5f);
                        out[x].green = static_cast<A_u_short>(Clamp01(g) * PF_MAX_CHAN16 + 0.5f);
                        out[x].blue  = static_cast<A_u_short>(Clamp01(b) * PF_MAX_CHAN16 + 0.5f);
                        out[x].alpha = static_cast<A_u_short>(Clamp01(a) * PF_MAX_CHAN16 + 0.5f);
                        break;
                    }
                    default: {
                        PF_Pixel8 *out = reinterpret_cast<PF_Pixel8 *>(rowBase);
                        out[x].red   = static_cast<A_u_char>(Clamp01(r) * PF_MAX_CHAN8 + 0.5f);
                        out[x].green = static_cast<A_u_char>(Clamp01(g) * PF_MAX_CHAN8 + 0.5f);
                        out[x].blue  = static_cast<A_u_char>(Clamp01(b) * PF_MAX_CHAN8 + 0.5f);
                        out[x].alpha = static_cast<A_u_char>(Clamp01(a) * PF_MAX_CHAN8 + 0.5f);
                        break;
                    }
                }
            }
        }
    });

    return PF_Err_NONE;
}

}  // namespace lg
