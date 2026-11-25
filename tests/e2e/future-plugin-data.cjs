const assert=require('node:assert/strict');
const {once}=require('node:events');
const {setTimeout:delay}=require('node:timers/promises');
const {join}=require('node:path');
const {mkdirSync,readFileSync}=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {app}=require('electron');

async function verify(){
  const legacy=process.argv.includes('--legacy-limit');
  const profile=join(process.env.WORKBENCH_E2E_TEMP_DIR,legacy?'legacy-limit':'future-plugin-data');
  const data=join(profile,'plugin-data','fixture.tally');
  mkdirSync(data,{recursive:true});
  app.setPath('userData',profile);
  const file=join(data,'counter.sqlite');
  const db=new DatabaseSync(file);
  if(legacy){
    db.exec('CREATE TABLE tally(id INTEGER PRIMARY KEY CHECK(id=1),count INTEGER NOT NULL)');
    db.prepare('INSERT INTO tally VALUES(1,?)').run(Number.MAX_SAFE_INTEGER);
  }else db.exec('PRAGMA user_version=7;CREATE TABLE future_data(n);INSERT INTO future_data VALUES(21)');
  db.close();
  const original=readFileSync(file);
  const created=once(app,'browser-window-created');
  require('../../apps/desktop/main.cjs').startDesktop();
  const [,win]=await created;
  await once(win.webContents,'did-finish-load');
  const run=code=>win.webContents.executeJavaScript(code);
  await run(`window.workspaces.save({id:'future',name:'兼容性',schemaVersion:1,revision:0,
    activePaneId:'p',layout:{type:'leaf',paneId:'p',viewInstanceId:'v'},
    views:{v:{id:'v',pluginId:'fixture.tally',viewType:'counter',configVersion:1,stateVersion:1,config:{},state:{}}}})`);
  const ready=once(win.webContents,'did-finish-load');
  win.reload();await ready;
  async function verifyView(){
    let message;
    for(let i=0;i<100&&!message;i++){
      message=await run(legacy?"document.querySelector('.tally-view [role=status]')?.textContent":"document.querySelector('.tally-view [role=alert]')?.textContent");
      if(!message)await delay(30);
    }
    assert.match(message,legacy?/已达计数上限/:/使用兼容版本打开/);
    if(legacy)assert.equal(await run("document.querySelector('.tally-view output').textContent"),String(Number.MAX_SAFE_INTEGER));
    assert.equal(await run("document.querySelector('.tally-view .plugin').disabled"),true);
  }
  await verifyView();
  assert.deepEqual(readFileSync(file),original);
  const backup=await run('window.backups.create()');
  await run("(async()=>{const [w]=await window.workspaces.list();return window.workspaces.save({...w,name:'备份后名称'});})()");
  const restored=once(win.webContents,'did-finish-load');
  await run(`window.backups.restore(${JSON.stringify(backup.id)})`);
  await restored;
  await verifyView();
  assert.equal(await run("document.querySelector('h1').textContent"),'兼容性');
  const {pluginDirectory}=require('../../packages/host-core/src/persistence/backup.cjs');
  const restoredFile=join(pluginDirectory(profile,'fixture.tally'),'counter.sqlite');
  assert.notEqual(restoredFile,file);
  const reopened=new DatabaseSync(restoredFile,{readOnly:true});
  try{
    assert.equal(reopened.prepare('PRAGMA user_version').get().user_version,legacy?0:7);
    const row=reopened.prepare(legacy?'SELECT count AS n FROM tally':'SELECT n FROM future_data').get();
    assert.equal(row.n,legacy?Number.MAX_SAFE_INTEGER:21);
  }finally{reopened.close();}
  await run("document.querySelector('.manage-link').click()");
  const clickUpgrade="document.getElementById('purpose-fixture.tally').closest('article').querySelector('.plugin-upgrade button').click()";
  const {dialog}=require('electron');
  const nativeCancel=legacy&&process.argv.includes('--native-cancel');
  const nativeUpgrade=legacy&&process.argv.includes('--native-upgrade');
  const showNative=dialog.showMessageBoxSync.bind(dialog);
  let response=0,prompts=0;
  dialog.showMessageBoxSync=(_win,options)=>{
    assert.match(options.detail,/版本 0 → 1/);
    prompts++;
    if((nativeCancel&&prompts===1)||(nativeUpgrade&&prompts===3)){
      console.log("Waiting for native upgrade decision, pid",process.pid);
      return showNative(_win,options);
    }
    return response;
  };
  async function waitForMessage(text){
    for(let i=0;i<100;i++){
      if(await run(`document.querySelector('.manager-list [role=status]')?.textContent.includes(${JSON.stringify(text)})`))return;
      await delay(30);
    }
    throw Error('Missing upgrade status '+text);
  }
  const beforeCheck=readFileSync(restoredFile);
  await run(clickUpgrade);
  await waitForMessage(legacy?'已取消升级':'较新版本');
  assert.equal(prompts,legacy?1:0);
  assert.deepEqual(readFileSync(restoredFile),beforeCheck);
  assert.equal(await run('(async()=>(await window.backups.list()).length)()'),2);
  if(legacy){
    win.setSize(660,460);
    response=1;
    const active=new DatabaseSync(restoredFile);
    try{
      active.exec('UPDATE tally SET count=-1 WHERE id=1');
      await run(clickUpgrade);
      await waitForMessage('原数据已保留');
      assert.ok(await run(`(()=>{
        const tools=document.getElementById('purpose-fixture.tally').closest('article').querySelector('.plugin-upgrade'),row=tools.closest('article');
        const toggle=row.querySelector('[role=switch]').getBoundingClientRect();
        const info=row.querySelector('.plugin-info').getBoundingClientRect();
        return toggle.left>=info.right && toggle.right<=innerWidth && toggle.width>=42
          && tools.getBoundingClientRect().top>=toggle.bottom && row.scrollWidth<=row.clientWidth;
      })()`));
      assert.equal(active.prepare('SELECT count FROM tally WHERE id=1').get().count,-1);
      assert.equal(join(pluginDirectory(profile,'fixture.tally'),'counter.sqlite'),restoredFile);
      for(let i=0;i<100&&!await run("document.querySelector('.backup-history summary')?.textContent.includes('3')");i++)await delay(30);
      assert.equal(await run("document.querySelector('.backup-history summary').textContent"),'备份记录（3）');
      let revealed;
      const nativeFinder=process.argv.includes('--native-finder');
      if(!nativeFinder)require('electron').shell.showItemInFolder=path=>{revealed=path;};
      await run("Array.from(document.querySelectorAll('.manager-list button')).find(b=>b.textContent.includes('显示升级前备份')).click()");
      const latest=await run('(async()=>(await window.backups.list())[0].id)()');
      const expected=join(profile,'backups',latest);
      if(nativeFinder){
        const {execFile}=require('node:child_process');
        const execute=require('node:util').promisify(execFile);
        const actualPath=require('node:fs').realpathSync;
        for(let i=0;i<80;i++){
          const {stdout}=await execute('osascript',['-e',
            'tell application "Finder" to return POSIX path of ((item 1 of (get selection)) as alias)']);
          revealed=stdout.trim();
          if(revealed && actualPath(revealed)===actualPath(expected))break;
          await delay(100);
        }
        assert.ok(revealed,'Finder did not report a selected folder');
        assert.equal(actualPath(revealed),actualPath(expected));
        console.log('Finder selected the verified pre-upgrade backup:',latest);
      }else{
        for(let i=0;i<100&&!revealed;i++)await delay(30);
        assert.equal(revealed,expected);
      }
      active.prepare('UPDATE tally SET count=? WHERE id=1').run(Number.MAX_SAFE_INTEGER);
    }finally{active.close();}
    const reload=once(win.webContents,'did-finish-load');
    await run(clickUpgrade);
    await reload;
    await verifyView();
    assert.equal(prompts,3);
    const upgraded=new DatabaseSync(join(pluginDirectory(profile,'fixture.tally'),'counter.sqlite'),{readOnly:true});
    try{assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version,1);}finally{upgraded.close();}
    assert.equal(await run('(async()=>(await window.backups.list()).length)()'),4);
  }
  assert.deepEqual(readFileSync(file),original);
}
verify().then(()=>app.quit(),error=>{console.error(error);app.exit(1);});
