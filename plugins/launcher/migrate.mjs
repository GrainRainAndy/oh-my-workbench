import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';

export function openLibrary(dataDirectory){
  const db=new DatabaseSync(join(dataDirectory,'launcher.sqlite'));
  try{
    const version=db.prepare('PRAGMA user_version').get().user_version;
    if(version===0&&!db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").get()){
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE entries(key TEXT PRIMARY KEY, category TEXT NOT NULL, value TEXT NOT NULL, removed INTEGER NOT NULL);
        PRAGMA user_version=1;
        COMMIT`);
    }else if(version!==1)throw Error('快捷入口库版本不兼容');
    return db;
  }catch(error){db.close();throw error;}
}

export function migrate({dataDirectory}){
  openLibrary(dataDirectory).close();
}
