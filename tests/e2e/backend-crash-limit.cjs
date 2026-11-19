const assert=require('node:assert/strict');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const {setTimeout:delay}=require('node:timers/promises');
const {app,utilityProcess}=require('electron');
const {createServices}=require('../../packages/host-core/src/runtime/services.cjs');
const {openJobs}=require('../../packages/host-core/src/jobs/registry.cjs');
const {NotDispatched}=require('../../packages/host-core/src/runtime/dispatch-error.cjs');

async function verify(){
  const dir=await mkdtemp(join(tmpdir(),'workbench-backend-crash-'));
  const service={id:'sample',version:'1',methods:{read:{input:'string',output:'string'}}};
  const plugin={id:'fixture',enabled:true,usesServices:[service],services:[service]};
  const backend=join(dir,'backend.mjs');
  let launches=0;
  const broker=createServices({plugins:{list:()=>[plugin]},fork(){
    launches++;
    return utilityProcess.fork(resolve('apps/desktop/service-worker.cjs'),[backend,dir]);
  }});
  const read=()=>broker.call(plugin.id,{service:'sample',version:'1',method:'read',input:''});
  const openRegistry=()=>openJobs(join(dir,'jobs.sqlite'),{execute:read});
  let jobs=openRegistry();
  const submit=key=>jobs.submit(plugin.id,{type:'read',title:'读取示例'},key,[]);
  async function terminal(id){
    for(let i=0;i<200;i++){
      const record=jobs.list().find(item=>item.id===id);
      if(record.status!=='running')return record;
      await delay(10);
    }
    throw Error('任务未进入终态');
  }
  try{
    await writeFile(backend,'export function call(){process.exit(1)}');
    const interrupted=submit('accepted-before-exit');
    assert.equal((await terminal(interrupted.id)).status,'unknown');
    for(let i=1;i<3;i++)await assert.rejects(read(),/服务已停止/);
    await writeFile(backend,"export function call(){return 'restored'}");
    await assert.rejects(read(),error=>error instanceof NotDispatched&&error.message.includes('稍后重试'));
    assert.equal(launches,3);
    const blocked=submit('during-cooldown');
    const failure=await terminal(blocked.id);
    assert.equal(failure.status,'failed');
    assert.match(failure.result,/稍后重试/);
    jobs.close();
    jobs=openRegistry();
    assert.equal(submit('accepted-before-exit').status,'unknown');
    assert.equal(submit('during-cooldown').status,'failed');
    assert.equal(broker.busy(),false);
    await delay(10100);
    assert.equal(launches,3);
    assert.equal(await read(),'restored');
    assert.equal(launches,4);
  }finally{jobs.close();broker.close();await rm(dir,{recursive:true,force:true});}
}
app.whenReady().then(verify).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
