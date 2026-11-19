const {DatabaseSync}=require('node:sqlite');
const {join}=require('node:path');
const {prepareRestore}=require('../../packages/host-core/src/persistence/backup.cjs');
const [profile,backup,phase]=process.argv.slice(2);
async function upgrade(){
  const {openPlugins}=require('../../packages/host-core/src/runtime/plugins.cjs');
  const {pathToFileURL}=require('node:url');
  const registry=openPlugins(join(__dirname,'../../plugins'),':memory:');
  let entry,plugin;
  try{plugin=registry.list().find(p=>p.id==='fixture.tally');entry=registry.migration(plugin.id);}finally{registry.close();}
  const {migrate}=await import(pathToFileURL(entry).href);
  const candidate=prepareRestore(profile,backup,{owner:plugin.id,name:plugin.backupDatabase,version:plugin.databaseVersion});
  try{
    const exec=DatabaseSync.prototype.exec;
    DatabaseSync.prototype.exec=function(sql){
      const result=exec.call(this,sql);
      if(phase==='during'&&sql.startsWith('ALTER TABLE'))process.kill(process.pid,'SIGKILL');
      return result;
    };
    if(phase!=='no-change')migrate({dataDirectory:join(candidate.directory,'plugin-data','fixture.tally')});
    if(phase==='after-sql')process.kill(process.pid,'SIGKILL');
    candidate.commit();
  }finally{candidate.discard();}
}
upgrade().catch(error=>{console.error(error);process.exitCode=1;});
