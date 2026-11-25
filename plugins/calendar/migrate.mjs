import {reminderTables,seriesClaimSchema} from './src/reminders.mjs';
import {calendarTables} from './src/calendars.mjs';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';

export function migrate({dataDirectory}){
  const db=new DatabaseSync(join(dataDirectory,'calendar.sqlite'));
  try{
    db.exec('BEGIN IMMEDIATE');
    const version=db.prepare('PRAGMA user_version').get().user_version;
    if(version<1||version>5)throw Error('日程数据库版本不兼容');
    db.prepare('SELECT id, day, title FROM events LIMIT 0').all();
    if(version===1)db.exec('ALTER TABLE events ADD COLUMN recurrence TEXT');
    db.prepare('SELECT recurrence FROM events LIMIT 0').all();
    if(version<3)db.exec('ALTER TABLE events ADD COLUMN timing TEXT; ALTER TABLE events ADD COLUMN last_day TEXT');
    db.prepare('SELECT timing,last_day FROM events LIMIT 0').all();
    if(version<4)db.exec(calendarTables);
    if(version<5)db.exec(reminderTables);
    db.exec(seriesClaimSchema+'PRAGMA user_version=6; COMMIT');
  }finally{db.close();}
}
