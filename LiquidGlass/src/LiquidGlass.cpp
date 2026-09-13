/*
 *  LiquidGlass.cpp — the host boundary: command dispatch and render orchestration.
 *
 *  Everything specific to After Effects lives in this file and LG_World.cpp.
 *  The look itself is in LG_Glass.cpp, which never sees a PF_ type.
 */
#include "LiquidGlass.h"

#include "LG_Glass.h"
#include "LG_Params.h"
#include "LG_World.h"

#include <algorithm>

static PF_Err About(PF_InData *in_data, PF_OutData *out_data,
                    PF_ParamDef *[], PF_LayerDef *) {
    AEGP_SuiteHandler suites(in_data->pica_basicP);
    suites.ANSICallbacksSuite1()->sprintf(
        out_data->return_msg,
        "%s v%d.%d\r"
        "Refracting glass with edge-weighted chromatic dispersion, a specular "
        "rim and a contact shadow.\r"
        "Apply to the layer that sits behind the glass, then pick the silhouette "
        "with Shape Layer.",
        LG_NAME, LG_MAJOR_VERSION, LG_MINOR_VERSION);
    return PF_Err_NONE;
}

static PF_Err GlobalSetup(PF_InData *in_data, PF_OutData *out_data,
                          PF_ParamDef *[], PF_LayerDef *) {
    out_data->my_version = PF_VERSION(LG_MAJOR_VERSION, LG_MINOR_VERSION,
                                      LG_BUG_VERSION, LG_STAGE_VERSION, LG_BUILD_VERSION);

    // The shadow and the refraction both reach outside the silhouette, so the
    // effect has to be allowed to hand back more pixels than it was given.
    out_data->out_flags = PF_OutFlag_DEEP_COLOR_AWARE |
                          PF_OutFlag_I_EXPAND_BUFFER;

    out_data->out_flags2 = PF_OutFlag2_PARAM_GROUP_START_COLLAPSED_FLAG |
                           PF_OutFlag2_SUPPORTS_SMART_RENDER |
                           PF_OutFlag2_FLOAT_COLOR_AWARE |
                           PF_OutFlag2_SUPPORTS_THREADED_RENDERING;

    return PF_Err_NONE;
}

static PF_Err ParamsSetup(PF_InData *in_data, PF_OutData *out_data,
                          PF_ParamDef *[], PF_LayerDef *) {
    return lg::SetupParams(in_data, out_data);
}

/**
 * The shared render path. `originX/Y` is where the input buffer's top-left sits
 * inside the output buffer — non-zero whenever the effect has expanded its
 * bounds, which is exactly what keeps the glass from sliding when a shadow
 * pushes the output rect outward.
 */
static PF_Err RenderCore(PF_InData        *in_data,
                         PF_EffectWorld   *inputP,
                         PF_EffectWorld   *shapeP,
                         PF_EffectWorld   *outputP,
                         int               originX,
                         int               originY) {
    PF_Err err = PF_Err_NONE;

    if (!inputP || !outputP) {
        return PF_Err_BAD_CALLBACK_PARAM;
    }

    lg::Settings settings;
    ERR(lg::ReadSettings(in_data, &settings));
    if (err) {
        return err;
    }

    PF_PixelFormat format = PF_PixelFormat_ARGB32;
    ERR(lg::WorldFormat(in_data, outputP, &format));
    if (err) {
        // An older host that cannot answer still renders correctly in 8 bit.
        err = PF_Err_NONE;
        format = PF_PixelFormat_ARGB32;
    }

    lg::Rgba source;
    ERR(lg::WorldToRgba(inputP, format, source));
    if (err) {
        return err;
    }

    // The silhouette. With no Shape Layer picked the effect falls back to the
    // alpha of the layer it is applied to, so it still does something sensible
    // when dropped straight onto a shape or a logo.
    lg::Plane alpha;
    if (shapeP && shapeP->data) {
        PF_PixelFormat shapeFormat = format;
        if (lg::WorldFormat(in_data, shapeP, &shapeFormat) != PF_Err_NONE) {
            shapeFormat = format;
        }
        lg::Plane raw;
        ERR(lg::WorldToAlpha(shapeP, shapeFormat, raw));
        if (err) {
            return err;
        }
        if (raw.width == source.width && raw.height == source.height) {
            alpha = raw;
        } else {
            // Different extents mean the host handed the layers back on
            // different rects; align them at the top left and clamp.
            alpha.Resize(source.width, source.height);
            const int w = std::min(raw.width, source.width);
            const int h = std::min(raw.height, source.height);
            for (int y = 0; y < h; ++y) {
                const float *in = raw.Row(y);
                float *out = alpha.Row(y);
                for (int x = 0; x < w; ++x) {
                    out[x] = in[x];
                }
            }
        }
    } else {
        alpha.Resize(source.width, source.height);
        for (int y = 0; y < source.height; ++y) {
            const float *in = source.Pixel(0, y);
            float *out = alpha.Row(y);
            for (int x = 0; x < source.width; ++x) {
                out[x] = in[x * 4 + 3];
            }
        }
    }

    lg::ShapeField field;
    field.Build(alpha, settings);

    lg::Rgba result;
    lg::Render(source, field, settings, result);

    return lg::RgbaToWorld(result, originX, originY, format, outputP);
}

static PF_Err PreRender(PF_InData *in_data, PF_OutData *out_data, PF_PreRenderExtra *extra) {
    PF_Err err = PF_Err_NONE;

    lg::Settings settings;
    ERR(lg::ReadSettings(in_data, &settings));
    if (err) {
        return err;
    }

    // Ask for enough source that every sample the shading takes is real pixels
    // rather than a clamped edge. Guessing low here is invisible in the middle
    // of a comp and very visible at its border.
    const A_long pad = static_cast<A_long>(std::ceil(settings.Padding()));

    PF_RenderRequest req = extra->input->output_request;
    req.rect.left   -= pad;
    req.rect.top    -= pad;
    req.rect.right  += pad;
    req.rect.bottom += pad;
    req.preserve_rgb_of_zero_alpha = TRUE;
    req.channel_mask = static_cast<PF_ChannelMask>(req.channel_mask | PF_ChannelMask_ARGB);

    PF_CheckoutResult inResult;
    AEFX_CLR_STRUCT(inResult);
    ERR(extra->cb->checkout_layer(in_data->effect_ref, LG_INPUT, LG_INPUT, &req,
                                  in_data->current_time, in_data->time_step,
                                  in_data->time_scale, &inResult));
    if (err) {
        return err;
    }

    // The shape layer is requested on exactly the same rect, which is what
    // guarantees the two worlds come back aligned pixel for pixel.
    PF_CheckoutResult shapeResult;
    AEFX_CLR_STRUCT(shapeResult);
    PF_Err shapeErr = extra->cb->checkout_layer(in_data->effect_ref, LG_SHAPE_LAYER,
                                                LG_SHAPE_LAYER, &req, in_data->current_time,
                                                in_data->time_step, in_data->time_scale,
                                                &shapeResult);

    UnionLRect(&inResult.result_rect,     &extra->output->result_rect);
    UnionLRect(&inResult.max_result_rect, &extra->output->max_result_rect);

    if (!shapeErr) {
        UnionLRect(&shapeResult.result_rect,     &extra->output->result_rect);
        UnionLRect(&shapeResult.max_result_rect, &extra->output->max_result_rect);
    }

    extra->output->solid = FALSE;
    return err;
}

static PF_Err SmartRender(PF_InData *in_data, PF_OutData *out_data, PF_SmartRenderExtra *extra) {
    PF_Err err = PF_Err_NONE;

    PF_EffectWorld *inputP  = NULL;
    PF_EffectWorld *shapeP  = NULL;
    PF_EffectWorld *outputP = NULL;

    ERR(extra->cb->checkout_layer_pixels(in_data->effect_ref, LG_INPUT, &inputP));

    // A missing shape layer is the default state, not an error.
    if (extra->cb->checkout_layer_pixels(in_data->effect_ref, LG_SHAPE_LAYER, &shapeP) !=
        PF_Err_NONE) {
        shapeP = NULL;
    }

    ERR(extra->cb->checkout_output(in_data->effect_ref, &outputP));

    if (!err) {
        err = RenderCore(in_data, inputP, shapeP, outputP,
                         in_data->output_origin_x, in_data->output_origin_y);
    }

    return err;
}

/**
 * Legacy render, for hosts that do not drive the smart path (Premiere Pro's
 * older render engine, mostly). Same code, worlds handed to us directly.
 */
static PF_Err LegacyRender(PF_InData *in_data, PF_OutData *out_data,
                           PF_ParamDef *params[], PF_LayerDef *output) {
    PF_EffectWorld *shapeP = NULL;
    if (params[LG_SHAPE_LAYER]->u.ld.data) {
        shapeP = &params[LG_SHAPE_LAYER]->u.ld;
    }
    return RenderCore(in_data, &params[LG_INPUT]->u.ld, shapeP, output,
                      in_data->output_origin_x, in_data->output_origin_y);
}

extern "C" DllExport PF_Err PluginDataEntryFunction2(PF_PluginDataPtr inPtr,
                                                     PF_PluginDataCB2  inPluginDataCallBackPtr,
                                                     SPBasicSuite     *inSPBasicSuitePtr,
                                                     const char       *inHostName,
                                                     const char       *inHostVersion) {
    PF_Err result = PF_Err_INVALID_CALLBACK;

    result = PF_REGISTER_EFFECT_EXT2(inPtr,
                                     inPluginDataCallBackPtr,
                                     LG_NAME,
                                     LG_MATCH_NAME,
                                     LG_CATEGORY,
                                     AE_RESERVED_INFO,
                                     "EffectMain",
                                     LG_SUPPORT_URL);

    return result;
}

PF_Err EffectMain(PF_Cmd        cmd,
                  PF_InData    *in_data,
                  PF_OutData   *out_data,
                  PF_ParamDef  *params[],
                  PF_LayerDef  *output,
                  void         *extra) {
    PF_Err err = PF_Err_NONE;

    try {
        switch (cmd) {
            case PF_Cmd_ABOUT:
                err = About(in_data, out_data, params, output);
                break;
            case PF_Cmd_GLOBAL_SETUP:
                err = GlobalSetup(in_data, out_data, params, output);
                break;
            case PF_Cmd_PARAMS_SETUP:
                err = ParamsSetup(in_data, out_data, params, output);
                break;
            case PF_Cmd_RENDER:
                err = LegacyRender(in_data, out_data, params, output);
                break;
            case PF_Cmd_SMART_PRE_RENDER:
                err = PreRender(in_data, out_data, reinterpret_cast<PF_PreRenderExtra *>(extra));
                break;
            case PF_Cmd_SMART_RENDER:
                err = SmartRender(in_data, out_data, reinterpret_cast<PF_SmartRenderExtra *>(extra));
                break;
            default:
                break;
        }
    } catch (PF_Err &thrown_err) {
        err = thrown_err;
    } catch (...) {
        // A std::bad_alloc from a very large frame must not take the host down.
        err = PF_Err_OUT_OF_MEMORY;
    }

    return err;
}
