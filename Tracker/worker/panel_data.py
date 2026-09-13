"""Small, presentation-only result for ScriptUI. Full numerical result is preserved."""
import json
from pathlib import Path

def pack(data,path):
    out={k:v for k,v in data.items() if k!='models'};out['models']=[]
    for m in data['models']:
        row={k:v for k,v in m.items() if k not in ('observations','poses')}
        row['poses']=[{k:v for k,v in p.items() if k not in ('R','t')} for p in m['poses']]
        row['observations']=[]
        for o in m['observations']:
            points=o['points'];step=max(1,(len(points)+99)//100)
            row['observations'].append(dict(frame=o['frame'],points=[dict(id=p['id'],uv=[round(x,2) for x in p['uv']]) for p in points[::step]]))
        out['models'].append(row)
    Path(path).write_text(json.dumps(out,separators=(',',':')))
    placement={k:v for k,v in out.items() if k!='models'}
    placement['models']=[]
    for model,full in zip(out['models'],data['models']):
        row={k:v for k,v in model.items() if k!='observations'}
        row['observations']=[dict(frame=o['frame'],points=[dict(id=p['id']) for p in o['points']]) for o in full['observations']]
        placement['models'].append(row)
    Path(path).with_name('placement.json').write_text(json.dumps(placement,separators=(',',':')))


if __name__=='__main__':
    import sys
    p=Path(sys.argv[1]);pack(json.loads(p.read_text()),p.with_name('panel.json'))
