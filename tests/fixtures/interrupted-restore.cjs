// Stop at the filesystem commit point while exercising the production restore path.
const fs=require('node:fs');
const {join}=require('node:path');
const [profile,id,phase]=process.argv.slice(2);
const rename=fs.renameSync;
fs.renameSync=(source,target)=>{
  if(target!==join(profile,'active-store.json'))return rename(source,target);
  if(phase==='before')process.kill(process.pid,'SIGKILL');
  rename(source,target);
  if(phase==='after')process.kill(process.pid,'SIGKILL');
};
const snapshots=require('../../packages/host-core/src/persistence/backup.cjs');
snapshots.prepareRestore(profile,id).commit();
