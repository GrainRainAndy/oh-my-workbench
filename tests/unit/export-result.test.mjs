import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {exportJobResult} from '../../apps/desktop/export.cjs';

test('job export reports only completed writes and cleans up after a failed replacement',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'workbench-export-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const jobs={list:()=>[{id:'done',status:'succeeded',result:'完整结果\n'}]};
  const save=destination=>exportJobResult(jobs,'done',async()=>destination);
  const filePath=join(dir,'result.txt');
  await writeFile(filePath,'existing');
  assert.equal(await save({canceled:true,filePath}),false);
  assert.equal(await readFile(filePath,'utf8'),'existing');
  const folder=join(dir,'occupied');
  await mkdir(folder);
  await assert.rejects(()=>save({canceled:false,filePath:folder}),{code:'EISDIR'});
  assert.deepEqual((await readdir(dir)).sort(),['occupied','result.txt']);
  assert.equal(await save({canceled:false,filePath}),true);
  assert.equal(await readFile(filePath,'utf8'),'完整结果\n');
});
