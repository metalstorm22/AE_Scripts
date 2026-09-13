/*
 *  LG_World.h — the only place that knows about both After Effects and lg::.
 *
 *  Keeping the conversions here is what lets the renderer stay depth-agnostic:
 *  8, 16 and 32 bit differ only in the two functions below.
 */
#pragma once

#include "LiquidGlass.h"
#include "LG_Image.h"

namespace lg {

/** Copies a world into a premultiplied float buffer, normalising to 0..1. */
PF_Err WorldToRgba(const PF_EffectWorld *world, PF_PixelFormat format, Rgba &out);

/** Copies just the alpha channel — all the shape layer is ever used for. */
PF_Err WorldToAlpha(const PF_EffectWorld *world, PF_PixelFormat format, Plane &out);

/**
 * Writes a float buffer back into a world. `originX/Y` is where the buffer's
 * (0,0) sits inside the destination, which is how an expanded output buffer is
 * kept aligned with the input it was built from.
 */
PF_Err RgbaToWorld(const Rgba &src, int originX, int originY,
                   PF_PixelFormat format, PF_EffectWorld *world);

/** Asks the host what depth a checked-out world actually is. */
PF_Err WorldFormat(PF_InData *in_data, const PF_EffectWorld *world, PF_PixelFormat *format);

}  // namespace lg
