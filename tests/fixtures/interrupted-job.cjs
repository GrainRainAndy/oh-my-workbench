const {appendFileSync}=require('node:fs');
const {openJobs}=require('../../packages/host-core/src/jobs/registry.cjs');
const [database,acceptedLog]=process.argv.slice(2);
const jobs=openJobs(database,{execute:()=>{
  appendFileSync(acceptedLog,'accepted\n');
  process.send('accepted');
  return new Promise(()=>{});
}});
jobs.submit('fixture',{type:'export',title:'导出'},'once',['one']);
process.on('message',()=>{});
