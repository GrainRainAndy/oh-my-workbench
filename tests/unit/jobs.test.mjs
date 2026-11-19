import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import registry from '../../packages/host-core/src/jobs/registry.cjs';
const job={type:'export',title:'导出'};
test('deduplicates concurrent requests and preserves uncertain work without replay',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'workbench-jobs-'));
  let calls=0,finish;
  function open(){return registry.openJobs(join(dir,'jobs.sqlite'),{execute:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});}
  let db=open();
  try{
    const first=db.submit('a',job,'key',['a']);
    assert.equal(db.submit('a',job,'key',['a']).id,first.id);
    assert.throws(()=>db.submit('a',job,'key',['b']));
    await Promise.resolve();
    assert.equal(calls,1);
    db.close();db=open();
    assert.equal(db.submit('a',job,'key',['a']).status,'unknown');
    finish('late');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(db.list()[0].status,'unknown');
    assert.equal(calls,1);
  }finally{db.close();rmSync(dir,{recursive:true});}
});

test('SIGKILL after handler accepts leaves a durable unknown job without resubmission',async()=>{
  const {fork}=await import('node:child_process');
  const {once}=await import('node:events');
  const {readFileSync}=await import('node:fs');
  const dir=mkdtempSync(join(tmpdir(),'workbench-kill-'));
  const file=join(dir,'jobs.sqlite'),log=join(dir,'accepted.txt');
  const child=fork(new URL('../fixtures/interrupted-job.cjs',import.meta.url),[file,log],{stdio:['ignore','ignore','inherit','ipc']});
  const exited=once(child,'exit');
  let db;
  try{
    const [ack]=await once(child,'message',{signal:AbortSignal.timeout(5000)});
    assert.equal(ack,'accepted');
    child.kill('SIGKILL');
    assert.equal((await exited)[1],'SIGKILL');
    let attempts=0;
    db=registry.openJobs(file,{execute:()=>{attempts++;}});
    const record=db.submit('fixture',{type:'export',title:'导出'},'once',['one']);
    assert.equal(record.status,'unknown');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(attempts,0);
    assert.equal(readFileSync(log,'utf8'),'accepted\n');
    assert.equal(db.list().length,1);
  }finally{
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
    await exited;
    db?.close();rmSync(dir,{recursive:true});
  }
});

test('completion racing a cancellation request remains successful; unsupported cancellation is rejected',async()=>{
  let complete;
  const store=registry.openJobs(':memory:',{execute:()=>new Promise(resolve=>{complete=resolve;})});
  try{
    const id=store.submit('a',{...job,cancellable:true},'race',['x']).id;
    await Promise.resolve();
    assert.equal(store.cancel(id).status,'cancel_requested');
    assert.equal(store.cancel(id).status,'cancel_requested');
    complete('completed');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(store.cancel(id).status,'succeeded');
    const unsupported=store.submit('a',job,'other',['x']);
    assert.throws(()=>store.cancel(unsupported.id),/不支持取消/);
  }finally{store.close();}
});

test('progress is monotonic, revisioned and survives an interrupted run',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'job-progress-'));
  const file=join(dir,'jobs.sqlite');
  let report;
  let db=registry.openJobs(file,{execute:(_owner,_job,_input,_signal,progress)=>{
    report=progress;return new Promise(()=>{});
  }});
  try{
    const receipt=db.submit('fixture',job,'progress',[]);
    assert.equal(receipt.progress,null);
    await Promise.resolve();
    for(const percent of [40,10,40,101])report(percent);
    assert.equal(db.list()[0].revision,receipt.revision+1);
    db.close();db=registry.openJobs(file,{execute:()=>assert.fail()});
    assert.equal(db.list()[0].status,'unknown');
    assert.equal(db.list()[0].progress,40);
  }finally{db.close();rmSync(dir,{recursive:true});}
});
