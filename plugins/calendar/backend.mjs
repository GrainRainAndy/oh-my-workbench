import {seriesClaimSchema,reminderTables,setReminder,createReminderScheduler} from './src/reminders.mjs';
import {calendarTables} from './src/calendars.mjs';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {occurrenceDates,occursOn,timedSpan,timedOccurrences} from './src/recurrence.mjs';

function validateDay(day){
  if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||Temporal.PlainDate.from(day).toString()!==day)throw Error('日期无效');
}

function compareScheduleRows(a,b){
  if(!a.timing||!b.timing)return Number(!!a.timing)-Number(!!b.timing);
  return Temporal.Instant.compare(a.timing.startInstant,b.timing.startInstant);
}

function readRule(encoded,day){
    const value=JSON.parse(encoded);
    if(!value||typeof value!=='object'||Object.keys(value).some(key=>!['frequency','interval','count','until'].includes(key)))throw Error('重复规则无效');
    const {frequency,interval=1,count,until}=value;
    const rule={frequency,interval,count,until};
    if(!occurrenceDates(day,rule,day).length)throw Error('重复截止早于开始日期');
    return rule;
}

let db;
function listRange(start,end,includeDay,calendarId=null){
  validateDay(start);
  validateDay(end);
  const first=Temporal.PlainDate.from(start);
  const days=first.until(Temporal.PlainDate.from(end)).days+1;
  if(days<1||days>42)throw Error('查询区间须为 1 至 42 天');
  const dates=Array.from({length:days},(_,index)=>first.add({days:index}).toString());
  const byDate=new Map(dates.map(date=>[date,[]]));
  const events=db.prepare(`SELECT e.id,title,day,recurrence,timing,r.minutes_before FROM events e LEFT JOIN reminders r ON r.event_id=e.id LEFT JOIN event_calendars c ON c.event_id=e.id
    WHERE (? IS NULL OR coalesce(c.calendar_id,'default')=?) AND
    (day BETWEEN ? AND ? OR recurrence IS NOT NULL OR (timing IS NOT NULL AND day<=? AND last_day>=?)) ORDER BY e.rowid`).all(calendarId,calendarId,start,end,end,start);
  for(const event of events){
    const base={id:event.id,title:event.title};
    if(event.timing){
      const timing=JSON.parse(event.timing);
      if(event.recurrence){
        const rule=JSON.parse(event.recurrence);
        const exceptions={...rule.moved};
        for(const original of rule.cancelled??[])exceptions[original]=null;
        for(const occurrence of timedOccurrences({...timing,rule,exceptions},end,start)){
          if(occurrence.lastDay<start)continue;
          const localTime=instant=>Temporal.Instant.from(instant).toZonedDateTimeISO(timing.timeZone).toPlainDateTime();
          const from=localTime(occurrence.startInstant),to=localTime(occurrence.endInstant);
          const instance={...timing,...occurrence,start:from.toPlainDate().toString(),end:to.toPlainDate().toString(),time:from.toPlainTime().toString({smallestUnit:'minute'}),endTime:to.toPlainTime().toString({smallestUnit:'minute'})};
          for(const date of dates){
            if(date>=occurrence.firstDay&&date<=occurrence.lastDay)byDate.get(date).push({...base,timing:instance,seriesTiming:timing,reminderMinutes:event.minutes_before,start:event.day,originalDay:occurrence.originalDate,rule});
          }
        }
        continue;
      }
      for(const date of dates){
        if(date>=timing.firstDay&&date<=timing.lastDay)byDate.get(date).push({...base,timing,reminderMinutes:event.minutes_before});
      }
      continue;
    }
    if(!event.recurrence){
      byDate.get(event.day).push(base);
      continue;
    }
    const rule=JSON.parse(event.recurrence);
    const originals=new Set([...dates,...Object.keys(rule.moved??{})]);
    for(const originalDay of [...originals].sort()){
      const date=rule.moved?.[originalDay]??originalDay;
      if(byDate.has(date)&&!rule.cancelled?.includes(originalDay)&&occursOn(event.day,rule,originalDay)){
        byDate.get(date).push({...base,start:event.day,rule,originalDay});
      }
    }
  }
  return dates.flatMap(day=>byDate.get(day).sort(compareScheduleRows).map(row=>JSON.stringify(includeDay?{day,...row}:row)));
}

let scheduler;
function openCalendar(dataDirectory){
  if(!db){
    const candidate=new DatabaseSync(join(dataDirectory,'calendar.sqlite'));
    try{
      const version=candidate.prepare('PRAGMA user_version').get().user_version;
      if(version===0 && !candidate.prepare("SELECT name FROM sqlite_schema WHERE type='table'").get()){
        candidate.exec(`BEGIN IMMEDIATE; CREATE TABLE events(id TEXT PRIMARY KEY, day TEXT NOT NULL, title TEXT NOT NULL, recurrence TEXT, timing TEXT, last_day TEXT); CREATE INDEX events_day ON events(day); ${calendarTables} ${reminderTables} ${seriesClaimSchema} PRAGMA user_version=6; COMMIT`);
      }else if(version>=1&&version<=5)throw Error('请在插件管理中升级日程数据库');
      else if(version!==6)throw Error('日历数据版本不兼容');
      db=candidate;
    }catch(error){candidate.close();throw error;}
  }
}

export function activate({dataDirectory,showNotification}){
  openCalendar(dataDirectory);
  scheduler=createReminderScheduler(db,rows=>{
    showNotification(rows.length===1?'一项日程提醒已到期。':rows.length+' 项日程提醒已到期。');
  },()=>console.error('日程提醒调度失败'));
  scheduler.refresh();
  return dispose;
}

export function call(service,method,input,{dataDirectory}){
  if(service!=='workbench.calendar.events')throw Error('未知日程服务');
  openCalendar(dataDirectory);
  if(method==='configureReminder'){
    if(!Array.isArray(input)||input.length!==3)throw Error('提醒设置无效');
    const [id,expected,next]=input;
    if(!['off','0','5','10','30','60'].includes(next))throw Error('提醒提前量无效');
    db.exec('BEGIN IMMEDIATE');
    try{
      const row=db.prepare(`SELECT r.minutes_before FROM events e LEFT JOIN reminders r ON e.id=r.event_id
        WHERE e.id=? AND e.timing IS NOT NULL`).get(id);
      if(!row||String(row.minutes_before??'off')!==expected)throw Error('提醒设置已更改');
      if(next==='off')db.prepare('DELETE FROM reminders WHERE event_id=?').run(id);
      else setReminder(db,id,Number(next));
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    scheduler?.refresh();
    return id;
  }
  if(method==='listCalendars')return db.prepare('SELECT id,name FROM calendars ORDER BY rowid').all().map(row=>JSON.stringify(row));
  if(method==='createCalendar'){
    if(!Array.isArray(input)||input.length!==2)throw Error('日历请求无效');
    const [id,name]=input;
    if(!/^[a-f0-9-]{36}$/.test(id)||typeof name!=='string'||!name.trim()||name.length>80)throw Error('日历内容无效');
    db.prepare('INSERT INTO calendars VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(id,name.trim());
    if(db.prepare('SELECT name FROM calendars WHERE id=?').get(id).name!==name.trim())throw Error('日历标识冲突');
    return id;
  }
  if(method==='createInCalendar'){
    if(!Array.isArray(input))throw Error('日历请求无效');
    const [target,operation,...args]=input;
    if(!['createAllDay','createSeries','createTimed','createTimedSeries'].includes(operation))throw Error('日程类型无效');
    db.exec('BEGIN IMMEDIATE');
    try{
      if(!db.prepare('SELECT id FROM calendars WHERE id=?').get(target))throw Error('日历不存在');
      const existing=db.prepare(`SELECT coalesce(c.calendar_id,'default') AS calendar FROM events e
        LEFT JOIN event_calendars c ON e.id=c.event_id WHERE e.id=?`).get(args[0]);
      if(existing&&existing.calendar!==target)throw Error('日程归属冲突');
      const id=call(service,operation,args,{dataDirectory});
      if(!existing&&target!=='default')db.prepare('INSERT INTO event_calendars VALUES(?,?)').run(id,target);
      db.exec('COMMIT');
      return id;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  if(method==='moveToCalendar'){
    if(!Array.isArray(input)||input.length!==3)throw Error('日历请求无效');
    const [id,expected,target]=input;
    const changed=db.prepare(`INSERT INTO event_calendars(event_id,calendar_id)
      SELECT e.id,? FROM events e LEFT JOIN event_calendars c ON c.event_id=e.id
      WHERE e.id=? AND coalesce(c.calendar_id,'default')=? AND EXISTS(SELECT 1 FROM calendars WHERE id=?)
      ON CONFLICT(event_id) DO UPDATE SET calendar_id=excluded.calendar_id`).run(target,id,expected,target);
    if(changed.changes!==1)throw Error('日程或所属日历已更改');
    return id;
  }
  if(method==='listDay')return listRange(input,input,false);
  if(method==='listRange'){
    if(!Array.isArray(input)||![2,3].includes(input.length))throw Error('日期区间无效');
    return listRange(input[0],input[1],true,input[2]);
  }
  const day=input?.[1];
  validateDay(day);
  const lengths={createAllDay:3,createTimed:7,createTimedSeries:8,updateTimedSeries:12,updateTimed:9,deleteTimed:4,createSeries:4,updateSeries:7,deleteSeries:4,cancelOccurrence:5,moveOccurrence:6,deleteAllDay:3,renameAllDay:4,updateAllDay:5};
  if(!Object.hasOwn(lengths,method)||!Array.isArray(input)||input.length!==lengths[method])throw Error('日程请求无效');
  const [id,,title]=input;
  if(!/^[a-f0-9-]{36}$/.test(id)||typeof title!=='string'||!title.trim()||title.length>160)throw Error('日程内容无效');
  if(method==='deleteTimed'){
    const deleted=db.prepare('DELETE FROM events WHERE id=? AND day=? AND title=? AND timing=? AND recurrence IS NULL').run(id,day,title,input[3]);
    if(deleted.changes!==1)throw Error('定时日程已更改');
    scheduler?.refresh();
    return id;
  }
  if(method==='createTimed'||method==='createTimedSeries'||method==='updateTimedSeries'||method==='updateTimed'){
    const [,,,time,end,endTime,timeZone]=input;
    const local={start:day,time,end,endTime,timeZone};
    const span=timedSpan(local);
    const timing=JSON.stringify({...local,...span});
    if(method==='updateTimed'){
      const [expectedTitle,expectedTiming]=input.slice(7);
      if(JSON.parse(expectedTiming).timeZone!==timeZone)throw Error('须保留创建时区');
      db.exec('BEGIN IMMEDIATE');
      try{
        const changed=db.prepare('UPDATE events SET day=?,title=?,timing=?,last_day=? WHERE id=? AND title=? AND timing=? AND recurrence IS NULL')
          .run(day,title.trim(),timing,span.lastDay,id,expectedTitle,expectedTiming);
        if(changed.changes!==1)throw Error('定时日程已更改');
        if(JSON.parse(expectedTiming).startInstant!==span.startInstant){
          db.prepare('UPDATE reminders SET claimed_at=NULL WHERE event_id=? AND ?-minutes_before*60000>?')
            .run(id,Date.parse(span.startInstant),Date.now());
        }
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      scheduler?.refresh();
      return id;
    }
    if(method==='updateTimedSeries'){
      const [expectedStart,expectedTitle,expectedRule,expectedTiming]=input.slice(8);
      if(JSON.parse(expectedTiming).timeZone!==timeZone)throw Error('须保留创建时区');
      const rule=readRule(input[7],day);
      timedOccurrences({...local,rule},day);
      const previous=JSON.parse(expectedRule);
      if(previous.moved)rule.moved=previous.moved;
      if(previous.cancelled)rule.cancelled=previous.cancelled;
      rule.revision=(previous.revision??0)+1;
      const changed=db.prepare('UPDATE events SET day=?,title=?,timing=?,last_day=?,recurrence=? WHERE id=? AND day=? AND title=? AND recurrence=? AND timing=?')
        .run(day,title.trim(),timing,span.lastDay,JSON.stringify(rule),id,expectedStart,expectedTitle,expectedRule,expectedTiming);
      if(changed.changes!==1)throw Error('定时系列已更改');
      scheduler?.refresh();
      return id;
    }
    const recurrence=method==='createTimedSeries'?JSON.stringify(readRule(input[7],day)):null;
    if(recurrence)timedOccurrences({...local,rule:JSON.parse(recurrence)},day);
    db.prepare('INSERT INTO events(id,day,title,timing,last_day,recurrence) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,day,title.trim(),timing,span.lastDay,recurrence);
    const saved=db.prepare('SELECT title,timing,recurrence FROM events WHERE id=?').get(id);
    if(saved.title!==title.trim()||saved.timing!==timing||saved.recurrence!==recurrence)throw Error('日程标识冲突');
    return id;
  }
  if(method==='cancelOccurrence'||method==='moveOccurrence'){
    const [,start,,expectedRule,originalDay]=input;
    validateDay(originalDay);
    const current=db.prepare('SELECT recurrence FROM events WHERE id=? AND day=? AND title=? AND recurrence=?').get(id,start,title,expectedRule);
    if(!current)throw Error('系列已更改');
    const rule=JSON.parse(current.recurrence);
    if(!occursOn(start,rule,originalDay)||rule.cancelled?.includes(originalDay))throw Error('该次日程不存在');
    if(method==='moveOccurrence'){
      const target=input[5];
      validateDay(target);
      rule.moved={...rule.moved,[originalDay]:target};
      if(target===originalDay)delete rule.moved[originalDay];
    }else{
      rule.cancelled=[...(rule.cancelled??[]),originalDay].sort();
    }
    const result=db.prepare('UPDATE events SET recurrence=? WHERE id=? AND recurrence=? AND day=? AND title=?').run(JSON.stringify(rule),id,expectedRule,start,title);
    if(result.changes!==1)throw Error('系列已更改');
    scheduler?.refresh();
    return id;
  }
  if(method==='deleteSeries'){
    const result=db.prepare('DELETE FROM events WHERE id=? AND day=? AND title=? AND recurrence=?').run(id,day,title,input[3]);
    if(result.changes!==1)throw Error('系列已更改');
    scheduler?.refresh();
    return id;
  }
  if(method==='deleteAllDay'){
    const result=db.prepare('DELETE FROM events WHERE id=? AND day=? AND title=? AND recurrence IS NULL AND timing IS NULL').run(id,day,title);
    if(result.changes!==1)throw Error('日程已更改');
    return id;
  }
  if(method==='renameAllDay'||method==='updateAllDay'){
    const nextDay=method==='updateAllDay'?input[4]:day;
    validateDay(nextDay);
    const changed=db.prepare('UPDATE events SET title=?, day=? WHERE id=? AND day=? AND title=? AND recurrence IS NULL AND timing IS NULL').run(title.trim(),nextDay,id,day,input[3]);
    if(changed.changes!==1)throw Error('日程已更改');
    return id;
  }
  let recurrence=null;
  if(method==='createSeries'||method==='updateSeries'){
    const rule=readRule(input[3],day);
    if(method==='updateSeries'){
      const previous=JSON.parse(input[6]);
      if(previous.moved)rule.moved=previous.moved;
      if(previous.cancelled)rule.cancelled=previous.cancelled;
    }
    recurrence=JSON.stringify(rule);
  }
  if(method==='updateSeries'){
    const [,nextStart,nextTitle,,expectedStart,expectedTitle,expectedRule]=input;
    const changed=db.prepare('UPDATE events SET day=?,title=?,recurrence=? WHERE id=? AND day=? AND title=? AND recurrence=? AND timing IS NULL')
      .run(nextStart,nextTitle.trim(),recurrence,id,expectedStart,expectedTitle,expectedRule);
    if(changed.changes!==1)throw Error('系列已更改');
    return id;
  }
  db.prepare('INSERT INTO events(id,day,title,recurrence) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,day,title.trim(),recurrence);
  const saved=db.prepare('SELECT day,title,recurrence,timing FROM events WHERE id=?').get(id);
  if(saved.timing!==null||saved.day!==day||saved.title!==title.trim()||saved.recurrence!==recurrence)throw Error('日程标识冲突');
  return id;
}

export function dispose(){scheduler?.close();scheduler=undefined;db?.close();db=undefined;}
