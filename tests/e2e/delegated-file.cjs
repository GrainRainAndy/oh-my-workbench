const assert=require('node:assert/strict');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const {app,utilityProcess}=require('electron');
const {createServices}=require('../../packages/host-core/src/runtime/services.cjs');
const {createReadScope}=require('../../packages/host-core/src/platform/selected-file.cjs');

async function verify(){
  const dir=await mkdtemp(join(tmpdir(),'workbench-file-service-'));
  const scope=createReadScope(100);
  const service={id:'read',version:'1',methods:{inspect:{input:'string',output:'string'}}};
  const plugin={id:'reader',enabled:true,usesServices:[service],services:[service]};
  const backend=join(dir,'backend.mjs');
  const broker=createServices({plugins:{list:()=>[plugin]},fork:()=>utilityProcess.fork(
    resolve('apps/desktop/service-worker.cjs'),[backend,dir])});
  try{
    await writeFile(backend,`export async function call(service,method,input,context){
      if(!context.readSelectedFile)return 'no grant';
      const bytes=await context.readSelectedFile();
      return (bytes instanceof Uint8Array)+':'+Object.prototype.toString.call(bytes)+':'+Buffer.from(bytes).toString('hex');
    }`);
    const file=join(dir,'input');
    await writeFile(file,Buffer.from([0,128,255]));
    const token=await scope.grant(file);
    const delegate=scope.delegate(token);
    const request={service:'read',version:'1',method:'inspect',input:''};
    assert.equal(await broker.call('reader',request,undefined,undefined,delegate),'true:[object Uint8Array]:0080ff');
    assert.equal(await broker.call('reader',{...request,hasSelectedFile:true}),'no grant');
    scope.revoke(token);
    await assert.rejects(broker.call('reader',request,undefined,undefined,delegate),/服务调用失败/);
    delegate.close();
  }finally{
    broker.close();
    scope.close();
    await rm(dir,{recursive:true,force:true});
  }
}
app.whenReady().then(verify).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
