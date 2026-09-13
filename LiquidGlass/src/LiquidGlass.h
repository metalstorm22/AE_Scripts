/*
 *  LiquidGlass.h — plugin identity, parameter map and shared types.
 *
 *  Everything a caller needs to know about the effect's shape lives here: the
 *  parameter indices, the disk IDs that keep old projects loading after the
 *  parameter list grows, and the settings struct the render passes work from.
 *
 *  The render itself knows nothing about After Effects. LG_Image, LG_Filters
 *  and LG_Glass operate on plain float buffers, so they can be unit tested and
 *  reasoned about without a host.
 */
#pragma once

#define PF_DEEP_COLOR_AWARE 1

#include "AEConfig.h"
#include "entry.h"
#include "AE_Effect.h"
#include "AE_EffectCB.h"
#include "AE_Macros.h"
#include "Param_Utils.h"
#include "AE_EffectCBSuites.h"
#include "String_Utils.h"
#include "AE_GeneralPlug.h"
#include "Smart_Utils.h"
#include "AEGP_SuiteHandler.h"
#include "AEFX_SuiteHelper.h"

// ---------------------------------------------------------------------------
// Identity. Change these four lines to rebrand the plugin; nothing else in the
// source refers to the name. The match name is what a project file stores, so
// once a project has been saved with this effect it must never change.
// ---------------------------------------------------------------------------
#define LG_NAME             "Liquid Glass"
#define LG_MATCH_NAME       "PG LiquidGlass"
#define LG_CATEGORY         "PG Tools"
#define LG_SUPPORT_URL      "https://github.com/"

#define LG_MAJOR_VERSION    1
#define LG_MINOR_VERSION    0
#define LG_BUG_VERSION      0
#define LG_STAGE_VERSION    PF_Stage_DEVELOP
#define LG_BUILD_VERSION    1

// ---------------------------------------------------------------------------
// Parameter indices. Order here is the order in the Effect Controls panel.
// ---------------------------------------------------------------------------
enum {
    LG_INPUT = 0,
    LG_SHAPE_LAYER,
    LG_QUALITY,

    LG_TOPIC_REFRACTION,
    LG_REFRACT_STRENGTH,
    LG_REFRACT_SCALE,
    LG_CURVATURE,
    LG_EDGE_WIDTH,
    LG_TOPIC_REFRACTION_END,

    LG_TOPIC_DISPERSION,
    LG_DISPERSION,
    LG_DISPERSION_EDGE,
    LG_DISPERSION_BLUR,
    LG_TOPIC_DISPERSION_END,

    LG_TOPIC_BODY,
    LG_FROST,
    LG_TINT_COLOR,
    LG_TINT,
    LG_GLASS_OPACITY,
    LG_TOPIC_BODY_END,

    LG_TOPIC_SPECULAR,
    LG_RIM_INTENSITY,
    LG_RIM_WIDTH,
    LG_RIM_SOFTNESS,
    LG_LIGHT_ANGLE,
    LG_LIGHT_COLOR,
    LG_HIGHLIGHT_DISTANCE,
    LG_TOPIC_SPECULAR_END,

    LG_TOPIC_SHADOW,
    LG_SHADOW_ENABLE,
    LG_SHADOW_OPACITY,
    LG_SHADOW_DISTANCE,
    LG_SHADOW_SOFTNESS,
    LG_TOPIC_SHADOW_END,

    LG_NUM_PARAMS
};

/*
 *  Disk IDs are written into project files. They must be stable and unique
 *  forever — append new ones, never renumber or reuse.
 */
enum {
    LG_ID_SHAPE_LAYER = 1,
    LG_ID_QUALITY,
    LG_ID_TOPIC_REFRACTION,
    LG_ID_REFRACT_STRENGTH,
    LG_ID_REFRACT_SCALE,
    LG_ID_CURVATURE,
    LG_ID_EDGE_WIDTH,
    LG_ID_TOPIC_REFRACTION_END,
    LG_ID_TOPIC_DISPERSION,
    LG_ID_DISPERSION,
    LG_ID_DISPERSION_EDGE,
    LG_ID_DISPERSION_BLUR,
    LG_ID_TOPIC_DISPERSION_END,
    LG_ID_TOPIC_BODY,
    LG_ID_FROST,
    LG_ID_TINT_COLOR,
    LG_ID_TINT,
    LG_ID_GLASS_OPACITY,
    LG_ID_TOPIC_BODY_END,
    LG_ID_TOPIC_SPECULAR,
    LG_ID_RIM_INTENSITY,
    LG_ID_RIM_WIDTH,
    LG_ID_RIM_SOFTNESS,
    LG_ID_LIGHT_ANGLE,
    LG_ID_LIGHT_COLOR,
    LG_ID_HIGHLIGHT_DISTANCE,
    LG_ID_TOPIC_SPECULAR_END,
    LG_ID_TOPIC_SHADOW,
    LG_ID_SHADOW_ENABLE,
    LG_ID_SHADOW_OPACITY,
    LG_ID_SHADOW_DISTANCE,
    LG_ID_SHADOW_SOFTNESS,
    LG_ID_TOPIC_SHADOW_END
};

#define LG_QUALITY_CHOICES  "Draft|Standard|High|Ultra"
#define LG_QUALITY_DRAFT    1
#define LG_QUALITY_STANDARD 2
#define LG_QUALITY_HIGH     3
#define LG_QUALITY_ULTRA    4

extern "C" {
    DllExport PF_Err EffectMain(PF_Cmd        cmd,
                                PF_InData    *in_data,
                                PF_OutData   *out_data,
                                PF_ParamDef  *params[],
                                PF_LayerDef  *output,
                                void         *extra);
}
