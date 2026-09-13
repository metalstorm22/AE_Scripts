#include "LG_Params.h"

#include "AE_EffectSuites.h"

namespace lg {
namespace {

/** Reads a colour param in the project's working space when the host offers
 *  it, falling back to the 8 bit value on older builds. */
void ReadColor(PF_InData *in_data, const PF_ParamDef &param, float rgb[3]) {
    rgb[0] = param.u.cd.value.red   / 255.f;
    rgb[1] = param.u.cd.value.green / 255.f;
    rgb[2] = param.u.cd.value.blue  / 255.f;

    const void *acquired = NULL;
    if (in_data->pica_basicP->AcquireSuite(kPFColorParamSuite, kPFColorParamSuiteVersion1,
                                           &acquired) == kSPNoError &&
        acquired != NULL) {
        const PF_ColorParamSuite1 *suite = reinterpret_cast<const PF_ColorParamSuite1 *>(acquired);
        PF_PixelFloat wide;
        if (suite->PF_GetFloatingPointColorFromColorDef(
                in_data->effect_ref, const_cast<PF_ParamDef *>(&param), &wide) == PF_Err_NONE) {
            rgb[0] = wide.red;
            rgb[1] = wide.green;
            rgb[2] = wide.blue;
        }
        in_data->pica_basicP->ReleaseSuite(kPFColorParamSuite, kPFColorParamSuiteVersion1);
    }
}

}  // namespace

PF_Err SetupParams(PF_InData *in_data, PF_OutData *out_data) {
    PF_Err      err = PF_Err_NONE;
    PF_ParamDef def;

    AEFX_CLR_STRUCT(def);
    PF_ADD_LAYER("Shape Layer", PF_LayerDefault_NONE, LG_ID_SHAPE_LAYER);

    AEFX_CLR_STRUCT(def);
    PF_ADD_POPUP("Quality", 4, LG_QUALITY_HIGH, LG_QUALITY_CHOICES, LG_ID_QUALITY);

    AEFX_CLR_STRUCT(def);
    PF_ADD_TOPIC("Refraction", LG_ID_TOPIC_REFRACTION);

    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Strength", 0, 1000, 0, 400, 120,
                         PF_Precision_INTEGER, 0, 0, LG_ID_REFRACT_STRENGTH);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Scale", 25, 400, 50, 200, 100,
                         PF_Precision_TENTHS, PF_ValueDisplayFlag_PERCENT, 0, LG_ID_REFRACT_SCALE);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Curvature", 0, 100, 0, 100, 50,
                         PF_Precision_INTEGER, 0, 0, LG_ID_CURVATURE);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Edge Width", 1, 500, 1, 200, 45,
                         PF_Precision_INTEGER, 0, 0, LG_ID_EDGE_WIDTH);

    AEFX_CLR_STRUCT(def);
    PF_END_TOPIC(LG_ID_TOPIC_REFRACTION_END);

    AEFX_CLR_STRUCT(def);
    PF_ADD_TOPIC("Chromatic Dispersion", LG_ID_TOPIC_DISPERSION);

    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Amount", 0, 300, 0, 150, 22,
                         PF_Precision_INTEGER, 0, 0, LG_ID_DISPERSION);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Edge Reach", 0, 1000, 0, 300, 60,
                         PF_Precision_INTEGER, 0, 0, LG_ID_DISPERSION_EDGE);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Edge Blur", 0, 200, 0, 60, 12,
                         PF_Precision_INTEGER, 0, 0, LG_ID_DISPERSION_BLUR);

    AEFX_CLR_STRUCT(def);
    PF_END_TOPIC(LG_ID_TOPIC_DISPERSION_END);

    AEFX_CLR_STRUCT(def);
    PF_ADD_TOPIC("Glass Body", LG_ID_TOPIC_BODY);

    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Frost", 0, 400, 0, 100, 8,
                         PF_Precision_INTEGER, 0, 0, LG_ID_FROST);
    AEFX_CLR_STRUCT(def);
    PF_ADD_COLOR("Tint Color", 140, 191, 255, LG_ID_TINT_COLOR);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Tint", 0, 100, 0, 100, 15,
                         PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, LG_ID_TINT);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Opacity", 0, 100, 0, 100, 100,
                         PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, LG_ID_GLASS_OPACITY);

    AEFX_CLR_STRUCT(def);
    PF_END_TOPIC(LG_ID_TOPIC_BODY_END);

    AEFX_CLR_STRUCT(def);
    PF_ADD_TOPIC("Specular Highlights", LG_ID_TOPIC_SPECULAR);

    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Intensity", 0, 400, 0, 200, 100,
                         PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, LG_ID_RIM_INTENSITY);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Edge Width", 0, 200, 0, 40, 4,
                         PF_Precision_TENTHS, 0, 0, LG_ID_RIM_WIDTH);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Softness", 0, 100, 0, 20, 1.5,
                         PF_Precision_TENTHS, 0, 0, LG_ID_RIM_SOFTNESS);
    AEFX_CLR_STRUCT(def);
    PF_ADD_ANGLE("Light Angle", 315, LG_ID_LIGHT_ANGLE);
    AEFX_CLR_STRUCT(def);
    PF_ADD_COLOR("Light Color", 255, 255, 255, LG_ID_LIGHT_COLOR);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Highlight Distance", -200, 200, -50, 50, 0,
                         PF_Precision_INTEGER, 0, 0, LG_ID_HIGHLIGHT_DISTANCE);

    AEFX_CLR_STRUCT(def);
    PF_END_TOPIC(LG_ID_TOPIC_SPECULAR_END);

    AEFX_CLR_STRUCT(def);
    PF_ADD_TOPIC("Shadow", LG_ID_TOPIC_SHADOW);

    AEFX_CLR_STRUCT(def);
    PF_ADD_CHECKBOXX("Enable", TRUE, 0, LG_ID_SHADOW_ENABLE);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Opacity", 0, 100, 0, 100, 38,
                         PF_Precision_INTEGER, PF_ValueDisplayFlag_PERCENT, 0, LG_ID_SHADOW_OPACITY);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Distance", 0, 500, 0, 100, 14,
                         PF_Precision_INTEGER, 0, 0, LG_ID_SHADOW_DISTANCE);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Softness", 0, 500, 0, 200, 70,
                         PF_Precision_INTEGER, 0, 0, LG_ID_SHADOW_SOFTNESS);

    AEFX_CLR_STRUCT(def);
    PF_END_TOPIC(LG_ID_TOPIC_SHADOW_END);

    out_data->num_params = LG_NUM_PARAMS;
    return err;
}

PF_Err ReadSettings(PF_InData *in_data, Settings *settings) {
    PF_Err      err = PF_Err_NONE;
    PF_ParamDef param;

    // Everything measured in pixels is authored at full resolution and scaled
    // to whatever the host is actually rendering.
    const float scale = static_cast<float>(in_data->downsample_x.num) /
                        static_cast<float>(in_data->downsample_x.den);

    #define LG_CHECKOUT(INDEX)                                                       \
        AEFX_CLR_STRUCT(param);                                                      \
        ERR(PF_CHECKOUT_PARAM(in_data, (INDEX), in_data->current_time,                \
                              in_data->time_step, in_data->time_scale, &param));      \
        if (err) { return err; }

    #define LG_DONE() ERR(PF_CHECKIN_PARAM(in_data, &param));

    LG_CHECKOUT(LG_QUALITY);
    settings->quality = Quality::FromPopup(param.u.pd.value);
    LG_DONE();

    LG_CHECKOUT(LG_REFRACT_STRENGTH);
    settings->refractStrength = static_cast<float>(param.u.fs_d.value) * scale;
    LG_DONE();

    LG_CHECKOUT(LG_REFRACT_SCALE);
    settings->refractScale = static_cast<float>(param.u.fs_d.value) / 100.f;
    LG_DONE();

    LG_CHECKOUT(LG_CURVATURE);
    settings->curvature = static_cast<float>(param.u.fs_d.value) / 100.f;
    LG_DONE();

    LG_CHECKOUT(LG_EDGE_WIDTH);
    settings->edgeWidth = static_cast<float>(param.u.fs_d.value) * scale;
    LG_DONE();

    LG_CHECKOUT(LG_DISPERSION);
    settings->dispersion = static_cast<float>(param.u.fs_d.value) / 100.f;
    LG_DONE();

    LG_CHECKOUT(LG_DISPERSION_EDGE);
    settings->dispersionEdge = static_cast<float>(param.u.fs_d.value) * scale;
    LG_DONE();

    LG_CHECKOUT(LG_DISPERSION_BLUR);
    settings->dispersionBlur = static_cast<float>(param.u.fs_d.value) * scale;
    LG_DONE();

    LG_CHECKOUT(LG_FROST);
    settings->frost = static_cast<float>(param.u.fs_d.value) * scale;
    LG_DONE();

    LG_CHECKOUT(LG_TINT_COLOR);
    ReadColor(in_data, param, settings->tintColor);
    LG_DONE();

    LG_CHECKOUT(LG_TINT);
    settings->tint = static_cast<float>(param.u.fs_d.value) / 100.f;
    LG_DONE();

    LG_CHECKOUT(LG_GLASS_OPACITY);
    settings->glassOpacity = static_cast<float>(param.u.fs_d.value) / 100.f;
    LG_DONE();

    LG_CHECKOUT(LG_RIM_INTENSITY);
    settings->rimIntensity = static_cast<float>(param.u.fs_d.value) / 100.f;
    LG_DONE();

    LG_CHECKOUT(LG_RIM_WIDTH);
    settings->rimWidth = static_cast<float>(param.u.fs_d.value) * scale;
    LG_DONE();

    LG_CHECKOUT(LG_RIM_SOFTNESS);
    settings->rimSoftness = static_cast<float>(param.u.fs_d.value) * scale;
    LG_DONE();

    LG_CHECKOUT(LG_LIGHT_ANGLE);
    settings->lightAngle = static_cast<float>(param.u.ad.value) / 65536.f;
    LG_DONE();

    LG_CHECKOUT(LG_LIGHT_COLOR);
    ReadColor(in_data, param, settings->lightColor);
    LG_DONE();

    LG_CHECKOUT(LG_HIGHLIGHT_DISTANCE);
    settings->highlightDistance = static_cast<float>(param.u.fs_d.value) * scale;
    LG_DONE();

    LG_CHECKOUT(LG_SHADOW_ENABLE);
    settings->shadowEnable = param.u.bd.value != 0;
    LG_DONE();

    LG_CHECKOUT(LG_SHADOW_OPACITY);
    settings->shadowOpacity = static_cast<float>(param.u.fs_d.value) / 100.f;
    LG_DONE();

    LG_CHECKOUT(LG_SHADOW_DISTANCE);
    settings->shadowDistance = static_cast<float>(param.u.fs_d.value) * scale;
    LG_DONE();

    LG_CHECKOUT(LG_SHADOW_SOFTNESS);
    settings->shadowSoftness = static_cast<float>(param.u.fs_d.value) * scale;
    LG_DONE();

    #undef LG_CHECKOUT
    #undef LG_DONE

    return err;
}

}  // namespace lg
