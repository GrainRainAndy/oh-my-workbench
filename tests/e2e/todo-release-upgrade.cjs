const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, mkdirSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');
const { app, dialog } = require('electron');

async function verify() {
  const [previous, current] = process.argv.slice(2,4).map(path => resolve(path, 'Contents/Resources/app'));
  const calendar=process.argv.includes('--calendar');
  const plugin=calendar?'calendar':'todo';
  const profile = mkdtempSync(join(tmpdir(), 'workbench-'+plugin+'-upgrade-'));
  app.setPath('userData', profile);
  const owner = 'workbench.'+plugin;
  const service = calendar?'workbench.calendar.events':'workbench.todo.items';
  const directory = join(profile, 'plugin-data', owner);
  mkdirSync(directory, { recursive: true });
  const backend = root => import(pathToFileURL(join(root, 'plugins',plugin,'backend.mjs')).href);
  const old = await backend(previous);
  const call = (method, input) => old.call(service, method, input, { dataDirectory: directory });
  let verifyResult;
  if(calendar){
    const id=crypto.randomUUID();
    const date='2000-01-01';
    call('createTimed',[id,date,'旧提醒','09:00',date,'10:00','UTC']);
    call('configureReminder',[id,'off','10']);
    const rows=call('listDay',date);
    old.dispose();
    const reminders=root=>import(pathToFileURL(join(root,'plugins/calendar/src/reminders.mjs')).href);
    const file=join(directory,'calendar.sqlite');
    const db=new DatabaseSync(file);
    const claimedAt=Date.now()-10000;
    try{
      const {claimDueReminders}=await reminders(previous);
      assert.deepEqual(claimDueReminders(db,claimedAt).map(row=>row.id),[id]);
    }finally{db.close();}
    verifyResult=async(read,dataDirectory)=>{
      assert.deepEqual(read('listDay',date),rows);
      const copy=new DatabaseSync(join(dataDirectory,'calendar.sqlite'));
      try{
        const {claimDueReminders}=await reminders(current);
        assert.deepEqual(claimDueReminders(copy,Date.now()),[]);
        assert.equal(copy.prepare('SELECT claimed_at FROM reminders WHERE event_id=?').get(id).claimed_at,claimedAt);
        assert.equal(copy.prepare('SELECT count(*) AS n FROM series_claims').get().n,0);
        assert.equal(copy.prepare('PRAGMA user_version').get().user_version,6);
      }finally{copy.close();}
    };
  }else{
    const list = crypto.randomUUID();
    const item = crypto.randomUUID();
    call('createList', [list, '项目']);
    call('swapLists', ['inbox', list]);
    call('createInList', [item, '迁移核对', list]);
    call('setDetails', [item, '0', '原备注', '2032-02-29', 'high']);
    call('setCompleted', [item, '0', '1']);
    const lists = call('lists', '');
    const completed = call('listItems', [list, 'completed']);
    verifyResult=read=>{
      assert.deepEqual(read('lists',''),lists);
      assert.deepEqual(read('listItems',[list,'completed']),completed);
      assert.deepEqual(read('lists','archived'),[]);
    };
  }
  old.dispose();
  const file = join(directory, plugin+'.sqlite');
  const original = readFileSync(file);

  const created = once(app, 'browser-window-created');
  require(join(current, 'apps/desktop/main.cjs')).startDesktop();
  const [,win] = await created;
  await once(win.webContents, 'did-finish-load');
  let prompts = 0;
  dialog.showMessageBoxSync = (_, options) => {
    assert.match(options.detail, calendar?/版本 5 → 6/:/版本 4 → 5/);
    prompts++;
    return 1;
  };
  const reloaded = once(win.webContents, 'did-finish-load');
  await win.webContents.executeJavaScript(`window.plugins.upgrade(${JSON.stringify(owner)})`);
  await reloaded;
  assert.equal(prompts, 1);
  assert.equal(await win.webContents.executeJavaScript('(async()=>(await window.backups.list()).length)()'), 1);
  const { pluginDirectory } = require(join(current, 'packages/host-core/src/persistence/backup.cjs'));
  const dataDirectory = pluginDirectory(profile, owner);
  assert.notEqual(directory, dataDirectory);
  assert.deepEqual(readFileSync(file), original);
  const upgraded = await backend(current);
  const read = (method,input) => upgraded.call(service, method, input, {dataDirectory});
  await verifyResult(read,dataDirectory);
  upgraded.dispose();
  console.log(plugin+' upgrade verified: backup, original bytes and plugin records');
}

verify().then(() => app.quit(), error => { console.error(error); app.exit(1); });
