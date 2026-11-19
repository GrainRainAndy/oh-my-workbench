import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,open,rename,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReadScope,readSelectedFile} from '../../packages/host-core/src/platform/selected-file.cjs';

test('selected-file reads retain the exact bytes at the limit and reject directories and oversized files',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'workbench-selection-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'original'),link=join(dir,'selected');
  await writeFile(file,Buffer.from([0,128,255]));
  await symlink(file,link);
  assert.deepEqual(await readSelectedFile(link,3),Buffer.from([0,128,255]));
  await assert.rejects(readSelectedFile(link,2),{code:'EFBIG'});
  await assert.rejects(readSelectedFile(dir,100000),/普通文件/);
});

test('replacing a selected file during a real read rejects the result and closes its handle',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'workbench-selection-change-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const selected=join(dir,'layout.json');
  const replacement=join(dir,'next.json');
  await writeFile(selected,'first');
  await writeFile(replacement,'other');
  const probe=await open(selected);
  const prototype=Object.getPrototypeOf(probe);
  await probe.close();
  const read=prototype.read;
  let opened;
  const hook=t.mock.method(prototype,'read',async function(...args){
    const result=await read.apply(this,args);
    if(!opened){
      opened=this;
      await rename(replacement,selected);
    }
    return result;
  });
  await assert.rejects(readSelectedFile(selected,5),/文件已变化/);
  assert.equal(opened.fd,-1);
  hook.mock.restore();
  assert.equal((await readSelectedFile(selected,5)).toString(),'other');
});

test('read grants bind to one scope and selected file, and revocation prevents pending delivery',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'workbench-read-grant-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'selected');
  await writeFile(path,'first');
  const owner=createReadScope(5),other=createReadScope(5);
  const token=await owner.grant(path);
  assert.equal((await owner.read(token)).toString(),'first');
  await assert.rejects(other.read(token),/已失效/);
  await writeFile(join(dir,'next'),'other');
  await rename(join(dir,'next'),path);
  await assert.rejects(owner.read(token),/已变化/);
  const replacement=await owner.grant(path);
  const pending=owner.read(replacement);
  owner.revoke(replacement);
  await assert.rejects(pending,/已失效/);
  owner.close();
  await assert.rejects(owner.grant(path),/已失效/);
  await assert.rejects(owner.read(token),/已失效/);
  other.close();
});

test('single-file delegation ends independently and respects owner revocation during a read',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'workbench-delegation-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'input');
  await writeFile(path,'hello');
  const scope=createReadScope(5);
  const token=await scope.grant(path);
  assert.throws(()=>scope.delegate('unknown'),/授权已失效/);
  const first=scope.delegate(token),second=scope.delegate(token);
  assert.equal((await first.read()).toString(),'hello');
  const pending=first.read();
  first.close();
  await assert.rejects(pending,/委托已结束/);
  await assert.rejects(first.read(),/委托已结束/);
  assert.equal((await second.read()).toString(),'hello');
  const reading=second.read();
  scope.revoke(token);
  await assert.rejects(reading,/授权已失效/);
  await assert.rejects(second.read(),/授权已失效/);
  scope.close();
});
