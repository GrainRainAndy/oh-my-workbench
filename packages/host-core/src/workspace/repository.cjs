const {statfsSync}=require('node:fs');
const {DatabaseSync} = require('node:sqlite');
const {newWorkspace}=require('./create.mjs');
function openRepository(source, validate) {
  const db = source instanceof DatabaseSync ? source : new DatabaseSync(source);
  db.exec('CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)');
  const read = row => validate(JSON.parse(row.payload));
  return {
    list: () => db.prepare('SELECT payload FROM workspaces ORDER BY rowid').all().map(read),
    save(input) {
      const snapshot = validate(input);
      const saved = {...snapshot, revision:snapshot.revision+1};
      const json = JSON.stringify(saved);
      try{
        const result = snapshot.revision === 0
          ? db.prepare('INSERT OR IGNORE INTO workspaces VALUES(?,?,?)').run(saved.id,saved.revision,json)
          : db.prepare('UPDATE workspaces SET payload=?,revision=? WHERE id=? AND revision=?').run(json,saved.revision,saved.id,snapshot.revision);
        if(result.changes!==1)throw Error('工作区已更新，请重新载入');
      }catch(error){
        let volumeFull=false;
        if(error.errcode===14&&typeof source==='string'){
          try{volumeFull=statfsSync(source).bavail===0;}catch{}
        }
        if(error.errcode===13||volumeFull)throw Error('存储空间不足，工作区未保存。请释放空间后重试。',{cause:error});
        throw error;
      }
      return saved;
    },
    remove({id,revision}) {
      if(typeof id!=='string'||!Number.isSafeInteger(revision)||revision<1) throw Error('工作区标识无效');
      db.exec('BEGIN IMMEDIATE');
      try{
        const result=db.prepare('DELETE FROM workspaces WHERE id=? AND revision=?').run(id,revision);
        if(result.changes!==1)throw Error('工作区已更新，请重新载入');
        if(!db.prepare('SELECT 1 FROM workspaces LIMIT 1').get()){
          this.save(newWorkspace('我的工作台'));
        }
        const remaining=this.list();
        db.exec('COMMIT');
        return remaining;
      }catch(error){
        if(db.isTransaction)db.exec('ROLLBACK');
        throw error;
      }
    },
    close:()=>db.close()
  };
}
module.exports = {openRepository};
