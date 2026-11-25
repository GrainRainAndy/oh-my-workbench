import {nextSeriesReminder} from './recurrence.mjs';

export const seriesClaimSchema = `
  CREATE TABLE series_claims(
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    original_day TEXT NOT NULL,
    claimed_at INTEGER NOT NULL,
    PRIMARY KEY(event_id,original_day)
  );
`;

// A claimed reminder is never replayed automatically after a process exit.
export const reminderTables = `
  CREATE TABLE reminders(
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    minutes_before INTEGER NOT NULL CHECK(minutes_before>=0),
    claimed_at INTEGER
  );
`;

export function setReminder(db,eventId,minutesBefore,now=Date.now()){
  if(!Number.isSafeInteger(minutesBefore)||minutesBefore<0)throw Error('提醒提前量无效');
  const event=db.prepare('SELECT recurrence FROM events WHERE id=? AND timing IS NOT NULL').get(eventId);
  if(event?.recurrence){
    db.prepare('INSERT INTO reminders(event_id,minutes_before,claimed_at) VALUES(?,?,?) ON CONFLICT(event_id) DO UPDATE SET minutes_before=excluded.minutes_before,claimed_at=excluded.claimed_at')
      .run(eventId,minutesBefore,now-1);
    return;
  }
  const changed=db.prepare(`INSERT INTO reminders(event_id,minutes_before)
    SELECT id,? FROM events WHERE id=? AND timing IS NOT NULL AND recurrence IS NULL
    ON CONFLICT(event_id) DO UPDATE SET
      claimed_at=CASE WHEN reminders.minutes_before<>excluded.minutes_before
        AND (SELECT unixepoch(json_extract(timing,'$.startInstant'))*1000 FROM events WHERE id=excluded.event_id)
          -excluded.minutes_before*60000>?
        THEN NULL ELSE reminders.claimed_at END,
      minutes_before=excluded.minutes_before`).run(minutesBefore,eventId,now);
  if(!changed.changes)throw Error('定时日程不存在');
}

const dueTime="unixepoch(json_extract(e.timing,'$.startInstant'))*1000-r.minutes_before*60000";

function seriesRows(db){
  return db.prepare('SELECT e.id,e.title,e.timing,e.recurrence,r.minutes_before,r.claimed_at FROM events e JOIN reminders r ON r.event_id=e.id WHERE e.recurrence IS NOT NULL').all();
}

function nextFor(row,cursor){
  return nextSeriesReminder(JSON.parse(row.timing),JSON.parse(row.recurrence),row.minutes_before,cursor);
}

export function createReminderScheduler(db,deliver,onError){
  const next=db.prepare(`SELECT min(${dueTime}) AS deadline FROM reminders r JOIN events e ON e.id=r.event_id WHERE r.claimed_at IS NULL`);
  let timer=null,closed=false;
  function refresh(){
    if(timer!==null)clearTimeout(timer);
    timer=null;
    if(closed)return;
    let {deadline}=next.get();
    for(const row of seriesRows(db)){
      const group=nextFor(row,row.claimed_at);
      if(group&&(deadline===null||group.deadline<deadline))deadline=group.deadline;
    }
    if(deadline===null)return;
    // Node timeouts longer than 2^31-1 ms otherwise fire almost immediately.
    timer=setTimeout(async()=>{
      timer=null;
      try{
        const rows=claimDueReminders(db,Date.now());
        refresh();
        if(rows.length)await deliver(rows);
      }catch(error){onError(error);}
    },Math.min(2147483647,Math.max(0,deadline-Date.now())));
  }
  return {refresh,close(){
    closed=true;
    if(timer!==null)clearTimeout(timer);
    timer=null;
  }};
}

export function claimDueReminders(db,now){
  if(!Number.isSafeInteger(now))throw Error('提醒检查时间无效');
  db.exec('BEGIN IMMEDIATE');
  try{
    const rows=db.prepare(`SELECT e.id,e.title FROM reminders r JOIN events e ON e.id=r.event_id
      WHERE r.claimed_at IS NULL AND ${dueTime}<=?
      ORDER BY e.id`).all(now);
    const claim=db.prepare('UPDATE reminders SET claimed_at=? WHERE event_id=? AND claimed_at IS NULL');
    for(const row of rows)claim.run(now,row.id);
    for(const row of seriesRows(db)){
      let cursor=row.claimed_at,group;
      while((group=nextFor(row,cursor))&&group.deadline<=now){
        for(const original of group.originals){
          const result=db.prepare('INSERT INTO series_claims VALUES(?,?,?) ON CONFLICT DO NOTHING').run(row.id,original,now);
          if(result.changes)rows.push({id:row.id,title:row.title,original});
        }
        cursor=group.deadline;
      }
      if(cursor!==row.claimed_at)db.prepare('UPDATE reminders SET claimed_at=? WHERE event_id=?').run(cursor,row.id);
    }
    db.exec('COMMIT');
    return rows;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
