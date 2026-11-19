import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {processTree} from './sample.mjs';

export async function measureWindowless({send,evaluate,target,profile,pid,binary}){
  const job=await evaluate(`(async()=>{
    await window.workspaces.save({id:'bench',revision:0,schemaVersion:1,name:'无窗口任务',activePaneId:'p',
      layout:{type:'leaf',paneId:'p',viewInstanceId:'v'},views:{v:{id:'v',pluginId:'fixture.palette',viewType:'palette',configVersion:1,stateVersion:1,config:{},state:{}}}});
    return window.jobs.submit({workspaceId:'bench',viewId:'v',type:'timed-probe',key:'one',input:[]});
  })()`);
  assert.equal(job.status,'running');
  await send('Target.closeTarget',{targetId:target.targetId});
  const db=new DatabaseSync(join(profile,'jobs.sqlite'),{readOnly:true});
  const record=db.prepare('SELECT status,result FROM jobs WHERE id=?');
  async function sample(status){
    const {targetInfos}=await send('Target.getTargets');
    assert.equal(targetInfos.filter(t=>t.type==='page').length,0);
    const tree=processTree(pid);
    assert.equal(record.get(job.id).status,status);
    return {status,windows:0,rssMiB:tree.reduce((sum,p)=>sum+p.rssKiB,0)/1024,tree};
  }
  try{
    await delay(1000);
    const running=await sample('running');
    for(let i=0;i<100&&record.get(job.id).status==='running';i++)await delay(75);
    const completed=await sample('succeeded');
    const workerPid=Number(record.get(job.id).result);
    assert.ok(running.tree.some(row=>row.id===workerPid));
    console.log(JSON.stringify({binary,architecture:process.arch,measured:new Date().toISOString(),
      os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),
      machine:execFileSync('sysctl',['-n','machdep.cpu.brand_string'],{encoding:'utf8'}).trim(),
      workload:'计时等待任务，关窗后 1 秒与完成时分别采样',workerPid,running,completed}));
  }finally{db.close();}
}
