import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, symlink, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover } from '../shared/package.mjs';
import { Supervisor } from '../shared/supervisor.mjs';
import { Journal } from '../shared/journal.mjs';
const fixture = fileURLToPath(new URL('../fixtures/counter/', import.meta.url));
async function temp(t) { const dir = await mkdtemp(path.join(tmpdir(), 'workbench-spike-')); t.after(() => rm(dir, {recursive:true, force:true})); return dir; }

test('discovery reads manifest without executing plugin; rejects paths and symlink escapes', async t => {
  const dir = await temp(t); await mkdir(path.join(dir,'pkg'));
  const pkg = path.join(dir,'pkg');
  await writeFile(path.join(pkg,'service.mjs'), 'throw Error("must not execute during discovery")');
  const manifest = {id:'fixture.counter',version:'1.0.0',entrypoints:{service:'service.mjs'}};
  await writeFile(path.join(pkg,'manifest.json'), JSON.stringify(manifest));
  assert.equal((await discover(pkg)).manifest.id, manifest.id);
  for (const entry of ['../outside.mjs','/etc/passwd','https://example.com/x.mjs']) {
    await writeFile(path.join(pkg,'manifest.json'), JSON.stringify({...manifest,entrypoints:{service:entry}}));
    await assert.rejects(discover(pkg));
  }
  await writeFile(path.join(dir,'outside.mjs'),''); await symlink('../outside.mjs',path.join(pkg,'escape.mjs'));
  await writeFile(path.join(pkg,'manifest.json'),JSON.stringify({...manifest,entrypoints:{service:'escape.mjs'}}));
  await assert.rejects(discover(pkg));
});

test('two clients share one backend; disconnecting a client does not end work', async t => {
  const host = new Supervisor(); t.after(() => host.stop());
  await host.start(fixture);
  const first = host.client(); const second = host.client();
  const pending = first.call('work',{delay:60});
  first.dispose();
  assert.equal((await pending).completed, true);
  assert.equal((await second.call('stats',{})).executions,1);
  await assert.rejects(first.call('stats',{}), /CLIENT_DISPOSED/);
});

test('backend crash invalidates old clients and never replays a write', async t => {
  const host = new Supervisor(); t.after(() => host.stop());
  await host.start(fixture); const old = host.client();
  await old.call('work',{delay:1});
  const pending = old.call('work',{delay:10000});
  const rejected = assert.rejects(pending,/PROCESS_EXITED/);
  assert.deepEqual(await old.call('stats',{}),{executions:2,completed:1});
  await host.crash(); await rejected;
  await host.start(fixture);
  await assert.rejects(old.call('stats',{}),/STALE_GENERATION/);
  assert.equal((await host.client().call('stats',{})).executions,0);
});

test('deadline stops waiting, not the backend side effect', async t => {
  const host = new Supervisor(); t.after(() => host.stop()); await host.start(fixture);
  const c = host.client(); await assert.rejects(c.call('work',{delay:50},5),/TIMEOUT/);
  await new Promise(r=>setTimeout(r,80));
  assert.deepEqual(await c.call('stats',{}),{executions:1,completed:1});
});

test('journal deduplicates submissions and recovers uncertain work without execution', async t => {
  const dir = await temp(t); const file = path.join(dir,'jobs.json');
  const j = new Journal(file); await j.load();
  const first = await j.submit('k1',{file:'a'});
  assert.equal((await j.submit('k1',{file:'a'})).id,first.id);
  await assert.rejects(j.submit('k1',{file:'b'}),/IDEMPOTENCY_CONFLICT/);
  await j.update(first.id,'running');
  const restored = new Journal(file); await restored.load();
  assert.equal(restored.get(first.id).status,'unknown');
  await restored.update(first.id,'cancel_requested');
  assert.equal(restored.get(first.id).status,'cancel_requested');
  await restored.update(first.id,'succeeded');
  await assert.rejects(restored.update(first.id,'cancelled'),/TERMINAL_STATE/);
});

test('corrupt journal is preserved rather than replaced with empty data', async t => {
  const dir = await temp(t); const file=path.join(dir,'jobs.json');
  await writeFile(file,'not-json'); const j = new Journal(file);
  await assert.rejects(j.load());
  await assert.rejects(j.submit('new',{}),/JOURNAL_NOT_READY/);
  assert.equal(await readFile(file,'utf8'),'not-json');
});


test('manifest requires string identity, missing and null IDs are rejected', async t => {
  const dir=await temp(t); await writeFile(path.join(dir,'entry.mjs'),'');
  for(const id of [undefined,null,123]) {
    await writeFile(path.join(dir,'manifest.json'),JSON.stringify({id,version:'1.0.0',entrypoints:{service:'entry.mjs'}}));
    await assert.rejects(discover(dir),/INVALID_MANIFEST/);
  }
});

test('concurrent activation creates only one backend', async t => {
  const host=new Supervisor(); t.after(()=>host.stop());
  // Record spawn events externally, so a leaked worker is also cleaned up on failure.
  const {default: childProcess}=await import('node:child_process');
  const original=childProcess.ChildProcess.prototype.spawn;const children=[];
  childProcess.ChildProcess.prototype.spawn=function(...args){children.push(this);return original.apply(this,args);};
  t.after(()=>{childProcess.ChildProcess.prototype.spawn=original;for(const c of children)c.kill();});
  await Promise.allSettled([host.start(fixture),host.start(fixture)]);
  assert.equal(children.length,1);
  assert.equal((await host.client().call('stats',{})).executions,0);
});

test('desktop activation waits for ready and rejects exit/timeout', async () => {
  const { EventEmitter }=await import('node:events');
  const { waitUntilReady }=await import('../shared/activation.mjs');
  const child=new EventEmitter();let ready=false;
  const pending=waitUntilReady(child,100).then(()=>{ready=true;});
  child.emit('message',{type:'response'});await Promise.resolve();assert.equal(ready,false);
  child.emit('message',{type:'ready'});await pending;assert.equal(ready,true);
  assert.equal(child.listenerCount('message'),0);
  const exits=new EventEmitter();const exited=assert.rejects(waitUntilReady(exits,100),/ACTIVATION_EXIT/);
  exits.emit('exit',1);await exited;
  await assert.rejects(waitUntilReady(new EventEmitter(),5),/ACTIVATION_TIMEOUT/);
});
