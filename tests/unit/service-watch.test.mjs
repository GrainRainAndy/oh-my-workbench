import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('preload subscriptions filter service/version and remove the exact listener on disposal',()=>{
  const ipcRenderer=new EventEmitter();
  const apis={};
  const contextBridge={exposeInMainWorld:(name,api)=>{apis[name]=api;}};
  const source=readFileSync(new URL('../../apps/desktop/preload.cjs',import.meta.url),'utf8');
  runInNewContext(source,{require:()=>({ipcRenderer,contextBridge})});
  let received=0;
  const signal=version=>ipcRenderer.emit('services:invalidated',{}, {service:'counter',version});
  const persistent=apis.viewServices.watch('counter','1',()=>received++);
  for(let i=0;i<100;i++){
    const dispose=apis.viewServices.watch('counter','2',()=>received+=10);
    signal('1');signal('2');
    dispose();dispose();signal('2');
    assert.equal(ipcRenderer.listenerCount('services:invalidated'),1);
  }
  persistent();
  assert.equal(received,1100);
  assert.equal(ipcRenderer.listenerCount('services:invalidated'),0);
});

test('retired workers cannot invalidate a replacement or acknowledge its outstanding call',async()=>{
  const {createServices}=await import('../../packages/host-core/src/runtime/services.cjs');
  const dependency={id:'counter',version:'1'};
  const plugin={id:'example',enabled:true,usesServices:[dependency],services:[{...dependency,
    methods:{edit:{input:'string',output:'string',invalidates:true}}}]};
  const children=[],events=[];
  const services=createServices({plugins:{list:()=>[plugin]},notify:event=>events.push(event),fork(){
    const child=new EventEmitter();
    child.kill=()=>{};
    child.postMessage=message=>{child.request=message;};
    children.push(child);
    queueMicrotask(()=>child.emit('message',{ready:true}));
    return child;
  }});
  const edit=()=>services.call('example',{service:'counter',version:'1',method:'edit',input:'value'});
  const first=edit();
  await new Promise(resolve=>setImmediate(resolve));
  children[0].emit('message',{id:children[0].request.id,result:'saved'});
  services.stop('example');
  const second=edit();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(await first,'saved');
  assert.deepEqual(events,[]);
  const nextReply={id:children[1].request.id,result:'saved'};
  children[0].emit('message',nextReply);
  children[0].emit('exit');
  assert.equal(services.busy(),true);
  children[1].emit('message',nextReply);
  assert.equal(await second,'saved');
  assert.deepEqual(events,[{service:'counter',version:'1',provider:'example'}]);
  assert.equal(services.busy(),false);
  const pending=edit();
  await new Promise(resolve=>setImmediate(resolve));
  const pendingId=children[1].request.id;
  services.stop('example');
  await assert.rejects(pending,/服务已停止/);
  children[0].emit('message',{id:pendingId,result:'late'});
  assert.equal(services.busy(),true);
  children[1].emit('exit');
  assert.equal(services.busy(),false);
  services.close();
});

test('service array contracts reject holes in both directions and dispatch the validated values',async()=>{
  const {createServices}=await import('../../packages/host-core/src/runtime/services.cjs');
  const service={id:'echo',version:'1',methods:{echo:{input:'string[]',output:'string[]'}}};
  const plugin={id:'example',enabled:true,usesServices:[service],services:[service]};
  let starts=0,sparseReply=false;
  const broker=createServices({plugins:{list:()=>[plugin]},fork(){
    starts++;
    const child=new EventEmitter();
    child.kill=()=>{};
    child.postMessage=request=>queueMicrotask(()=>child.emit('message',{id:request.id,result:sparseReply?Array(1):request.input}));
    queueMicrotask(()=>child.emit('message',{ready:true}));
    return child;
  }});
  const call=input=>broker.call(plugin.id,{service:'echo',version:'1',method:'echo',input});
  try{
    await assert.rejects(call(Array(1)),/服务参数无效/);
    assert.equal(starts,0);
    const input=['before'];
    const pending=call(input);
    input[0]='after';
    assert.deepEqual(await pending,['before']);
    sparseReply=true;
    await assert.rejects(call([]),/服务结果无效/);
  }finally{broker.close();}
});

test('notifications require a live enabled provider with declared capability',async()=>{
  const {createServices}=await import('../../packages/host-core/src/runtime/services.cjs');
  const owner={id:'example',name:'示例',enabled:true};
  const worker=new EventEmitter();
  worker.kill=()=>{};
  const sent=[];
  const runtime=createServices({plugins:{list:()=>[owner]},fork:()=>worker,showNotification:(...args)=>sent.push(args)});
  const ready=runtime.activate(owner.id);
  worker.emit('message',{ready:true});
  await ready;
  const send=(body)=>worker.emit('message',{type:'notification',body});
  send('未声明');
  owner.notifications=true;
  send('提醒');
  send('a'.repeat(257));
  owner.enabled=false;
  send('已停用');
  owner.enabled=true;
  runtime.close();
  send('已退出');
  assert.deepEqual(sent,[['示例','提醒','example']]);
});

test('notification submission contains native failures and reports only observed outcomes',async()=>{
  const {submitNotification}=await import('../../packages/host-core/src/platform/notifications.cjs');
  let mode='unsupported';
  class Notice extends EventEmitter{
    static isSupported(){return mode!=='unsupported';}
    show(){
      if(mode==='throws')throw Error('native error');
      if(mode==='silent')return;
      this.emit(mode);
    }
  }
  const outcomes=[];
  for(mode of ['unsupported','throws','failed','silent','show']){
    submitNotification(Notice,'日程','提醒',value=>outcomes.push(value));
  }
  assert.deepEqual(outcomes,['unsupported','failed','failed','shown']);
});
