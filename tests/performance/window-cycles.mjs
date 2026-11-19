import assert from 'node:assert/strict';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,writeFileSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {processTree} from './sample.mjs';

const launchSecondInstance=promisify(execFile);

export async function measureCycles({send,binary,profile,pid,target,evaluate,outputRoot}){
  const folder=mkdtempSync(join(resolve(outputRoot),'window-cycles-'));
  const interval=5*60*1000;
  const metadata={binary,pid,architecture:process.arch,started:new Date().toISOString(),
    macOS:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),
    machine:execFileSync('sysctl',['-n','machdep.cpu.brand_string'],{encoding:'utf8'}).trim(),
    intervalSeconds:interval/1000,durationSeconds:7200,workload:'单配色视图，无任务；每五分钟交替开关窗口'};
  writeFileSync(join(folder,'environment.json'),JSON.stringify(metadata,null,2));
  const file=join(folder,'processes.csv');
  writeFileSync(file,'elapsed_seconds,window_count,pid,ppid,executable,rss_KiB,cpu_percent\n');
  console.log(folder);
  await evaluate(`window.workspaces.save({id:'cycle',revision:0,schemaVersion:1,name:'开关窗验证',activePaneId:'p',
    layout:{type:'leaf',paneId:'p',viewInstanceId:'v'},views:{v:{id:'v',pluginId:'fixture.palette',viewType:'palette',
    configVersion:1,stateVersion:1,config:{name:'暮色海岸'},state:{selectedIndex:2}}}})`);
  const start=performance.now();
  async function pages(){
    return (await send('Target.getTargets')).targetInfos.filter(t=>t.type==='page'&&t.url.endsWith('/apps/desktop/dist/index.html'));
  }
  for(let step=0;step<=24;step++){
    await delay(Math.max(0,start+step*interval-performance.now()));
    const open=step%2===1;
    if(open)await launchSecondInstance(binary,['--user-data-dir='+profile],{timeout:30000});
    else await send('Target.closeTarget',{targetId:target.targetId});
    let windows;
    for(let i=0;i<100;i++){
      windows=await pages();
      if(windows.length===Number(open))break;
      await delay(50);
    }
    assert.equal(windows.length,Number(open));
    if(open){
      target=windows[0];
      const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
      let restored=false;
      for(let i=0;i<100&&!restored;i++){
        restored=(await send('Runtime.evaluate',{expression:"document.querySelector('.selected-color code')?.textContent==='#92afa9'",returnByValue:true},sessionId)).result.value;
        if(!restored)await delay(50);
      }
      assert.ok(restored,'Workspace did not restore after reopening');
      await send('Target.detachFromTarget',{sessionId});
    }
    const elapsed=((performance.now()-start)/1000).toFixed(2);
    appendFileSync(file,processTree(pid).map(p=>[elapsed,windows.length,p.id,p.parent,p.executable,p.rssKiB,p.cpu].join(',')).join('\n')+'\n');
  }
  console.log('Two-hour window cycle measurement completed.');
}
