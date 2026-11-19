import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';

// The host supplies the plugin directory in a prepared upgrade copy.
export function migrate({dataDirectory}){
  const db=new DatabaseSync(join(dataDirectory,'counter.sqlite'),{enableForeignKeyConstraints:true});
  try{
    db.exec('BEGIN IMMEDIATE');
    const version=db.prepare('PRAGMA user_version').get().user_version;
    if(version!==0&&version!==1)throw Error('计数器数据版本不兼容');
    const columns=db.prepare('PRAGMA table_info(tally)').all().map(column=>column.name);
    const legacyValue=columns.join(',')==='value'&&version===0;
    if(!legacyValue&&columns.join(',')!=='id,count')throw Error('计数器表结构不兼容');
    const rows=db.prepare(legacyValue?'SELECT 1 AS id,value AS count FROM tally LIMIT 2':'SELECT id,count FROM tally LIMIT 2').all();
    if(rows.length!==1||rows[0].id!==1||!Number.isSafeInteger(rows[0].count)||rows[0].count<0)throw Error('计数器数据损坏');
    if(legacyValue){
      db.exec('ALTER TABLE tally RENAME TO legacy_tally');
      db.exec('CREATE TABLE tally(id INTEGER PRIMARY KEY CHECK(id=1),count INTEGER NOT NULL)');
      db.prepare('INSERT INTO tally VALUES(1,?)').run(rows[0].count);
      db.exec('DROP TABLE legacy_tally');
    }
    db.exec('PRAGMA user_version=1; COMMIT');
  }finally{db.close();}
}
