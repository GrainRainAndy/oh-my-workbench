const {app,ipcMain,Menu}=require('electron');
let restartInSafeMode;
const buildMenu=Menu.buildFromTemplate.bind(Menu);
Menu.buildFromTemplate=template=>{
  const restart=template.find(item=>item.label==='以安全模式重新启动');
  if(restart)restartInSafeMode=restart.click;
  return buildMenu(template);
};
const fs=require('node:fs');
const promises=require('node:fs/promises');
const renameFile=promises.rename;
let failExportTo;
promises.rename=async(from,to)=>{
  if(to===failExportTo){failExportTo=null;throw Object.assign(Error('disk full'),{code:'ENOSPC'});}
  return renameFile(from,to);
};
const writeFile=fs.writeFileSync;
let denyPointerWrite=false;
let denySnapshotWrite=false;
fs.writeFileSync=function(path,...args){
  if(denySnapshotWrite&&typeof path==='string'&&path.endsWith('/.preparing')){
    denySnapshotWrite=false;
    throw Object.assign(Error('no space left on device'),{code:'ENOSPC'});
  }
  if(denyPointerWrite && typeof path==='string' && require('node:path').basename(path).startsWith('.active-')){
    denyPointerWrite=false;
    throw Object.assign(Error('no space left on device'),{code:'ENOSPC'});
  }
  return writeFile.call(this,path,...args);
};
// Hold one save acknowledgement so a native close can race a real SQLite write deterministically.
let failDesktopLoad=process.argv.includes('--verify-relaunch');
let failJobList=false;
let holdSave;
let rejectSaveAt=0;
let noSpace=false;
let saveAttempts=0;
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>handle(channel,async(...args)=>{
  if(channel==='workspace:list'&&failDesktopLoad){failDesktopLoad=false;throw Error('Injected startup read failure');}
  if(channel==='jobs:list'&&failJobList){failJobList=false;throw Error('Injected jobs read failure');}
  if(channel!=='workspace:save')return listener(...args);
  saveAttempts++;
  if(noSpace)throw Error('存储空间不足，工作区未保存。请释放空间后重试。');
  if(rejectSaveAt>0 && --rejectSaveAt===0) throw Error("Injected workspace write failure");
  const saved=await listener(...args);
  if(holdSave){holdSave.entered();await holdSave.release;}
  return saved;
});
const {mkdtempSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const assert=require('node:assert/strict');
const dataDir=process.env.WORKBENCH_E2E_TEMP_DIR??mkdtempSync(join(tmpdir(),'workbench-e2e-'));
app.setPath('userData',dataDir);
const deadline=setTimeout(()=>{console.error('Desktop verification timed out');app.exit(1)},20000);
app.once('browser-window-created',(_event,win)=>{
  win.webContents.once('did-finish-load',async()=>{
    const run=async code=>{
      const result=await win.webContents.executeJavaScript(code);
      deadline.refresh();
      return result;
    };
    async function until(expression){
      for(let i=0;i<100;i++){
        if(await run(`(async()=>Boolean(await (${expression})))()`)) return;
        await new Promise(resolve=>setTimeout(resolve,40));
      }
      throw Error('Timed out waiting for '+expression);
    }
    try{
      async function togglePlugin(enabled){
        await run("document.querySelector('.manage-link').click()");
        await until("document.querySelector('[role=switch][aria-label=配色板]:enabled')");
        await run("document.querySelector('[role=switch][aria-label=配色板]').click()");
        await until(`document.querySelector('[role=switch][aria-label=配色板]:enabled')?.getAttribute('aria-checked')==='${enabled}'`);
        await run("document.querySelector('nav button').click()");
      }
      if(process.argv.includes('--verify-relaunch')){
        await until("document.querySelector('.startup [role=alert]')");
        assert.equal(await run("!!document.querySelector('.safe-mode,.welcome,[aria-label=新建工作区]')"),false);
        await run("document.querySelector('.startup button').click()");
        await until("document.querySelector('h1')?.textContent==='最近使用'");
        await until("document.querySelector('.tally-view output')?.textContent==='2'");
        assert.equal(await run("document.querySelectorAll('nav button').length"),2);
        await run("document.querySelectorAll('nav button')[1].focus()");
        win.focus();
        for(const key of ['Up','Enter']){
          win.webContents.sendInputEvent({type:'keyDown',keyCode:key});
          if(key==='Enter')win.webContents.sendInputEvent({type:'char',keyCode:'\r'});
          win.webContents.sendInputEvent({type:'keyUp',keyCode:key});
          if(key==='Up'){
            await until("document.activeElement===document.querySelector('nav button')");
            assert.equal(await run("document.querySelector('h1').textContent"),'最近使用');
          }
        }
        await until("document.querySelector('h1')?.textContent==='我的工作台'");
        assert.equal(await run("document.querySelector('.appearance select').value"),'dark');

        await until("document.querySelectorAll('.empty h2').length===2 && [...document.querySelectorAll('.empty h2')].every(h=>h.textContent==='插件已停用')");
        const disabledSnapshot=await run('window.workspaces.list()');
        assert.equal(await run("document.querySelector('.enable-plugin').textContent"),'启用「配色板」');
        await run("document.querySelector('.enable-plugin').click()");
        await until("document.querySelectorAll('.pane select').length===2");
        assert.deepEqual(await run("Array.from(document.querySelectorAll('.pane select'),s=>s.value)"),['暮色海岸','山间晨雾']);
        await until("document.querySelectorAll('.selected-color').length===1 && document.querySelector('.selected-color code').textContent==='#92afa9'");
        assert.deepEqual(await run('window.workspaces.list()'),disabledSnapshot);
        failJobList=true;
        await run("document.querySelector('.jobs-link').click()");
        await until("document.querySelector('.job-center [role=alert] button')");
        assert.equal(await run("!!document.querySelector('.job-empty')"),false);
        await run("document.querySelector('.job-center [role=alert] button').click()");

        await until("document.querySelector('.job-card [data-status=succeeded]')");
        assert.equal(await run("document.querySelectorAll('.job-card').length"),2);
        assert.deepEqual(await run("Array.from(document.querySelectorAll('.job-owner'),el=>[el.textContent,el.title])"),
          [['配色板','fixture.palette'],['配色板','fixture.palette']]);
        assert.equal(await run("document.querySelector('.job-reason').textContent"),'服务未启用');
        await run("document.querySelector('.manage-link').click()");
        await until("document.querySelector('.backup-card>button')");
        await run("document.querySelector('.backup-card>button').click()");
        await until("document.querySelector('.backup-receipt')");
        denySnapshotWrite=true;
        await run("document.querySelector('.backup-card>button').click()");
        await until("document.querySelector('.backup-card [role=alert]')?.textContent.includes('磁盘空间不足')");
        assert.equal(await run("!!document.querySelector('.backup-receipt')"),false);
        assert.equal(await run("document.querySelector('.backup-history summary').textContent"),'备份记录（1）');
        const backups=join(dataDir,'backups');
        const [id]=require('node:fs').readdirSync(backups);
        const {verifySnapshot}=require('../../packages/host-core/src/persistence/backup.cjs');
        assert.equal(verifySnapshot(join(backups,id)).files.length,3);
        const {DatabaseSync}=require('node:sqlite');
        const savedJobs=new DatabaseSync(join(backups,id,'jobs.sqlite'),{readOnly:true});
        assert.equal(savedJobs.prepare('SELECT count(*) AS n FROM jobs').get().n,2);
        savedJobs.close();
        await run("document.querySelectorAll('nav button')[1].click()");
        await until("document.querySelector('.tally-view output')?.textContent==='2'");
        await run("document.querySelector('.tally-view .plugin').click()");
        await until("document.querySelector('.tally-view output')?.textContent==='3'");

        await run("(async()=>{const [w]=await window.workspaces.list();await window.workspaces.save({...w,name:'恢复前的工作区'});})()");
        await run("document.querySelector('[aria-label=新建工作区]').click()");
        await until("document.querySelector('dialog input')");
        await run(`{const input=document.querySelector('dialog input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'仅在备份之后创建');input.dispatchEvent(new Event('input',{bubbles:true}));}`);
        await run("document.querySelector('dialog form').requestSubmit()");
        await until("document.querySelector('h1')?.textContent==='仅在备份之后创建'");
        await run("document.querySelector('.manage-link').click()");
        await until("document.querySelector('.backup-history summary')");
        await run("document.querySelector('.backup-history summary').click();document.querySelector('.backup-history button').click()");
        const backupFile=join(backups,id,'jobs.sqlite');
        const {readFileSync,appendFileSync,writeFileSync}=require('node:fs');
        const originalBackup=readFileSync(backupFile);
        appendFileSync(backupFile,'damage');
        await run("document.querySelector('.restore-confirm .danger').click()");
        await until("document.querySelector('.backup-card [role=alert]')?.textContent==='备份文件校验失败'");
        assert.equal(await run("document.querySelector('.restore-confirm .danger').disabled"),false);
        writeFileSync(backupFile,originalBackup);
        denyPointerWrite=true;
        await run("document.querySelector('.restore-confirm .danger').click()");
        await until("document.querySelector('.backup-card [role=alert]')?.textContent.includes('可用磁盘空间')");
        assert.deepEqual(fs.readdirSync(join(dataDir,'stores')),[]);
        assert.equal(fs.existsSync(join(dataDir,'active-store.json')),false);
        assert.ok(await run("(async()=>(await window.workspaces.list()).some(w=>w.name==='仅在备份之后创建'))()"));
        const restored=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
        assert.match(await run("document.querySelector('.restore-confirm li').textContent"),/计数器.*恢复数据库/);
        await run("document.querySelector('.restore-confirm .danger').click()");
        await restored;
        await until("document.querySelector('h1')?.textContent==='我的工作台'");
        assert.equal(await run("(async()=>(await window.backups.list()).length)()"),3);
        assert.equal(await run("(async()=>(await window.jobs.list()).length)()"),2);
        const transferPath=join(dataDir,'roundtrip.json');
        const {dialog}=require('electron');
        // Substitute only the file choice. The menu, IPC, disk I/O and import validation run normally.
        const exportMessages=[];
        dialog.showSaveDialog=async(_win,options)=>{exportMessages.push(options.message);return {canceled:false,filePath:transferPath};};
        dialog.showOpenDialog=async()=>({canceled:false,filePaths:[transferPath]});
        await run("document.querySelector('summary').click();Array.from(document.querySelectorAll('.workspace-menu button')).find(b=>b.textContent==='导出布局和视图配置').click()");
        await until("document.querySelector('.transfer-notice')?.textContent.includes('已导出')");
        const fullText=require('node:fs').readFileSync(transferPath,'utf8');
        assert.ok(Object.values(JSON.parse(fullText).workspace.views).some(v=>v.config.name));
        failExportTo=transferPath;
        await run("document.querySelector('summary').click();Array.from(document.querySelectorAll('.workspace-menu button')).find(b=>b.textContent==='仅导出布局').click()");
        await until("document.querySelector('.workspace-error')?.textContent.includes('磁盘空间不足，布局未导出')");
        assert.equal(fs.readFileSync(transferPath,'utf8'),fullText);
        assert.ok(!fs.readdirSync(dataDir).some(name=>name.startsWith('roundtrip.json.')&&name.endsWith('.tmp')));
        await run("document.querySelector('summary').click();Array.from(document.querySelectorAll('.workspace-menu button')).find(b=>b.textContent==='仅导出布局').click()");
        await until("document.querySelector('.transfer-notice')?.textContent.includes('已省略')");
        const structure=JSON.parse(require('node:fs').readFileSync(transferPath,'utf8')).workspace;
        assert.ok(Object.values(structure.views).every(v=>Object.keys(v.config).length===0));
        assert.deepEqual(structure.layout,JSON.parse(fullText).workspace.layout);
        assert.deepEqual(exportMessages,['包含窗格布局和视图配置。','仅包含窗格布局和视图类型。','仅包含窗格布局和视图类型。']);
        for(const exported of [structure,JSON.parse(fullText).workspace])
          assert.ok(Object.values(exported.views).every(v=>Object.keys(v.state).length===0));
        require('node:fs').writeFileSync(transferPath,fullText);
        const current=await run("document.querySelector('nav [aria-current]').textContent");
        const beforeImport=await run('window.workspaces.list()');
        fs.writeFileSync(transferPath,'broken JSON');
        await run("document.querySelector('summary').click();Array.from(document.querySelectorAll('.workspace-menu button')).find(b=>b.textContent==='导入布局').click()");
        await until("document.querySelector('.import-error')?.textContent.includes('有效的 JSON')");
        assert.deepEqual(await run('window.workspaces.list()'),beforeImport);
        fs.renameSync(transferPath,transferPath+'.moved');
        await run("document.querySelector('.import-error button').click()");
        await until("document.querySelector('.import-error')?.textContent.includes('已移动或删除')");
        fs.writeFileSync(transferPath,fullText);
        await run("document.querySelector('.import-error button').click()");
        await until("document.querySelector('.transfer-notice')?.textContent.includes('已导入')");
        assert.equal(await run("document.querySelector('nav [aria-current]').textContent"),current);
        const imported=await run("(async()=>(await window.workspaces.list()).at(-1))()");
        assert.equal(imported.name,'我的工作台');
        assert.equal(Object.keys(imported.views).length,2);
        await run("document.querySelector('.open-import').click()");
        await until(`localStorage.getItem('workbench.recentWorkspace')===${JSON.stringify(imported.id)} && !document.querySelector('.open-import')`);
        await run("document.querySelectorAll('nav button')[1].click()");
        await until("document.querySelector('.tally-view output')?.textContent==='2'");
        console.log('Fresh Electron process restored the original workspace; deleted copy stayed absent.');
        clearTimeout(deadline);app.exit(0);return;
      }
      await until("document.querySelector('.welcome button')");
      await run("document.querySelector('.welcome button').click()");
      await until("document.querySelector('dialog input')");
      await run(`const input=document.querySelector('dialog input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'我的工作台');input.dispatchEvent(new Event('input',{bubbles:true}))`);
      const prevented=new Promise(resolve=>win.webContents.once('will-prevent-unload',resolve));
      win.close();
      await prevented;
      assert.equal(win.isDestroyed(),false);
      await until("document.querySelector('dialog [role=alert]')?.textContent.includes('名称尚未保存')");
      assert.equal(await run("document.querySelector('dialog input').value"),'我的工作台');
      noSpace=true;
      await run("document.querySelector('dialog form').requestSubmit()");
      await until("document.querySelector('dialog [role=alert]')?.textContent==='存储空间不足，工作区未保存。请释放空间后重试。'");
      assert.equal(await run("document.querySelector('dialog input').value"),'我的工作台');
      assert.equal(await run("document.querySelector('dialog input').getAttribute('aria-describedby')"),'workspace-form-error');
      assert.deepEqual(await run('window.workspaces.list()'),[]);
      noSpace=false;
      const entered=Promise.withResolvers(),release=Promise.withResolvers();
      holdSave={entered:entered.resolve,release:release.promise};
      await run("document.querySelector('dialog form').requestSubmit()");
      await entered.promise;
      const savingClose=new Promise(resolve=>win.webContents.once('will-prevent-unload',resolve));
      win.close();
      await savingClose;
      assert.equal(win.isDestroyed(),false);
      holdSave=null;
      release.resolve();
      await until("document.querySelector('.pane')");
      await until("document.querySelector('.plugin:enabled')");
      assert.deepEqual(await run("Array.from(document.querySelectorAll('.view-choice strong'),el=>el.textContent)"),['配色板','计数器']);
      assert.match(await run("document.querySelector('.view-choice small').textContent"),/浏览配色方案/);
      const requests=win.webContents.session.webRequest;
      requests.onBeforeRequest({urls:['file://*/*']},(details,done)=>{
        done({cancel:/\/assets\/view-[^/]+\.js$/.test(details.url)});
      });
      await run("document.querySelector('.plugin').click()");
      await until("document.querySelector('.view-recovery-actions button')");
      requests.onBeforeRequest(null);
      await run("document.querySelector('.view-recovery-actions button').click()");
      await until("document.querySelector('.view-recovery-actions button')?.textContent==='重新载入窗口'");
      const loadedAfterFailure=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
      await run("document.querySelector('.view-recovery-actions button').click()");
      await loadedAfterFailure;
      await until("document.querySelector('.swatches')");
      assert.equal(await run("document.querySelector('.split-action span').getBoundingClientRect().width>0"),true);
      await run("document.querySelector('[aria-label=左右切分]').click()");
      await until("document.querySelector('.plugin:enabled')");
      await run("document.querySelector('.plugin').click()");
      await until("document.querySelectorAll('.swatches').length===2");
      assert.equal(await run("Array.from(document.querySelectorAll('.split-action span')).every(label=>label.getBoundingClientRect().width===0)"),true);
      for(const pane of [0,1]){
        rejectSaveAt=1;
        await run(`{const field=document.querySelectorAll('.pane select')[${pane}];field.selectedIndex=${pane+1};field.dispatchEvent(new Event('change',{bubbles:true}));}`);
        await until(`document.querySelectorAll('.palette [role=alert]').length===${pane+1}`);
      }
      const revisionBeforeRetry=await run("(async()=>(await window.workspaces.list())[0].revision)()");
      await run("document.querySelector('.jobs-link').click()");
      await until("document.querySelectorAll('.draft-dialog p').length===2");
      const draftNames=await run("Array.from(document.querySelectorAll('.draft-dialog p'),p=>p.textContent)");
      assert.deepEqual(draftNames.sort(),['配色方案「暮色海岸」尚未保存。','配色方案「砖红花园」尚未保存。'].sort());
      rejectSaveAt=2;
      await run("document.querySelector('.draft-dialog button.plugin').click()");
      await until("document.querySelector('.draft-dialog [role=alert]') && document.querySelectorAll('.draft-dialog p:not([role=alert])').length===1");
      assert.equal(await run("(async()=>(await window.workspaces.list())[0].revision)()"),revisionBeforeRetry+1);
      await run("document.querySelector('.draft-dialog button.plugin').click()");
      await until("!document.querySelector('.draft-dialog') && !document.querySelector('.pane select')");
      assert.equal(await run("(async()=>(await window.workspaces.list())[0].revision)()"),revisionBeforeRetry+2);
      await run("document.querySelector('nav button').click()");
      await until("document.querySelectorAll('.pane select').length===2");
      await until("(async()=>{const [w]=await window.workspaces.list();return w.views[w.layout.first.viewInstanceId].config.name==='暮色海岸'&&w.views[w.layout.second.viewInstanceId].config.name==='砖红花园'})()");
      await run("{const second=document.querySelectorAll('.pane select')[1];second.selectedIndex=0;second.dispatchEvent(new Event('change',{bubbles:true}));}");
      await until("(async()=>{const [w]=await window.workspaces.list();return w.views[w.layout.second.viewInstanceId].config.name==='山间晨雾'})()");
      await run("document.querySelector('[role=separator]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
      await until("(async()=>(await window.workspaces.list())[0].layout.ratio===0.55)()");
      assert.equal(await run("document.querySelector('.divider').getAttribute('aria-valuetext')"),'左侧 55%，右侧 45%');
      win.focus();
      await run("document.querySelector('.divider').focus()");
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});
      win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});
      await until("(async()=>(await window.workspaces.list())[0].layout.ratio===0.5)()");
      await until("document.querySelector('.divider').getAttribute('aria-valuenow')==='50'");
      assert.equal(await run("document.activeElement.matches('.divider')"),true);
      await run("document.querySelector('[role=separator]').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))");
      await until("(async()=>(await window.workspaces.list())[0].layout.ratio===0.92)()");
      await until("document.querySelector('.divider').getAttribute('aria-valuenow')==='92'");
      const attemptsAtLimit=saveAttempts;
      await run(`(async()=>{
        const handle=document.querySelector('.divider');
        for(const key of ['End','ArrowRight','ArrowUp'])handle.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
        await window.workspaces.list();
      })()`);
      assert.equal(saveAttempts,attemptsAtLimit);
      assert.equal(await run("Math.abs(document.querySelector('.divider').getBoundingClientRect().left-document.querySelector('.pane').getBoundingClientRect().right)<1"),true);
      await run("document.querySelector('[role=separator]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
      await until("(async()=>(await window.workspaces.list())[0].layout.ratio===0.5)()");
      await run("document.querySelectorAll('.swatches')[0].querySelectorAll('button')[2].click()");
      await until("(async()=>{const [w]=await window.workspaces.list();return w.views[w.layout.first.viewInstanceId].state.selectedIndex===2 && Object.keys(w.views[w.layout.second.viewInstanceId].state).length===0})()");
      await until("document.querySelector('.pane[data-active] .selected-color')");
      await run("document.querySelectorAll('.pane-title')[1].click()");
      await until("(async()=>{const [w]=await window.workspaces.list();return w.activePaneId===w.layout.second.paneId})()");
      const manualEntered=Promise.withResolvers(),manualRelease=Promise.withResolvers();
      holdSave={entered:manualEntered.resolve,release:manualRelease.promise};
      const beforeSave=await run("(async()=>(await window.workspaces.list())[0])()");
      win.focus();
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'S',modifiers:['meta']});
      win.webContents.sendInputEvent({type:'keyUp',keyCode:'S',modifiers:['meta']});
      await manualEntered.promise;
      assert.equal(await run("document.querySelector('.workspace-tools .status').textContent"),'正在保存…');
      assert.equal(await run("Boolean(document.querySelector('.transfer-notice')?.textContent.includes('已保存到本机'))"),false);
      holdSave=null;manualRelease.resolve();
      await until("document.querySelector('.transfer-notice')?.textContent.includes('已保存到本机')");
      const afterSave=await run("(async()=>(await window.workspaces.list())[0])()");
      assert.deepEqual(afterSave,{...beforeSave,revision:beforeSave.revision+1});
      noSpace=true;
      await run("document.querySelector('.divider').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))");
      await until("document.querySelector('.workspace-error button')?.textContent==='重试保存布局'");
      assert.deepEqual(await run("(async()=>(await window.workspaces.list())[0])()"),afterSave);
      noSpace=false;
      await run("document.querySelector('.workspace-error button').click()");
      await until("(async()=>(await window.workspaces.list())[0].layout.ratio===0.45)()");
      assert.equal(await run("(async()=>(await window.workspaces.list())[0].revision)()"),afterSave.revision+1);
      const beforeCrash=await run("window.workspaces.list()");
      const nativeDialog=require('electron').dialog;
      const originalMessageBox=nativeDialog.showMessageBox;
      let prompted=false;
      nativeDialog.showMessageBox=async(parent,options)=>{
        assert.equal(parent,win);
        assert.equal(options.buttons[0],'恢复窗口');
        prompted=true;
        return {response:0};
      };
      const rendererRecovered=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
      win.webContents.forcefullyCrashRenderer();
      await rendererRecovered;
      nativeDialog.showMessageBox=originalMessageBox;
      assert.equal(prompted,true);
      await until("document.querySelectorAll('.pane select').length===2");
      assert.equal(await run("document.querySelectorAll('.pane-title')[1].getAttribute('aria-pressed')"),'true');
      assert.deepEqual(await run("window.workspaces.list()"),beforeCrash);
      assert.equal(await run("document.querySelector('.selected-color code').textContent"),'#92afa9');
      const ready=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
      win.reload();await ready;
      await until("document.querySelectorAll('.pane select').length===2");
      assert.deepEqual(await run("Array.from(document.querySelectorAll('.pane select'),s=>s.value)"),['暮色海岸','山间晨雾']);
      const paletteFile=join(dataDir,'palette.txt');
      fs.writeFileSync(paletteFile,'#123456\n#abcdef');
      const originalPicker=nativeDialog.showOpenDialog;
      nativeDialog.showOpenDialog=async(_window,options)=>{
        assert.match(options.message,/fixture\.css/);
        return {canceled:false,filePaths:[paletteFile]};
      };
      fs.chmodSync(paletteFile,0o000);
      try{
        await run("Array.from(document.querySelectorAll('.palette-footer button')).find(b=>b.textContent==='从文件生成 CSS').click()");
        await until("document.querySelector('.palette [role=alert]')?.textContent.includes('没有权限读取所选文件')");
      }finally{fs.chmodSync(paletteFile,0o600);}
      await run("Array.from(document.querySelectorAll('.palette-footer button')).find(b=>b.textContent==='从文件生成 CSS').click()");
      await until("document.querySelector('.css-result')?.textContent.includes('--color-2: #abcdef')");
      // Intercept only the clipboard write so the test preserves the user's pasteboard.
      await run("Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async text=>{window.testCopiedCss=text}});document.querySelector('.palette-result button').click()");
      await until("document.querySelector('.palette-result [role=status]')?.textContent==='已复制'");
      assert.equal(await run("window.testCopiedCss"),await run("document.querySelector('.css-result').textContent"));
      await run("Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw Error('denied')}});document.querySelector('.palette-result button').click()");
      await until("document.querySelector('.palette-result [role=status]')?.textContent.includes('复制失败')");
      await run("delete navigator.clipboard.writeText;delete window.testCopiedCss");
      nativeDialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});
      assert.equal(await run("(async()=>{const [w]=await window.workspaces.list();return window.viewServices.selectFile({workspaceId:w.id,viewId:w.layout.first.viewInstanceId,service:'workbench.palette.css',version:'1.0.0',method:'fromFile',input:''})})()"),null);
      nativeDialog.showOpenDialog=originalPicker;
      await run("document.querySelector('.css-export').click()");
      await until("document.querySelector('.css-result')?.textContent.includes('--color-1: #293748')");
      await run("document.querySelectorAll('.css-export')[1].click()");
      await until("document.querySelectorAll('.css-result').length===2");
      const snapshotBeforeZoom=await run("window.workspaces.list()");
      const widths=await run("Array.from(document.querySelectorAll('.pane'),p=>p.offsetWidth)");
      await run("document.querySelectorAll('.zoom-pane')[1].click()");
      await until("document.querySelectorAll('.pane')[0].offsetWidth===0");
      assert.ok(await run("document.querySelector('.pane[data-maximized]').offsetWidth")>widths[1]);
      assert.equal(await run("document.querySelectorAll('.css-result').length"),2);
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
      win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
      await until("!document.querySelector('.pane[data-maximized]')");
      assert.deepEqual(await run("Array.from(document.querySelectorAll('.pane'),p=>p.offsetWidth)"),widths);
      assert.deepEqual(await run("window.workspaces.list()"),snapshotBeforeZoom);
      async function swapPanes(){
        await run("document.querySelector('[aria-label=窗格操作]').click()");
        await until("document.querySelector('.swap-pane')");
        assert.equal(await run("document.querySelector('.swap-origin').disabled"),true);
        assert.equal(await run("document.querySelector('.swap-pane').getBoundingClientRect().left>document.querySelector('.swap-origin').getBoundingClientRect().left"),true);
        await run("document.querySelector('.swap-pane').click()");
      }
      await swapPanes();
      await until("document.querySelector('.pane select')?.value==='山间晨雾'");
      await swapPanes();
      await until("document.querySelector('.pane select')?.value==='暮色海岸'");
      const afterSwap=await run("window.workspaces.list()");
      assert.deepEqual(afterSwap[0].views,snapshotBeforeZoom[0].views);
      assert.deepEqual(afterSwap[0].layout,snapshotBeforeZoom[0].layout);
      const workers=()=>app.getAppMetrics().filter(p=>p.name==='Workbench fixture.css');
      assert.equal(workers().length,1);
      const firstPid=workers()[0].pid;
      async function toggleCss(enabled){
        await run("document.querySelector('.manage-link').click()");
        await run("document.querySelector('[role=switch][aria-label^=CSS]').click()");
        await until(`document.querySelector('[role=switch][aria-label^=CSS]')?.getAttribute('aria-checked')==='${enabled}'`);
        await run("document.querySelector('nav button').click()");
        await until("document.querySelector('.css-export')");
      }
      await toggleCss(false);
      await run("document.querySelector('.css-export').click()");
      await until("document.querySelector('.palette [role=alert]')");
      await run("document.querySelector('.job-export').click();document.querySelector('.jobs-link').click()");
      await until("document.querySelector('.job-reason')?.textContent==='服务未启用'");
      await run("document.querySelector('nav button').click()");
      await toggleCss(true);
      await run("document.querySelector('.css-export').click()");
      await until("document.querySelector('.css-result')");
      assert.ok(workers().some(p=>p.pid!==firstPid));
      await run("document.querySelector('.job-export').click();document.querySelector('.jobs-link').click()");
      await until("document.querySelector('.job-card [data-status=succeeded]')");
      assert.ok(await run("document.querySelector('.job-card pre').textContent.includes('--color-1: #293748')"));
      await run("document.querySelector('nav button').click()");
      await until("document.querySelector('.css-export')");
      async function appearance(value){
        await run(`{const picker=document.querySelector('.appearance select');picker.value='${value}';picker.dispatchEvent(new Event('change',{bubbles:true}));}`);
        await until(`getComputedStyle(document.documentElement).colorScheme==='${value}'`);
      }
      await appearance('light');
      const light=await run("getComputedStyle(document.querySelector('.pane')).backgroundColor");
      await appearance('dark');
      assert.notEqual(await run("getComputedStyle(document.querySelector('.pane')).backgroundColor"),light);
      assert.equal(await run("document.querySelectorAll('.pane select').length"),2);
      let screenshot;
      for(let attempt=0;attempt<3;attempt++){
        try{screenshot=await win.webContents.capturePage();break;}
        catch(error){
          if(!String(error).includes('UnknownVizError')||attempt===2)throw error;
          win.webContents.invalidate();
          await new Promise(resolve=>setTimeout(resolve,150));
        }
      }
      require('node:fs').writeFileSync(join(tmpdir(),'workbench-shell-preview.png'),screenshot.toPNG());
      const menu=async label=>{
        await run(`document.querySelector('summary').click();Array.from(document.querySelectorAll('.workspace-menu button')).find(b=>b.textContent===${JSON.stringify(label)}).click()`);
        await until("document.querySelector('dialog[open]')");
      };
      await menu('复制工作区');
      assert.equal(await run("document.querySelector('dialog .plugin').textContent"),'创建副本');
      assert.match(await run("document.querySelector('#duplicate-details').textContent"),/共用插件数据/);
      await run("document.querySelector('dialog form').requestSubmit()");
      await until("document.querySelectorAll('nav button').length===2");
      assert.equal(await run("document.querySelector('h1').textContent"),'我的工作台 副本');
      const beforeReplace=await run("(async()=>(await window.workspaces.list()).find(w=>w.name.endsWith('副本')))()");
      await run("document.querySelector('[aria-label=窗格操作]').click()");
      await until("document.querySelector('.option-row')");
      await run("document.querySelector('.option-row').click()");
      await until("document.querySelectorAll('.pane select').length===2 && document.querySelector('.pane select').value==='山间晨雾'");
      const afterReplace=await run("(async()=>(await window.workspaces.list()).find(w=>w.name.endsWith('副本')))()");
      assert.equal(afterReplace.layout.first.paneId,beforeReplace.layout.first.paneId);
      assert.notEqual(afterReplace.layout.first.viewInstanceId,beforeReplace.layout.first.viewInstanceId);
      assert.deepEqual(afterReplace.layout.second,beforeReplace.layout.second);
      const preserved=await run(`(async()=>{
        const w=(await window.workspaces.list()).find(item=>item.name.endsWith('副本'));
        const id=w.layout.first.viewInstanceId;
        w.views[id]={...w.views[id],configVersion:3,stateVersion:2,config:{futureField:'保留'},state:{cursor:[1,2]}};
        return window.workspaces.save(w);
      })()`);
      await run("{const field=document.querySelector('.pane select');field.selectedIndex=1;field.dispatchEvent(new Event('change',{bubbles:true}));}");
      await until("document.querySelector('.palette [role=alert]')?.textContent.includes('保存失败')");
      assert.equal(await run("document.querySelector('.pane select').value"),'山间晨雾');
      for(const action of ['close','replace']){
        if(action==='close')await run("document.querySelector('[aria-label=关闭窗格]').click()");
        else{
          await run("document.querySelector('[aria-label=窗格操作]').click()");
          await until("document.querySelector('.option-row')");
          await run("document.querySelector('.option-row').click()");
        }
        await until("document.querySelector('.draft-dialog[open]')");
        await run("document.querySelector('.draft-dialog button').click()");
        await until("!document.querySelector('.draft-dialog') && !!document.querySelector('.palette [role=alert]')");
        assert.equal(await run("document.querySelectorAll('.pane').length"),2);
      }
      for(const label of ['新建工作区','复制工作区','删除工作区']){
        if(label==='新建工作区'){
          await run("document.querySelector('.sidehead button').click()");
          await until("document.querySelector('dialog input')");
          await run("{const input=document.querySelector('dialog input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'测试草稿');input.dispatchEvent(new Event('input',{bubbles:true}));}");
        }else await menu(label);
        await run("document.querySelector('dialog form').requestSubmit()");
        await until("document.querySelector('.draft-dialog[open]')");
        await run("document.querySelector('.draft-dialog button').click()");
        await until("!document.querySelector('.draft-dialog') && !!document.querySelector('dialog[open] form')");
        await run("document.querySelector('dialog form button[type=button]').click()");
        assert.equal(await run("document.querySelectorAll('nav button').length"),2);
        assert.equal(await run("Boolean(document.querySelector('.palette [role=alert]'))"),true);
      }
      const draftBlocked=new Promise(resolve=>win.webContents.once('will-prevent-unload',resolve));
      assert.equal(typeof restartInSafeMode,'function');
      restartInSafeMode();await draftBlocked;
      assert.equal(win.isDestroyed(),false);
      await until("document.querySelector('.transfer-notice')?.textContent.includes('配色方案「暮色海岸」尚未保存')");
      await run("document.querySelector('.jobs-link').click()");
      await until("document.querySelector('.draft-dialog[open]')");
      await run("document.querySelector('.draft-dialog button').click()");
      await until("!document.querySelector('.draft-dialog') && !!document.querySelector('.palette [role=alert]')");
      const pageStart=await run("performance.timeOrigin");
      await run("document.querySelector('.workspace-error button').click()");
      await until("document.querySelector('.draft-dialog[open]')");
      await run("document.querySelector('.draft-dialog .plugin').click()");
      await until("document.querySelector('.draft-dialog [role=alert]')");
      await run("Array.from(document.querySelectorAll('.draft-dialog button')).find(b=>b.textContent==='放弃并继续').click()");
      await until("document.querySelector('.transfer-notice')?.textContent.includes('已载入')");
      assert.equal(await run("performance.timeOrigin"),pageStart);
      await until("document.querySelector('.empty h2')?.textContent==='视图版本不兼容'&&document.querySelectorAll('.swatches').length===1");
      const recovered=await run("(async()=>(await window.workspaces.list()).find(item=>item.name.endsWith('副本')))()");
      assert.deepEqual(recovered,preserved);
      await run("document.querySelector('[aria-label=窗格操作]').click()");
      await until("document.querySelector('.option-row')");
      await run("Array.from(document.querySelectorAll('.option-row')).find(b=>b.textContent==='计数器').click()");
      await until("document.querySelector('.tally-view output')?.textContent==='0'");
      await run("document.querySelector('.tally-view .plugin').click()");
      await until("document.querySelector('.tally-view output')?.textContent==='1'");
      await menu('删除工作区');
      assert.equal(await run("document.activeElement.textContent"),'取消');
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});
      win.webContents.sendInputEvent({type:'char',keyCode:'\r'});
      win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
      await until("!document.querySelector('dialog[open]')");
      assert.equal(await run("document.querySelectorAll('nav button').length"),2);
      await menu('删除工作区');
      await run("document.querySelector('.danger').click()");
      await until("document.querySelectorAll('nav button').length===1");
      assert.equal(await run("document.querySelector('h1').textContent"),'我的工作台');
      const beforeDisable=await run("window.workspaces.list()");
      await togglePlugin(false);
      await until("document.querySelectorAll('.empty h2').length===2");
      assert.deepEqual(await run("window.workspaces.list()"),beforeDisable);
      await run("document.querySelector('[aria-label=新建工作区]').click()");
      await until("document.querySelector('dialog input')");
      await run(`{const field=document.querySelector('dialog input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'最近使用');field.dispatchEvent(new Event('input',{bubbles:true}));}`);
      await run("document.querySelector('dialog form').requestSubmit()");
      await until("document.querySelector('h1')?.textContent==='最近使用'");
      await run("Array.from(document.querySelectorAll('.empty .plugin')).find(b=>b.textContent.includes('计数器')).click()");
      await until("document.querySelector('.tally-view output')?.textContent==='1'");
      await run("document.querySelector('[aria-label=左右切分]').click()");
      await until("document.querySelector('.empty .plugin:enabled')");
      await run("Array.from(document.querySelectorAll('.empty .plugin')).find(b=>b.textContent.includes('计数器')).click()");
      await until("[...document.querySelectorAll('.tally-view output')].filter(o=>o.textContent==='1').length===2");
      await run("document.querySelector('.tally-view .plugin').click()");
      await until("[...document.querySelectorAll('.tally-view output')].filter(o=>o.textContent==='2').length===2");
      await run("document.querySelectorAll('[aria-label=关闭窗格]')[1].click()");
      await until("document.querySelectorAll('.tally-view').length===1");
      const savedTallyView=await run("(async()=>Object.values((await window.workspaces.list()).find(w=>w.name==='最近使用').views)[0])()");
      assert.deepEqual(savedTallyView.config,{});
      assert.deepEqual(savedTallyView.state,{});
      console.log('Two independent plugin views restored after renderer reload.');
      app.relaunch=()=>{throw Error('A cancelled safe-mode restart leaked into a later quit');};
      clearTimeout(deadline);app.quit();
    }catch(e){console.error(e);app.exit(1);}
  });
});
require('../../apps/desktop/main.cjs').startDesktop();
