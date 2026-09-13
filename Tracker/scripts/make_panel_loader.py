"""Build an installable ScriptUI entry referencing this development checkout."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
out=root/'dist/SceneTrack.jsx';out.parent.mkdir(exist_ok=True)
lib=(root/'ae/lib.jsx').as_posix();entry=(root/'ae/SceneTrack.jsx').as_posix()
# #include is resolved during preprocessing; top-level `this` remains the dockable Panel.
# Store the engine root explicitly because $.fileName refers to the loader when included.
text='#target aftereffects\n#targetengine "SceneTrack"\nvar SCENETRACK_ROOT='+json.dumps(str(root))+';\n#include '+json.dumps(entry)+'\n'
out.write_text(text)
print(out)
