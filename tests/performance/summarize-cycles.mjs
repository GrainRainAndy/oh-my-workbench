import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const folder=process.argv[2];
const metadata=JSON.parse(readFileSync(join(folder,'environment.json'),'utf8'));
const [header,...rows]=readFileSync(join(folder,'processes.csv'),'utf8').trimEnd().split('\n');
assert.equal(header,'elapsed_seconds,window_count,pid,ppid,executable,rss_KiB,cpu_percent');
const samples=new Map();
for(const row of rows){
  const [time,windows,pid,,,rss,cpu]=row.split(',');
  const seconds=Number(time),windowCount=Number(windows);
  assert.ok([seconds,Number(rss),Number(cpu)].every(n=>Number.isFinite(n)&&n>=0));
  assert.ok(windowCount===0||windowCount===1);
  const sample=samples.get(seconds)??{seconds,windowCount,rssMiB:0,cpuPercent:0,pids:new Set()};
  assert.equal(sample.windowCount,windowCount);
  assert.ok(!sample.pids.has(pid));
  sample.pids.add(pid);
  sample.rssMiB+=Number(rss)/1024;
  sample.cpuPercent+=Number(cpu);
  samples.set(seconds,sample);
}
const points=[...samples.values()];
const expected=1+metadata.durationSeconds/metadata.intervalSeconds;
assert.ok(points.length>0&&points.length<=expected);
for(const [i,p] of points.entries()){
  assert.ok(p.pids.has(String(metadata.pid)));
  assert.equal(p.windowCount,i%2);
  if(i>0)assert.ok(p.seconds>points[i-1].seconds);
}
function series(windowCount){
  return points.filter(p=>p.windowCount===windowCount).map(({seconds,rssMiB,cpuPercent,pids})=>
    ({seconds,rssMiB:Number(rssMiB.toFixed(2)),cpuPercent:Number(cpuPercent.toFixed(2)),processes:pids.size}));
}
const withinSchedule=points.every((p,i)=>Math.abs(p.seconds-i*metadata.intervalSeconds)<metadata.intervalSeconds/2);
const complete=points.length===expected&&withinSchedule;
const report={samples:points.length,expected,complete,closed:series(0),open:series(1)};
if(complete){
  // The initial close still includes the terminating renderer. Report later closes separately.
  function describe(sequence){
    const values=sequence.map(sample=>sample.rssMiB);
    const sorted=values.toSorted((a,b)=>a-b);
    const middle=Math.floor(sorted.length/2);
    const median=sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
    return {samples:values.length,firstMiB:values[0],lastMiB:values.at(-1),minMiB:sorted[0],
      maxMiB:sorted.at(-1),medianMiB:Number(median.toFixed(2)),
      processes:[...new Set(sequence.map(sample=>sample.processes))]};
  }
  report.rssSummary={closedAfterInitial:describe(report.closed.slice(1)),open:describe(report.open)};
}
console.log(JSON.stringify(report,null,2));
