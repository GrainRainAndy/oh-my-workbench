import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const folder=process.argv[2];
const metadata=JSON.parse(readFileSync(join(folder,'environment.json'),'utf8'));
const lines=readFileSync(join(folder,'processes.csv'),'utf8').trimEnd().split('\n');
const header=lines.shift();
assert.equal(header,'elapsed_seconds,pid,ppid,executable,rss_KiB,cpu_percent');
const samples=new Map();
for(const line of lines){
  const [elapsed,pid,,,_rss,_cpu]=line.split(',');
  const seconds=Number(elapsed),rss=Number(_rss),cpu=Number(_cpu);
  assert.ok([seconds,rss,cpu].every(n=>Number.isFinite(n)&&n>=0));
  const sample=samples.get(seconds)??{seconds,pids:new Set(),rss:0,cpu:0};
  assert.ok(!sample.pids.has(pid),'Duplicate process in one sample');
  sample.pids.add(pid);
  sample.rss+=rss/1024;
  sample.cpu+=cpu;
  samples.set(seconds,sample);
}
const points=[...samples.values()];
assert.ok(points.length>0);
const latest=points.at(-1);
const expected=1+metadata.durationSeconds/metadata.intervalSeconds;
const complete=points.length===expected&&points.every((p,i)=>Math.abs(p.seconds-i*metadata.intervalSeconds)<metadata.intervalSeconds/2);
const report={samples:points.length,expected,complete,elapsedSeconds:latest.seconds,latestProcessCount:latest.pids.size};
if(complete){
  // Exclude the launch sample from idle statistics.
  const idle=points.slice(1);
  const stats=values=>{
    const sorted=values.toSorted((a,b)=>a-b);
    const rank=q=>sorted[Math.ceil(sorted.length*q)-1];
    return {first:values[0],last:values.at(-1),p50:rank(.5),p95:rank(.95),max:sorted.at(-1)};
  };
  report.summedRssMiB=stats(idle.map(p=>p.rss));
  report.summedCpuPercent=stats(idle.map(p=>p.cpu));
}
console.log(JSON.stringify(report,null,2));
