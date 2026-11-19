import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {processTree} from './sample.mjs';

export async function measureMixed({evaluate,pid,binary}){
  const before=processTree(pid);
  const results=await evaluate(`(async()=>{
    const call=(service,version,method,input)=>window.viewServices.call({workspaceId:'dense',viewId:'v0',service,version,method,input});
    return Promise.all([call('fixture.performance','1','ping',[]),call('workbench.tally','1.0.0','read','total'),
      call('workbench.palette.css','1.0.0','format',['#123456'])]);
  })()`);
  assert.equal(results[1],'0');
  assert.match(results[2],/--color-1: #123456/);
  const tree=processTree(pid);
  const workers=tree.filter(row=>row.parent===pid&&!before.some(p=>p.id===row.id));
  assert.equal(workers.length,3);
  assert.ok(workers.some(row=>row.id===Number(results[0])));
  assert.equal(await evaluate("document.querySelectorAll('.swatches').length"),8);
  console.log(JSON.stringify({binary,architecture:process.arch,measured:new Date().toISOString(),
    os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),
    machine:execFileSync('sysctl',['-n','machdep.cpu.brand_string'],{encoding:'utf8'}).trim(),
    workload:'8 视图，3 个按需后台各完成一次实际服务调用，系统无任务',workerPids:workers.map(p=>p.id),
    rssMiB:tree.reduce((sum,p)=>sum+p.rssKiB,0)/1024,tree}));
}
