const {app}=require('electron');
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {mkdirSync}=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const profile=join(process.env.WORKBENCH_E2E_TEMP_DIR,'safe-mode');
mkdirSync(profile);
app.setPath('userData',profile);
const w={id:'safe',schemaVersion:1,name:'安全启动验证',revision:4,activePaneId:'p',
  layout:{type:'leaf',paneId:'p',viewInstanceId:'v'},views:{v:{id:'v',pluginId:'fixture.tally',viewType:'counter',configVersion:1,stateVersion:1,config:{},state:{}}}};
const db=new DatabaseSync(join(profile,'workspaces.sqlite'));
db.exec('CREATE TABLE workspaces(id TEXT PRIMARY KEY, revision INTEGER NOT NULL,payload TEXT NOT NULL)');
db.prepare('INSERT INTO workspaces VALUES(?,?,?)').run(w.id,w.revision,JSON.stringify(w));
db.close();
const timer=setTimeout(()=>app.exit(1),15000);
app.once('browser-window-created',(_,win)=>{
  win.webContents.once('did-finish-load',async()=>{
    const run=code=>win.webContents.executeJavaScript(code);
    try{
      for(let i=0;i<100&&!await run("Boolean(document.querySelector('.safe-mode'))");i++)await new Promise(r=>setTimeout(r,30));
      assert.equal(await run("document.querySelector('.empty h2')?.textContent"),'插件已暂停');
      assert.equal(await run("performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/view-')).length"),0);
      assert.deepEqual(await run('window.workspaces.list()'),[w]);
      const request={workspaceId:w.id,viewId:'v',service:'workbench.tally',version:'1.0.0',method:'increment',input:'total'};
      assert.equal(await run(`window.viewServices.call(${JSON.stringify(request)}).then(()=>false,e=>e.message.includes('安全模式'))`),true);
      assert.equal(await run("window.jobs.submit({}).then(()=>false,e=>e.message.includes('安全模式'))"),true);
      assert.equal(app.getAppMetrics().filter(p=>p.name?.startsWith('Workbench fixture.')).length,0);
      assert.equal(await run("(async()=>(await window.plugins.list()).every(p=>p.enabled))()"),true);
      await run("document.querySelector('.manage-link').click()");
      assert.match(await run("document.querySelector('#safe-mode-explanation').textContent"),/下次正常启动时生效/);
      assert.deepEqual(await run("document.querySelector('[role=switch][aria-label=计数器]').getAttribute('aria-describedby').split(' ').sort()"),['purpose-fixture.tally','safe-mode-explanation']);
      await run("document.querySelector('[role=switch][aria-label=计数器]').click()");
      assert.equal(await run("(async()=>!(await window.plugins.list()).find(p=>p.id==='fixture.tally').enabled)()"),true);
      const prefs=await run('window.desktopPreferences.read()');
      assert.deepEqual(prefs,{tray:true,shortcut:'',registered:false});
      await run("document.querySelector('[aria-label=显示菜单栏图标]').click()");
      assert.equal((await run('window.desktopPreferences.read()')).tray,false);
      await run("window.desktopPreferences.setTray(true)");
      try{
        await run("window.desktopPreferences.setShortcut('Control+Alt+Shift+Command+9')");
        assert.equal(require('../../apps/desktop/shortcuts.cjs').isRegistered('Control+Alt+Shift+Command+9'),true);
      }finally{await run("window.desktopPreferences.setShortcut('')");}
      console.log('Safe mode preserved workspace and preferences, blocked plugin UI, services and jobs, and allowed explicit disable.');
      clearTimeout(timer);app.exit(0);
    }catch(error){console.error(error);app.exit(1);}
  });
});
require('../../apps/desktop/main.cjs').startDesktop();
