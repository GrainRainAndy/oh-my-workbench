import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';

export const detailColumns = `
  ALTER TABLE items ADD COLUMN notes TEXT NOT NULL DEFAULT '';
  ALTER TABLE items ADD COLUMN due TEXT NOT NULL DEFAULT '';
  ALTER TABLE items ADD COLUMN priority TEXT NOT NULL DEFAULT 'none';
  ALTER TABLE items ADD COLUMN detailRevision INTEGER NOT NULL DEFAULT 0;
`;

export const listSchema = `
  CREATE TABLE lists(id TEXT PRIMARY KEY,name TEXT NOT NULL);
  INSERT INTO lists VALUES('inbox','收件箱');
  ALTER TABLE items ADD COLUMN listId TEXT NOT NULL DEFAULT 'inbox';
  CREATE INDEX items_list ON items(listId);
`;

export const listOrderSchema = `
  ALTER TABLE lists ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
  UPDATE lists SET position=rowid;
`;

export const archiveSchema = 'ALTER TABLE lists ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1));';

export function migrate({dataDirectory}){
  const db=new DatabaseSync(join(dataDirectory,'todo.sqlite'));
  try{
    db.exec('BEGIN IMMEDIATE');
    const version=db.prepare('PRAGMA user_version').get().user_version;
    if(![1,2,3,4].includes(version))throw Error('待办数据库版本不兼容');
    db.prepare('SELECT id,title,completed FROM items LIMIT 0').all();
    if(version===1)db.exec(detailColumns);
    db.prepare('SELECT notes,due,priority,detailRevision FROM items LIMIT 0').all();
    if(version<3)db.exec(listSchema);
    if(version<4)db.exec(listOrderSchema);
    db.exec(archiveSchema+'PRAGMA user_version=5; COMMIT');
  }finally{db.close();}
}
