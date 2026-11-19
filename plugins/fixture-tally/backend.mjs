import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';

let store;
export function call(service,method,input,{dataDirectory}){
  if(service!=='workbench.tally'||!['read','increment'].includes(method)||input!=='total')
    throw Error('计数器请求无效');
  if(!store){
    const candidate=new DatabaseSync(join(dataDirectory,'counter.sqlite'));
    try{
      const {user_version:version}=candidate.prepare('PRAGMA user_version').get();
      if(version!==0&&version!==1)throw Object.assign(Error('计数器数据版本不兼容'),{code:'DATA_VERSION_UNSUPPORTED'});
      const tables=candidate.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all();
      if(version===0&&tables.length===0){
        candidate.exec('BEGIN IMMEDIATE; CREATE TABLE tally(id INTEGER PRIMARY KEY CHECK(id=1), count INTEGER NOT NULL); INSERT INTO tally VALUES(1,0); PRAGMA user_version=1; COMMIT');
      }else{
        const row=candidate.prepare('SELECT count FROM tally WHERE id=1').get();
        if(!Number.isSafeInteger(row?.count)||row.count<0)throw Error('计数器数据损坏');
      }
      store=candidate;
    }catch(error){
      candidate.close();
      throw error;
    }
  }
  if(method==='increment'){
    const updated=store.prepare('UPDATE tally SET count=count+1 WHERE id=1 AND count<?').run(Number.MAX_SAFE_INTEGER);
    if(updated.changes!==1)throw Error('计数器已达上限');
  }
  return String(store.prepare('SELECT count FROM tally WHERE id=1').get().count);
}

export function dispose(){store?.close();store=undefined;}
