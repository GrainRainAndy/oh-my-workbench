import {execFileSync} from 'node:child_process';
import {appendFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {loadavg} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {processTree} from './sample.mjs';

export async function measureIdle(pid,bundle,parent){
  const output=mkdtempSync(join(resolve(parent),'idle-'));
  const csv=join(output,'processes.csv');
  const info=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8'}).trim();
  const metadata={bundle:resolve(bundle),started:new Date().toISOString(),architecture:process.arch,
    machine:info('sysctl',['-n','machdep.cpu.brand_string']),macOS:info('sw_vers',['-productVersion']),
    loadAverage:loadavg(),workload:'新配置，欢迎页，窗口打开，无任务',intervalSeconds:30,durationSeconds:1800};
  writeFileSync(join(output,'environment.json'),JSON.stringify(metadata,null,2));
  writeFileSync(csv,'elapsed_seconds,pid,ppid,executable,rss_KiB,cpu_percent\n');
  console.log(output);
  const start=performance.now();
  for(let n=0;n<=60;n++){
    await delay(Math.max(0,start+n*30000-performance.now()));
    const seconds=((performance.now()-start)/1000).toFixed(2);
    const tree=processTree(pid);
    appendFileSync(csv,tree.map(p=>[seconds,p.id,p.parent,p.executable,p.rssKiB,p.cpu].join(',')).join('\n')+'\n');
  }
  console.log('30-minute idle sampling completed.');
}
