import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const profile=await mkdtemp(join(tmpdir(),'workbench-packaged-'));
const binary=join(resolve(process.argv[2]),'Contents/MacOS/Electron');
const started=performance.now();
const child=spawn(binary,['--remote-debugging-pipe','--user-data-dir='+profile],{stdio:['ignore','ignore','inherit','pipe','pipe']});
const exit=once(child,'exit');
const pending=new Map();
let sequence=0,buffer='';
child.stdio[4].setEncoding('utf8').on('data',part=>{
  buffer+=part;
  let end;
  while((end=buffer.indexOf('\0'))>=0){
    const reply=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);
    const handler=pending.get(reply.id);
    if(handler){pending.delete(reply.id);handler(reply);}
  }
});
async function send(method,params={},sessionId){
  const id=++sequence;
  return new Promise((accept,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},5000);
    pending.set(id,reply=>{
      clearTimeout(timer);
      if(reply.error)reject(Error(reply.error.message));else accept(reply.result);
    });
    child.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');
  });
}
try{
  let target;
  for(let i=0;i<100&&!target;i++){
    const {targetInfos}=await send('Target.getTargets');
    target=targetInfos.find(t=>t.type==='page'&&t.url.endsWith('/apps/desktop/dist/index.html'));
    if(!target)await delay(50);
  }
  assert.ok(target,'Packaged renderer did not open');
  const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  async function evaluate(expression){
    const reply=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
    if(reply.exceptionDetails)throw Error(reply.exceptionDetails.exception?.description??reply.exceptionDetails.text);
    return reply.result.value;
  }
  let ready=false;
  for(let i=0;i<100&&!ready;i++){
    ready=await evaluate("Boolean(window.workspaces && document.querySelector('.welcome'))");
    if(!ready)await delay(50);
  }
  assert.ok(ready,await evaluate("document.body?.innerText?.slice(0,400)"));
  if(process.argv.includes('--finder-reveal')){
    const {createInterface}=await import('node:readline/promises');
    await evaluate("document.querySelector('.manage-link').click()");
    await evaluate("document.querySelector('.backup-card>button').click()");
    for(let i=0;i<100&&!await evaluate("!!document.querySelector('.backup-receipt button')");i++)await delay(50);
    const [backup]=await evaluate('window.backups.list()');
    assert.ok(backup?.id);
    await evaluate("document.querySelector('.backup-receipt button').click()");
    console.log('Expected selected Finder folder:',join(profile,'backups',backup.id));
    const prompt=createInterface({input:process.stdin,output:process.stdout});
    try{
      const selected=await prompt.question('Enter the folder name actually selected in Finder: ');
      assert.equal(selected.trim(),backup.id);
    }finally{prompt.close();}
  }else if(process.argv.includes('--visual-flow')){
    const {captureFlow}=await import('./visual-flow.mjs');
    await captureFlow({evaluate,send,sessionId,output:process.argv[process.argv.indexOf('--visual-flow')+1]});
  }else if(process.argv.includes('--windowless-job')){
    const {measureWindowless}=await import('../performance/windowless-job.mjs');
    await measureWindowless({send,evaluate,target,profile,pid:child.pid,binary});
  }else if(process.argv.includes('--cycles')){
    const {measureCycles}=await import('../performance/window-cycles.mjs');
    await measureCycles({send,binary,profile,pid:child.pid,target,evaluate,
      outputRoot:process.argv[process.argv.indexOf('--cycles')+1]});
  }else if(process.argv.includes('--idle')){
    const {measureIdle}=await import('../performance/idle.mjs');
    await measureIdle(child.pid,process.argv[2],process.argv[process.argv.indexOf('--idle')+1]);
  }else if(process.argv.includes('--dense')){
    const {verifyDenseWorkspace}=await import('./dense-workspace.mjs');
    await verifyDenseWorkspace({evaluate,send,sessionId});
    if(process.argv.includes('--drag')){
      const {measureDrag}=await import('../performance/drag.mjs');
      await measureDrag({evaluate,send,sessionId,binary});
    }
    if(process.argv.includes('--three-backends')){
      const {measureMixed}=await import('../performance/mixed.mjs');
      await measureMixed({evaluate,pid:child.pid,binary});
    }
  }else if(process.argv.includes('--sample')){
    const {sample}=await import('../performance/sample.mjs');
    await sample({startup:performance.now()-started,evaluate,send,sessionId,pid:child.pid});
  }else{
  const result=await evaluate(`(async()=>{
    const workspace=await window.workspaces.save({schemaVersion:1,id:'smoke',revision:0,name:'包内验证',activePaneId:'p',layout:{type:'leaf',paneId:'p',viewInstanceId:'v'},views:{v:{id:'v',pluginId:'fixture.palette',viewType:'palette',configVersion:1,stateVersion:1,config:{},state:{}}}});
    return window.viewServices.call({workspaceId:workspace.id,viewId:'v',service:'workbench.palette.css',version:'1.0.0',method:'format',input:['#123456']});
  })()`);
  assert.match(result,/--color-1: #123456/);
  await send('Page.enable',{},sessionId);
  await send('Page.reload',{},sessionId);
  let visible=false;
  for(let i=0;i<100&&!visible;i++){
    visible=await evaluate("document.querySelector('.swatches code')?.textContent==='#273f39'");
    if(!visible)await delay(50);
  }
  assert.ok(visible,'Packaged plugin UI failed to render');
  console.log('Packaged workspace restored. Plugin UI and utility-process service loaded from the application bundle.');
  }
}finally{
  child.kill('SIGTERM');
  const force=setTimeout(()=>child.kill('SIGKILL'),3000);
  try{await exit;}finally{clearTimeout(force);await rm(profile,{recursive:true,force:true});}
}
