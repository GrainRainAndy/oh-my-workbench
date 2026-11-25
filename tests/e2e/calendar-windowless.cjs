const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { setTimeout: delay } = require('node:timers/promises');
const { DatabaseSync } = require('node:sqlite');
const { app, BrowserWindow, Notification } = require('electron');

async function verify() {
  const root = resolve(process.argv[2], 'Contents/Resources/app');
  const profile = process.env.WORKBENCH_REMINDER_TEST_PROFILE || mkdtempSync(join(tmpdir(), 'workbench-windowless-reminder-'));
  app.setPath('userData', profile);
  const dataDirectory = join(profile, 'plugin-data/workbench.calendar');
  mkdirSync(dataDirectory, {recursive:true});
  const database=join(dataDirectory,'calendar.sqlite');
  function previousClaims(){
    const reader=new DatabaseSync(database,{readOnly:true});
    try{return reader.prepare('SELECT event_id,original_day,claimed_at FROM series_claims ORDER BY event_id,original_day').all();}
    finally{reader.close();}
  }
  const restarted=process.argv.includes('--after-series-restart');
  const previous=restarted?previousClaims():[];
  if(restarted)assert.equal(previous.length,2,'Expected both occurrence receipts from the previous application process');
  const backend = await import(pathToFileURL(join(root,'plugins/calendar/backend.mjs')).href);
  const due = new Date(Math.ceil((Date.now()+4000)/60000)*60000);
  const end = new Date(+due+60000);
  const day = date => date.toISOString().slice(0,10);
  const time = date => date.toISOString().slice(11,16);
  const id = crypto.randomUUID();
  const call = (method,args) => backend.call('workbench.calendar.events',method,args,{dataDirectory});
  const series = process.argv.includes('--series');
  const event = [id,day(due),'无窗验证',time(due),day(end),time(end),'UTC'];
  const tomorrow = day(new Date(+due+86400000));
  if(series){
    call('createTimedSeries',[...event,JSON.stringify({frequency:'daily',count:2})]);
    const [row] = call('listDay',day(due)).map(JSON.parse);
    call('moveOccurrence',[id,row.start,row.title,JSON.stringify(row.rule),tomorrow,day(due)]);
  }else call('createTimed',event);
  call('configureReminder',[id,'off','0']);
  backend.dispose();

  const submitted = [];
  const show = Notification.prototype.show;
  Notification.prototype.show = function(){
    submitted.push({body:this.body, windows:BrowserWindow.getAllWindows().length, at:Date.now()});
    return show.call(this);
  };
  const created = once(app,'browser-window-created');
  require(join(root,'apps/desktop/main.cjs')).startDesktop();
  const [,window] = await created;
  await once(window.webContents,'did-finish-load');
  const closed = once(window,'closed');
  window.close();
  await closed;
  assert.ok(Date.now()<+due);
  while(!submitted.length && Date.now()<+due+5000)await delay(100);
  assert.equal(submitted.length,1);
  assert.equal(submitted[0].windows,0);
  assert.ok(submitted[0].at>=+due);
  assert.equal(submitted[0].body,series?'2 项日程提醒已到期。':'一项日程提醒已到期。');
  const db = new DatabaseSync(join(dataDirectory,'calendar.sqlite'),{readOnly:true});
  assert.ok(db.prepare('SELECT claimed_at FROM reminders WHERE event_id=?').get(id).claimed_at>=+due);
  if(series){
    const claims = db.prepare('SELECT original_day,claimed_at FROM series_claims WHERE event_id=? ORDER BY original_day').all(id);
    assert.deepEqual(claims.map(row=>row.original_day),[day(due),tomorrow]);
    assert.ok(claims.every(row=>row.claimed_at>=+due));
  }
  db.close();
  if(restarted){
    assert.deepEqual(previousClaims(),previous);
    console.log('New application process delivered one new reminder and preserved both earlier occurrence receipts.');
  }
  console.log('Closed window before deadline; native Notification.show called with zero windows; claim persisted.');
}
verify().then(()=>app.quit(),error=>{console.error(error);app.exit(1);});
