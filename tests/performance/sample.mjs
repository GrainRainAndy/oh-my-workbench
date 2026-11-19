import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

export async function sample({startup,evaluate,send,sessionId,pid}){
  const switches=[];
  if(process.argv.includes('--switches')){
    await evaluate(`(async()=>{
      for(let i=0;i<8;i++){
        const paneId='p'+i,id='v'+i;
        await window.workspaces.save({id:'w'+i,name:'工作区 '+i,revision:0,schemaVersion:1,activePaneId:paneId,
          layout:{type:'leaf',paneId,viewInstanceId:id},views:{[id]:{id,pluginId:'fixture.palette',viewType:'palette',configVersion:1,stateVersion:1,config:{},state:{}}}});
      }
    })()`);
    await send('Page.reload',{},sessionId);
    let ready=false;
    for(let i=0;i<100&&!ready;i++){
      ready=await evaluate("document.querySelectorAll('nav button').length===8 && !!document.querySelector('.swatches')");
      if(!ready)await delay(50);
    }
    assert.ok(ready);
    switches.push(...await evaluate(`(async()=>{
      const samples=[];
      for(let n=1;n<=100;n++){
        const index=n%8;
        const start=performance.now();
        document.querySelectorAll('nav button')[index].click();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        if(document.querySelector('h1')?.textContent!=='工作区 '+index||!document.querySelector('.swatches'))
          throw Error('Workspace switch did not render');
        samples.push(performance.now()-start);
      }
      return samples;
    })()`));
  }
  const tree=processTree(pid);
  console.log(JSON.stringify({startup,switches,tree}));
}

export function processTree(pid){
  const rows=execFileSync('ps',['-axo','pid=,ppid=,rss=,pcpu=,comm='],{encoding:'utf8'}).trim().split('\n').map(line=>{
    const [,id,parent,rss,cpu,command]=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/)??[];
    return {id:Number(id),parent:Number(parent),rssKiB:Number(rss),cpu:Number(cpu),executable:command?.split('/').at(-1)};
  });
  const tree=[];
  function visit(id){const row=rows.find(r=>r.id===id);if(row){tree.push(row);for(const c of rows.filter(r=>r.parent===id))visit(c.id);}}
  visit(pid);
  assert.ok(tree.length>1);
  return tree;
}
