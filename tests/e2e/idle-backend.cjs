const assert=require('node:assert/strict');
const {once}=require('node:events');
const {mkdtemp,writeFile,readFile,rm}=require('node:fs/promises');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const {setTimeout:delay}=require('node:timers/promises');
const {app,utilityProcess}=require('electron');
const {createServices}=require('../../packages/host-core/src/runtime/services.cjs');

async function verify(){
  const realTime=process.argv.includes('--real-time');
  const dir=await mkdtemp(join(tmpdir(),'workbench-idle-'));
  const backend=join(dir,'backend.mjs'),marker=join(dir,'disposed');
  await writeFile(backend,`import {writeFile} from 'node:fs/promises';
    export async function call(service,method,input){await new Promise(r=>setTimeout(r,Number(input)));return String(process.pid);}
    export async function dispose(){await writeFile(${JSON.stringify(marker)},String(process.pid));}`);
  const spec={id:'sample',version:'1',methods:{wait:{input:'string',output:'string'}}};
  const plugin={id:'sample',enabled:true,usesServices:[spec],services:[spec]};
  let child;
  const broker=createServices({plugins:{list:()=>[plugin]},idleMs:realTime?undefined:80,fork:()=>{
    child=utilityProcess.fork(resolve('apps/desktop/service-worker.cjs'),[backend,dir]);
    return child;
  }});
  const call=input=>broker.call('sample',{service:'sample',version:'1',method:'wait',input});
  try{
    const pending=call('200');
    broker.setWindowless(true);
    const pid=await pending;
    broker.setWindowless(false);
    await delay(150);
    assert.equal(await call('0'),pid);
    const exited=once(child,'exit');
    const idleStart=performance.now();
    broker.setWindowless(true);
    assert.deepEqual(await exited,[0]);
    const exitAfterMs=Math.round(performance.now()-idleStart);
    if(realTime)assert.ok(exitAfterMs>=59_990,'按需后台提前退出');
    assert.equal(await readFile(marker,'utf8'),pid);
    broker.setWindowless(false);
    const restarted=await call('0');
    assert.notEqual(restarted,pid);
    plugin.backgroundMode='resident';
    broker.setWindowless(true);
    const residentStart=performance.now();
    await delay(realTime?61_000:200);
    assert.equal(await call('0'),restarted);
    if(realTime)console.log(JSON.stringify({exitAfterMs,originalPid:pid,residentPid:restarted,residentRespondedAfterMs:Math.round(performance.now()-residentStart)}));
  }finally{broker.close();await rm(dir,{recursive:true,force:true});}
}
app.whenReady().then(verify).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
