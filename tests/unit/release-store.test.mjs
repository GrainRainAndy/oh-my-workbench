import test from 'node:test';
import {execFileSync} from 'node:child_process';

// Python's temporary directory contains the entire archive for this test.
test('package retention protects running, linked and milestone archives',()=>{
  execFileSync('python3',['-B','-c',`
import json, os, runpy, tempfile
from pathlib import Path
api=runpy.run_path('scripts/release-store.py')
rotate=api['rotate']
g=rotate.__globals__
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp)
    store=root/'release'
    store.mkdir()
    names=[f'macos-arm64-{i:06d}' for i in range(8)]
    for i,name in enumerate(names):
        d=store/name
        (d/g['APP']).mkdir(parents=True)
        os.utime(d,(100+i,100+i))
    (root/'docs/qa/evidence').mkdir(parents=True)
    (root/'docs/preview-macos.md').write_text('release/'+names[1]+'/test.dmg')
    (root/'docs/qa/evidence/runtime-progress.md').write_text('')
    g.update(ROOT=root,STORE=store,output=lambda *cmd:str(store/names[0])+'/app')
    for i,name in enumerate(names[:4]):
        d=store/'checkpoints'/name
        d.mkdir(parents=True)
        (d/'build.json').write_text(json.dumps(dict(kind='checkpoint',built_at=str(i))))
    milestone=store/'milestones'/'v1.0.0'
    milestone.mkdir(parents=True)
    rotate(False,None)
    assert len(list(store.glob('macos-*')))==8
    rotate(True,None)
    assert {p.name for p in store.glob('macos-*')}==set(names)-{names[2]}
    assert {p.name for p in (store/'checkpoints').iterdir()}==set(names[1:4])
    assert milestone.is_dir()
`]);
});
