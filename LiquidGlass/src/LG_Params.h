/*
 *  LG_Params.h — the parameter list, in one place.
 *
 *  Adding a control means three edits and no more: an index in LiquidGlass.h,
 *  a disk ID next to it, and one line in each of the two functions here.
 */
#pragma once

#include "LiquidGlass.h"
#include "LG_Glass.h"

namespace lg {

/** Builds the Effect Controls panel. */
PF_Err SetupParams(PF_InData *in_data, PF_OutData *out_data);

/**
 * Reads the whole parameter set at the current time into resolved Settings.
 * Percentages become fractions and every pixel distance is multiplied by the
 * host's downsample factor, so half-resolution previews match a full render
 * instead of quietly halving the look.
 */
PF_Err ReadSettings(PF_InData *in_data, Settings *settings);

}  // namespace lg
