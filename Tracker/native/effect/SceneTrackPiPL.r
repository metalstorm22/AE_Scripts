#include "AEConfig.h"
#include "AE_EffectVers.h"
#include <AE_General.r>
resource 'PiPL' (16000) {{
 Kind {AEEffect}, Name {"SceneTrack"}, Category {"SceneTrack"},
 CodeMacIntel64 {"EffectMain"}, CodeMacARM64 {"EffectMain"},
 AE_PiPL_Version {2,0}, AE_Effect_Spec_Version {PF_PLUG_IN_VERSION,PF_PLUG_IN_SUBVERS},
 AE_Effect_Version {65537}, AE_Effect_Info_Flags {0},
 AE_Effect_Global_OutFlags {0x02008400}, AE_Effect_Global_OutFlags_2 {0},
 AE_Effect_Match_Name {"SceneTrack Camera Tracker"}, AE_Reserved_Info {0}
}};
