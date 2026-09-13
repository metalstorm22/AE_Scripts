"""Quick-return launcher used by AE; worker owns its job directory and log."""
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
job = Path(sys.argv[1]).resolve()
if not (job/'config.json').is_file():
    raise SystemExit('Missing config.json')
with (job/'worker.log').open('w') as log:
    process = subprocess.Popen([sys.executable,str(root/'worker/solve.py'),'--job',str(job)],
        stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
print(json.dumps(dict(pid=process.pid,job=str(job))))
