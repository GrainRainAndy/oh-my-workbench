import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {loadavg} from 'node:os';
const bundle=resolve(process.argv[2]);
const output=mkdtempSync(join(resolve(process.argv[3]),'packaged-'));
const csv=['metric,sample,milliseconds'];
const processes=['launch,pid,ppid,executable,rss_KiB,cpu_percent'];
const metadata={
  bundle,started:new Date().toISOString(),loadAverage:loadavg(),
  macOS:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),
  machine:execFileSync('sysctl',['-n','machdep.cpu.brand_string'],{encoding:'utf8'}).trim(),
  memoryBytes:execFileSync('sysctl',['-n','hw.memsize'],{encoding:'utf8'}).trim(),
  signature:execFileSync('codesign',['-d','-r-',bundle],{encoding:'utf8'}).trim(),
  architecture:process.arch
};
writeFileSync(join(output,'environment.json'),JSON.stringify(metadata,null,2));
for(let n=1;n<=30;n++){
  const args=['tests/e2e/packaged.mjs',bundle,'--sample'];
  if(n===30)args.push('--switches');
  const result=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8',timeout:30000}));
  csv.push(['fresh_profile_startup',n,result.startup.toFixed(2)].join(','));
  result.switches.forEach((ms,i)=>csv.push(['workspace_switch',i+1,ms.toFixed(2)].join(',')));
  for(const p of result.tree)processes.push([n,p.id,p.parent,p.executable,p.rssKiB,p.cpu].join(','));
  writeFileSync(join(output,'latency.csv'),csv.join('\n')+'\n');
  writeFileSync(join(output,'processes.csv'),processes.join('\n')+'\n');
}
console.log(output);
