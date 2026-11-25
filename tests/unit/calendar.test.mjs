import test from 'node:test';
import assert from 'node:assert/strict';
import {occurrenceDates, calendarOccurrences, timedOccurrences, timedSpan} from '../../plugins/calendar/src/recurrence.mjs';

test('calendar recurrence skips absent dates and counts only actual occurrences', () => {
  assert.deepEqual(occurrenceDates('2024-01-31',{frequency:'monthly',count:3},'2024-12-31'),
    ['2024-01-31','2024-03-31','2024-05-31']);
  assert.deepEqual(occurrenceDates('2024-02-29',{frequency:'yearly'},'2028-02-29'),
    ['2024-02-29','2028-02-29']);
});

test('calendar recurrence respects intervals, inclusive cutoff and query horizon', () => {
  assert.deepEqual(occurrenceDates('2026-01-01',{frequency:'weekly',interval:2,until:'2026-01-29'},'2026-03-01'),
    ['2026-01-01','2026-01-15','2026-01-29']);
  assert.deepEqual(occurrenceDates('2026-03-07',{frequency:'daily'},'2026-03-09'),
    ['2026-03-07','2026-03-08','2026-03-09']);
  assert.throws(()=>occurrenceDates('2026-02-29',{frequency:'daily'},'2026-03-01'));
  assert.throws(()=>occurrenceDates('2026-01-01',{frequency:'daily',interval:0},'2026-03-01'));
});

test('single-occurrence edits retain identity and do not extend a counted series', () => {
  const exceptions = {'2026-01-01':null,'2026-01-03':'2026-01-02'};
  assert.deepEqual(calendarOccurrences('2026-01-01',{frequency:'daily',count:3},'2026-01-02',exceptions),[
    {originalDate:'2026-01-02',date:'2026-01-02'},
    {originalDate:'2026-01-03',date:'2026-01-02'}
  ]);
  assert.equal(calendarOccurrences('2026-01-01',{frequency:'daily',count:3},'2026-02-01',exceptions).length,2);
});

test('moving an occurrence beyond the series cutoff changes only its display date', () => {
  const exceptions = {'2026-01-01':'2026-02-05'};
  const rule = {frequency:'weekly',until:'2026-01-01'};
  assert.deepEqual(calendarOccurrences('2026-01-01',rule,'2026-01-31',exceptions),[]);
  assert.deepEqual(calendarOccurrences('2026-01-01',rule,'2026-02-05',exceptions),
    [{originalDate:'2026-01-01',date:'2026-02-05'}]);
});

test('timed occurrences keep wall time in the series zone after a DST transition or move', () => {
  const occurrences = timedOccurrences({
    start:'2026-03-01', time:'09:00', timeZone:'America/New_York',
    rule:{frequency:'weekly',count:3}, exceptions:{'2026-03-15':'2026-03-16'}
  }, '2026-03-16');
  assert.deepEqual(occurrences.map(item=>item.instant),[
    '2026-03-01T14:00:00Z','2026-03-08T13:00:00Z','2026-03-16T13:00:00Z'
  ]);
  assert.equal(occurrences[2].originalDate,'2026-03-15');
});

test('timed occurrences resolve gaps, overlaps and fixed-season zones consistently', () => {
  function first(start,time,timeZone){
    return timedOccurrences({start,time,timeZone,rule:{frequency:'daily',count:1}},start)[0].instant;
  }
  assert.equal(first('2026-03-08','02:30','America/New_York'),'2026-03-08T07:30:00Z');
  assert.equal(first('2026-11-01','01:30','America/New_York'),'2026-11-01T05:30:00Z');
  assert.equal(first('2026-03-08','09:00','Asia/Shanghai'),'2026-03-08T01:00:00Z');
  assert.throws(()=>first('2026-03-08','24:30','Asia/Shanghai'));
  assert.throws(()=>first('2026-03-08','09:00','Invalid/Place'));
});

test('all-day event survives a closed backend and a repeated write', async () => {
  const {mkdtemp,rm}=await import('node:fs/promises');
  const {join}=await import('node:path');
  const {tmpdir}=await import('node:os');
  const backend=await import('../../plugins/calendar/backend.mjs');
  const dataDirectory=await mkdtemp(join(tmpdir(),'calendar-store-'));
  const invoke=(method,input)=>backend.call('workbench.calendar.events',method,input,{dataDirectory});
  try{
    const timed=[crypto.randomUUID(),'2030-03-01','夜间值班','23:30','2030-03-02','07:00','Asia/Shanghai'];
    invoke('createTimed',timed);
    backend.dispose();
    invoke('createTimed',timed);
    assert.throws(()=>invoke('createAllDay',timed.slice(0,3)));
    assert.throws(()=>invoke('deleteAllDay',timed.slice(0,3)));
    const overnight=invoke('listRange',['2030-03-02','2030-03-03']).map(JSON.parse);
    assert.equal(overnight.length,1);
    assert.equal(overnight[0].timing.startInstant,'2030-03-01T15:30:00Z');
    assert.equal(overnight[0].day,'2030-03-02');
    const expectedTiming=JSON.stringify(overnight[0].timing);
    assert.throws(()=>invoke('deleteTimed',[timed[0],timed[1],'旧名称',expectedTiming]));
    assert.throws(()=>invoke('deleteTimed',[timed[0],timed[1],timed[2],'{}']));
    const updated=[...timed];
    updated[5]='00:00';
    invoke('updateTimed',[...updated,timed[2],expectedTiming]);
    assert.throws(()=>invoke('updateTimed',[...updated,timed[2],expectedTiming]));
    assert.deepEqual(invoke('listDay','2030-03-02'),[]);
    const latest=JSON.parse(invoke('listDay',timed[1])[0]);
    invoke('deleteTimed',[timed[0],timed[1],timed[2],JSON.stringify(latest.timing)]);
    backend.dispose();
    assert.deepEqual(invoke('listRange',['2030-03-01','2030-03-02']),[]);
    invoke('createTimedSeries',[...timed,JSON.stringify({frequency:'weekly',count:2})]);
    backend.dispose();
    const nextWeek=JSON.parse(invoke('listDay','2030-03-09')[0]);
    assert.equal(nextWeek.originalDay,'2030-03-08');
    assert.equal(nextWeek.timing.end,'2030-03-09');
    assert.equal(nextWeek.timing.time,'23:30');
    assert.deepEqual(invoke('listDay','2030-03-16'),[]);
    const revised=[...timed,JSON.stringify({frequency:'weekly',count:2}),nextWeek.start,nextWeek.title,JSON.stringify(nextWeek.rule),JSON.stringify(nextWeek.seriesTiming)];
    revised[3]='22:30';
    invoke('updateTimedSeries',revised);
    assert.throws(()=>invoke('updateTimedSeries',revised));
    assert.throws(()=>invoke('deleteSeries',[timed[0],nextWeek.start,nextWeek.title,JSON.stringify(nextWeek.rule)]));
    assert.equal(JSON.parse(invoke('listDay','2030-03-09')[0]).timing.time,'22:30');
    const scheduleDay='2030-04-02';
    invoke('createTimed',[crypto.randomUUID(),scheduleDay,'下午会议','14:00',scheduleDay,'15:00','Asia/Shanghai']);
    invoke('createTimed',[crypto.randomUUID(),'2030-04-01','前夜值班','23:30',scheduleDay,'07:00','Asia/Shanghai']);
    invoke('createAllDay',[crypto.randomUUID(),scheduleDay,'全天休假']);
    invoke('createTimed',[crypto.randomUUID(),scheduleDay,'上午会议','09:00',scheduleDay,'10:00','Asia/Shanghai']);
    const ordered=['全天休假','前夜值班','上午会议','下午会议'];
    assert.deepEqual(invoke('listDay',scheduleDay).map(value=>JSON.parse(value).title),ordered);
    assert.deepEqual(invoke('listRange',[scheduleDay,scheduleDay]).map(value=>JSON.parse(value).title),ordered);
    const calendar=crypto.randomUUID();
    invoke('createCalendar',[calendar,'工作']);
    backend.dispose();
    assert.equal(invoke('listCalendars','').map(JSON.parse)[1].name,'工作');
    const assigned=[calendar,'createAllDay',crypto.randomUUID(),'2030-04-03','部门评审'];
    assert.throws(()=>invoke('createInCalendar',['不存在',...assigned.slice(1)]));
    assert.deepEqual(invoke('listDay',assigned[3]),[]);
    invoke('createInCalendar',assigned);
    backend.dispose();
    invoke('createInCalendar',assigned);
    assert.equal(invoke('listRange',[assigned[3],assigned[3],calendar]).length,1);
    assert.throws(()=>invoke('createInCalendar',['default',...assigned.slice(1)]));
    assert.deepEqual(invoke('listRange',[assigned[3],assigned[3],'default']),[]);
    const meeting=invoke('listRange',[scheduleDay,scheduleDay,'default']).map(JSON.parse)[0];
    invoke('moveToCalendar',[meeting.id,'default',calendar]);
    assert.throws(()=>invoke('moveToCalendar',[meeting.id,'default',calendar]));
    assert.equal(invoke('listRange',[scheduleDay,scheduleDay,'default']).length,3);
    assert.equal(invoke('listRange',[scheduleDay,scheduleDay,calendar]).map(JSON.parse)[0].id,meeting.id);
    const series=crypto.randomUUID(), rule={frequency:'monthly',count:2};
    invoke('createSeries',[series,'2026-01-31','月末',JSON.stringify(rule)]);
    backend.dispose();
    assert.deepEqual(invoke('listDay','2026-02-28'),[]);
    assert.equal(JSON.parse(invoke('listDay','2026-03-31')[0]).title,'月末');
    assert.deepEqual(invoke('listDay','2026-05-31'),[]);
    assert.throws(()=>invoke('deleteAllDay',[series,'2026-01-31','月末']));
    const prior=JSON.parse(invoke('listDay','2026-03-31')[0]);
    const edit=[series,'2026-02-01','每周复盘',JSON.stringify({frequency:'weekly',count:2}),prior.start,prior.title,JSON.stringify(prior.rule)];
    invoke('updateSeries',edit);
    assert.throws(()=>invoke('updateSeries',edit));
    assert.equal(JSON.parse(invoke('listDay','2026-02-08')[0]).title,'每周复盘');
    assert.deepEqual(invoke('listDay','2026-03-31'),[]);
    assert.throws(()=>invoke('deleteSeries',[series,prior.start,prior.title,JSON.stringify(prior.rule)]));
    const current=JSON.parse(invoke('listDay','2026-02-08')[0]);
    const move=(row,target)=>invoke('moveOccurrence',[series,row.start,row.title,JSON.stringify(row.rule),'2026-02-08',target]);
    move(current,'2026-01-30');
    backend.dispose();
    const advanced=JSON.parse(invoke('listDay','2026-01-30')[0]);
    assert.equal(advanced.originalDay,'2026-02-08');
    const range=invoke('listRange',['2026-01-30','2026-02-08']).map(JSON.parse);
    assert.deepEqual(range.map(({day,originalDay})=>[day,originalDay]),[
      ['2026-01-30','2026-02-08'],['2026-02-01','2026-02-01']
    ]);
    assert.throws(()=>invoke('listRange',['2026-03-01','2026-02-28']));
    assert.throws(()=>invoke('listRange',['2026-01-01','2026-02-12']));
    move(advanced,current.start);
    backend.dispose();
    const together=invoke('listDay',current.start).map(JSON.parse);
    assert.deepEqual(together.map(row=>row.originalDay),[current.start,'2026-02-08']);
    invoke('cancelOccurrence',[series,current.start,current.title,JSON.stringify(together[1].rule),'2026-02-08']);
    assert.equal(invoke('listDay',current.start).length,1);
    assert.deepEqual(invoke('listDay','2026-02-08'),[]);
    const remaining=JSON.parse(invoke('listDay',current.start)[0]);
    invoke('updateSeries',[series,current.start,'改名后',JSON.stringify({frequency:'weekly',count:3}),current.start,current.title,JSON.stringify(remaining.rule)]);
    backend.dispose();
    assert.deepEqual(invoke('listDay','2026-02-08'),[]);
    const third=JSON.parse(invoke('listDay','2026-02-15')[0]);
    invoke('deleteSeries',[series,third.start,third.title,JSON.stringify(third.rule)]);
    backend.dispose();
    assert.deepEqual(invoke('listDay','2026-02-08'),[]);
    const id=crypto.randomUUID(),day='2026-10-20';
    invoke('createAllDay',[id,day,'团队评审']);
    backend.dispose();
    invoke('createAllDay',[id,day,'团队评审']);
    assert.deepEqual(invoke('listDay',day).map(JSON.parse),[{id,title:'团队评审'}]);
    assert.throws(()=>invoke('createAllDay',[id,day,'别的事件']));
    invoke('renameAllDay',[id,day,'项目复盘','团队评审']);
    assert.throws(()=>invoke('renameAllDay',[id,day,'过期编辑','团队评审']));
    backend.dispose();
    assert.deepEqual(invoke('listDay',day).map(JSON.parse),[{id,title:'项目复盘'}]);
    assert.throws(()=>invoke('deleteAllDay',[id,day,'团队评审']));
    const tomorrow='2026-10-21';
    assert.throws(()=>invoke('updateAllDay',[id,day,'移动','项目复盘','2026-02-30']));
    invoke('updateAllDay',[id,day,'移动','项目复盘',tomorrow]);
    assert.throws(()=>invoke('updateAllDay',[id,day,'过期移动','项目复盘',tomorrow]));
    backend.dispose();
    assert.deepEqual(invoke('listDay',day),[]);
    assert.deepEqual(invoke('listDay',tomorrow).map(JSON.parse),[{id,title:'移动'}]);
    assert.equal(invoke('deleteAllDay',[id,tomorrow,'移动']),id);
    backend.dispose();
    assert.deepEqual(invoke('listDay',tomorrow),[]);
  }finally{backend.dispose();await rm(dataDirectory,{recursive:true,force:true});}
});

test('upgrading the calendar copy preserves existing events as non-recurring', async t=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {mkdtemp,rm,copyFile}=await import('node:fs/promises');
  const {join}=await import('node:path');
  const {tmpdir}=await import('node:os');
  const {migrate}=await import('../../plugins/calendar/migrate.mjs');
  const dataDirectory=await mkdtemp(join(tmpdir(),'calendar-upgrade-'));
  t.after(()=>rm(dataDirectory,{recursive:true,force:true}));
  const source=join(dataDirectory,'source.sqlite');
  const original=new DatabaseSync(source);
  original.exec("CREATE TABLE events(id TEXT PRIMARY KEY, day TEXT NOT NULL, title TEXT NOT NULL); INSERT INTO events VALUES('old','2026-01-01','原有日程'); PRAGMA user_version=1");
  original.close();
  const copy=join(dataDirectory,'calendar.sqlite');
  await copyFile(source,copy);
  migrate({dataDirectory});
  for(const [path,version] of [[source,1],[copy,6]]){
    const db=new DatabaseSync(path,{readOnly:true});
    try{
      assert.equal(db.prepare('PRAGMA user_version').get().user_version,version);
      assert.equal(db.prepare('SELECT title FROM events').get().title,'原有日程');
      if(version===6)assert.equal(db.prepare('SELECT recurrence FROM events').get().recurrence,null);
    }finally{db.close();}
  }
});

test('timed spans include occupied local dates and exclude midnight endpoints',()=>{
  const event={start:'2026-03-07',time:'23:30',end:'2026-03-08',endTime:'03:30',timeZone:'America/New_York'};
  assert.deepEqual(timedSpan(event),{
    startInstant:'2026-03-08T04:30:00Z',endInstant:'2026-03-08T07:30:00Z',
    firstDay:'2026-03-07',lastDay:'2026-03-08'
  });
  assert.equal(timedSpan({...event,endTime:'00:00'}).lastDay,'2026-03-07');
  assert.throws(()=>timedSpan({...event,end:event.start,endTime:event.time}));
  assert.throws(()=>timedSpan({...event,end:'2026-02-30'}));
});

test('v2 calendar upgrade preserves moved and cancelled series instances',async t=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {mkdtemp,rm,copyFile,readFile}=await import('node:fs/promises');
  const {join}=await import('node:path');
  const {tmpdir}=await import('node:os');
  const {migrate}=await import('../../plugins/calendar/migrate.mjs');
  const backend=await import('../../plugins/calendar/backend.mjs');
  const dataDirectory=await mkdtemp(join(tmpdir(),'calendar-v2-series-'));
  t.after(async()=>{backend.dispose();await rm(dataDirectory,{recursive:true,force:true});});
  const source=join(dataDirectory,'source.sqlite');
  const original=new DatabaseSync(source);
  const id=crypto.randomUUID();
  const rule={frequency:'daily',interval:1,count:3,moved:{'2031-05-05':'2031-05-03'},cancelled:['2031-05-06']};
  try{
    original.exec('CREATE TABLE events(id TEXT PRIMARY KEY,day TEXT NOT NULL,title TEXT NOT NULL,recurrence TEXT); CREATE INDEX events_day ON events(day); PRAGMA user_version=2');
    original.prepare('INSERT INTO events VALUES(?,?,?,?)').run(id,'2031-05-04','巡检',JSON.stringify(rule));
  }finally{original.close();}
  const before=await readFile(source);
  await copyFile(source,join(dataDirectory,'calendar.sqlite'));
  migrate({dataDirectory});
  const rows=backend.call('workbench.calendar.events','listRange',['2031-05-03','2031-05-07'],{dataDirectory}).map(JSON.parse);
  assert.deepEqual(rows.map(row=>[row.id,row.day,row.originalDay]),[
    [id,'2031-05-03','2031-05-05'],[id,'2031-05-04','2031-05-04']
  ]);
  assert.deepEqual(rows[0].rule,rule);
  assert.deepEqual(await readFile(source),before);
});

test('overnight series follows local endpoints across DST and a moved occurrence',()=>{
  const rows=timedOccurrences({
    start:'2026-03-07',time:'23:30',end:'2026-03-08',endTime:'03:30',timeZone:'America/New_York',
    rule:{frequency:'weekly',count:3},exceptions:{'2026-03-14':'2026-03-15','2026-03-21':null}
  },'2026-03-22');
  assert.deepEqual(rows.map(row=>[row.originalDate,row.firstDay,row.lastDay,row.startInstant,row.endInstant]),[
    ['2026-03-07','2026-03-07','2026-03-08','2026-03-08T04:30:00Z','2026-03-08T07:30:00Z'],
    ['2026-03-14','2026-03-15','2026-03-16','2026-03-16T03:30:00Z','2026-03-16T07:30:00Z']
  ]);
});

test('a spring gap cannot invalidate the remaining occurrences of a timed series',()=>{
  const rows=timedOccurrences({start:'2026-03-01',time:'02:45',end:'2026-03-01',endTime:'03:15',
    timeZone:'America/New_York',rule:{frequency:'weekly',count:3}},'2026-03-15');
  assert.deepEqual(rows.map(row=>[row.startInstant,row.endInstant]),[
    ['2026-03-01T07:45:00Z','2026-03-01T08:15:00Z'],
    ['2026-03-08T07:45:00Z','2026-03-08T08:15:00Z'],
    ['2026-03-15T06:45:00Z','2026-03-15T07:15:00Z']
  ]);
});

test('missed single-event reminders are claimed together and survive restart without replay',async t=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {mkdtemp,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const backend=await import('../../plugins/calendar/backend.mjs');
  const {setReminder,claimDueReminders}=await import('../../plugins/calendar/src/reminders.mjs');
  const dataDirectory=await mkdtemp(join(tmpdir(),'calendar-reminders-'));
  t.after(()=>rm(dataDirectory,{recursive:true,force:true}));
  const ids=[crypto.randomUUID(),crypto.randomUUID()];
  try{
    for(const id of ids)backend.call('workbench.calendar.events','createTimed',[id,'2030-01-01','会议','09:00','2030-01-01','10:00','Asia/Shanghai'],{dataDirectory});
  }finally{backend.dispose();}
  const path=join(dataDirectory,'calendar.sqlite');
  const due=Date.parse('2030-01-01T00:50:00Z');
  const db=new DatabaseSync(path);
  try{
    for(const id of ids)setReminder(db,id,10);
    assert.deepEqual(claimDueReminders(db,due-1),[]);
    assert.deepEqual(claimDueReminders(db,due+60000).map(row=>row.id),ids.sort());
  }finally{db.close();}
  const reopened=new DatabaseSync(path);
  try{assert.deepEqual(claimDueReminders(reopened,due+120000),[]);}finally{reopened.close();}
});

test('calendar scheduler re-arms for changed reminders and delivers one overdue batch',async t=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {reminderTables,setReminder,createReminderScheduler}=await import('../../plugins/calendar/src/reminders.mjs');
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE events(id TEXT PRIMARY KEY,title TEXT,timing TEXT,recurrence TEXT);'+reminderTables);
  const batches=[];
  let delivered;
  const result=new Promise(resolve=>{delivered=resolve;});
  const scheduler=createReminderScheduler(db,rows=>{batches.push(rows);delivered();},delivered);
  t.after(()=>{scheduler.close();db.close();});
  scheduler.refresh();
  const insert=db.prepare('INSERT INTO events VALUES(?,?,?,NULL)');
  for(const id of ['a','b']){
    insert.run(id,'会议',JSON.stringify({startInstant:new Date(Date.now()+3600000).toISOString()}));
    setReminder(db,id,0);
  }
  scheduler.refresh();
  db.prepare('UPDATE events SET timing=?').run(JSON.stringify({startInstant:'2020-01-01T00:00:00Z'}));
  scheduler.refresh();
  await result;
  assert.deepEqual(batches.map(rows=>rows.map(row=>row.id)),[['a','b']]);
  assert.equal(db.prepare('SELECT count(*) AS pending FROM reminders WHERE claimed_at IS NULL').get().pending,0);
});

test('fresh calendar processes submit one startup summary for two missed reminders',async t=>{
  const {execFile}=await import('node:child_process');
  const {promisify}=await import('node:util');
  const {mkdtemp,rm}=await import('node:fs/promises');
  const {join}=await import('node:path');
  const {tmpdir}=await import('node:os');
  const dataDirectory=await mkdtemp(join(tmpdir(),'calendar-relaunch-'));
  t.after(()=>rm(dataDirectory,{recursive:true,force:true}));
  const backendURL=new URL('../../plugins/calendar/backend.mjs',import.meta.url).href;
  async function run(source){
    const {stdout}=await promisify(execFile)(process.execPath,[
      '--input-type=module','-e',source,backendURL,dataDirectory
    ],{timeout:5000});
    return stdout.trim();
  }
  await run(`
    const {call,dispose}=await import(process.argv[1]);
    const context={dataDirectory:process.argv[2]};
    for(const title of ['早会','复盘']){
      const id=crypto.randomUUID();
      call('workbench.calendar.events','createTimed',[id,'2000-01-01',title,'09:00','2000-01-01','10:00','Asia/Shanghai'],context);
      call('workbench.calendar.events','configureReminder',[id,'off','10'],context);
    }
    dispose();
  `);
  const launch=`
    const {activate}=await import(process.argv[1]);
    const messages=[];
    const close=activate({dataDirectory:process.argv[2],showNotification:body=>messages.push(body)});
    process.once('beforeExit',()=>{close();console.log(JSON.stringify(messages));});
  `;
  assert.deepEqual(JSON.parse(await run(launch)),['2 项日程提醒已到期。']);
  assert.deepEqual(JSON.parse(await run(launch)),[]);
});

test('rescheduling a delivered single reminder re-arms only for a future deadline',async t=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {mkdtemp,rm}=await import('node:fs/promises');
  const {join}=await import('node:path');
  const {tmpdir}=await import('node:os');
  const backend=await import('../../plugins/calendar/backend.mjs');
  const {claimDueReminders}=await import('../../plugins/calendar/src/reminders.mjs');
  const dataDirectory=await mkdtemp(join(tmpdir(),'calendar-rearm-'));
  t.after(()=>{backend.dispose();return rm(dataDirectory,{recursive:true,force:true});});
  const invoke=(method,input)=>backend.call('workbench.calendar.events',method,input,{dataDirectory});
  const id=crypto.randomUUID();
  const args=[id,'2000-01-01','会议','09:00','2000-01-01','10:00','UTC'];
  invoke('createTimed',args);
  invoke('configureReminder',[id,'off','10']);
  const db=new DatabaseSync(join(dataDirectory,'calendar.sqlite'));
  try{
    assert.equal(claimDueReminders(db,Date.now()).length,1);
    const snapshot=JSON.parse(invoke('listDay',args[1])[0]).timing;
    args[2]='新会议名';
    invoke('updateTimed',[...args,'会议',JSON.stringify(snapshot)]);
    assert.equal(claimDueReminders(db,Date.now()).length,0);
    const future=Temporal.Now.plainDateISO('UTC').add({days:3}).toString();
    args[1]=args[4]=future;
    invoke('updateTimed',[...args,args[2],JSON.stringify(snapshot)]);
    assert.equal(claimDueReminders(db,Date.now()).length,0);
    const due=Date.parse(future+'T08:50:00Z');
    assert.equal(claimDueReminders(db,due).length,1);
    assert.equal(claimDueReminders(db,due+1).length,0);
  }finally{db.close();}
});

test('changing reminder lead time rearms a future deadline without replaying a past one',async()=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {reminderTables,setReminder,claimDueReminders}=await import('../../plugins/calendar/src/reminders.mjs');
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('CREATE TABLE events(id TEXT PRIMARY KEY,title TEXT,timing TEXT,recurrence TEXT);'+reminderTables);
    const start='2031-05-05T09:00:00Z',minute=60000;
    db.prepare('INSERT INTO events VALUES(?,?,?,NULL)').run('meeting','晨会',JSON.stringify({startInstant:start}));
    const at=Date.parse(start);
    setReminder(db,'meeting',30,at-60*minute);
    assert.equal(claimDueReminders(db,at-30*minute).length,1);
    setReminder(db,'meeting',60,at-25*minute);
    assert.equal(claimDueReminders(db,at-25*minute).length,0);
    setReminder(db,'meeting',10,at-25*minute);
    assert.equal(claimDueReminders(db,at-11*minute).length,0);
    assert.equal(claimDueReminders(db,at-10*minute).length,1);
    setReminder(db,'meeting',10,at-9*minute);
    assert.equal(claimDueReminders(db,at).length,0);
  }finally{db.close();}
});


test('range-limited recurrence preserves count and exceptions moved across either boundary',async()=>{
  const {calendarOccurrences}=await import('../../plugins/calendar/src/recurrence.mjs');
  const rule={frequency:'weekly',interval:2,count:4};
  const exceptions={'2020-01-01':'2020-02-02','2020-02-12':'2020-02-01'};
  const all=calendarOccurrences('2020-01-01',rule,'2020-03-01',exceptions);
  assert.deepEqual(calendarOccurrences('2020-01-01',rule,'2020-02-03',exceptions,'2020-02-01'),
    all.filter(o=>o.date>='2020-02-01'&&o.date<='2020-02-03'));
  assert.deepEqual(calendarOccurrences('2020-01-01',rule,'2030-01-31',{},'2030-01-01'),[]);
});

test('next series reminder groups moved instances, skips cancellation and follows the creation zone across DST',async()=>{
  const {nextSeriesReminder}=await import('../../plugins/calendar/src/recurrence.mjs');
  const timing={start:'2026-03-06',time:'09:00',timeZone:'America/New_York'};
  const rule={frequency:'daily',count:5,moved:{'2026-03-10':'2026-03-08'},cancelled:['2026-03-07']};
  const next=cursor=>nextSeriesReminder(timing,rule,30,Date.parse(cursor));
  assert.deepEqual(next('2026-03-06T13:29:59Z'),{deadline:Date.parse('2026-03-06T13:30Z'),originals:['2026-03-06']});
  assert.deepEqual(next('2026-03-06T13:30Z'),{deadline:Date.parse('2026-03-08T12:30Z'),originals:['2026-03-08','2026-03-10']});
  assert.deepEqual(next('2026-03-08T12:30Z'),{deadline:Date.parse('2026-03-09T12:30Z'),originals:['2026-03-09']});
  assert.equal(next('2026-03-09T12:30Z'),null);
});

test('series claims survive reopen and moved claimed instances are not replayed',async t=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {mkdtemp,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const backend=await import('../../plugins/calendar/backend.mjs');
  const {setReminder,claimDueReminders}=await import('../../plugins/calendar/src/reminders.mjs');
  const dataDirectory=await mkdtemp(join(tmpdir(),'series-claims-'));
  t.after(()=>rm(dataDirectory,{recursive:true,force:true}));
  const id=crypto.randomUUID(),rule={frequency:'daily',count:3};
  backend.call('workbench.calendar.events','createTimedSeries',[id,'2030-01-01','晨会','09:00','2030-01-01','10:00','UTC',JSON.stringify(rule)],{dataDirectory});
  backend.dispose();
  const path=join(dataDirectory,'calendar.sqlite');
  const first=new DatabaseSync(path);
  try{
    setReminder(first,id,0,Date.parse('2030-01-01T08:00Z'));
    assert.deepEqual(claimDueReminders(first,Date.parse('2030-01-02T09:00Z')).map(r=>r.original),['2030-01-01','2030-01-02']);
  }finally{first.close();}
  const next=new DatabaseSync(path);
  try{
    next.prepare('UPDATE events SET recurrence=? WHERE id=?').run(JSON.stringify({...rule,moved:{'2030-01-01':'2030-01-03'}}),id);
    assert.deepEqual(claimDueReminders(next,Date.parse('2030-01-03T09:00Z')).map(r=>r.original),['2030-01-03']);
    assert.deepEqual(claimDueReminders(next,Date.parse('2030-01-04T09:00Z')),[]);
  }finally{next.close();}
});
