const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {mkdtempSync,copyFileSync,writeFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const {app,utilityProcess}=require('electron');
const {createServices}=require('../../../packages/host-core/src/runtime/services.cjs');
const {createReadScope}=require('../../../packages/host-core/src/platform/selected-file.cjs');

async function verify(){
  const directory=mkdtempSync(join(tmpdir(),'workbench-ocr-'));
  const executable=join(directory,'vision');
  const entry=join(directory,'backend.mjs');
  const scope=createReadScope(1024*1024);
  const service={id:'fixture.ocr',version:'1',methods:{recognize:{input:'string',output:'string'}}};
  const plugin={id:'fixture.vision',enabled:true,usesServices:[service],services:[service]};
  const broker=createServices({plugins:{list:()=>[plugin]},fork:()=>utilityProcess.fork(resolve('apps/desktop/service-worker.cjs'),[entry,directory])});
  try{
    execFileSync('swiftc',[join(__dirname,'vision.swift'),'-o',executable]);
    copyFileSync(join(__dirname,'backend.mjs'),entry);
    const image=join(directory,'sample.png');
    writeFileSync(image,execFileSync(executable,['--sample']));
    const token=await scope.grant(image);
    const request={service:service.id,version:'1',method:'recognize',input:'png'};
    const lines=JSON.parse(await broker.call(plugin.id,request,undefined,undefined,scope.delegate(token),30000));
    const line=lines.find(row=>row.text==='WORKBENCH 2048');
    assert.ok(line);
    assert.equal(line.box.length,4);
    assert.ok(line.box.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
    assert.ok(line.box[2]>0&&line.box[3]>0);
    console.log(JSON.stringify(line));
  }finally{broker.close();scope.close();rmSync(directory,{recursive:true,force:true});}
}
app.whenReady().then(verify).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
