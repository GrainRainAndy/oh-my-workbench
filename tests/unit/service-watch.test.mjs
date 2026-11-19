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
