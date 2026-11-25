const assert=require('node:assert/strict');
const {once}=require('node:events');
const {mkdtempSync,mkdirSync,renameSync,rmSync,writeFileSync,existsSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {app,dialog,shell}=require('electron');
const {newWorkspace}=require('../../packages/host-core/src/workspace/create.mjs');

async function verify(profile){
  const folder=join(profile,'设计稿');
  mkdirSync(folder);
  const workspace=newWorkspace('验证',{pluginId:'workbench.launcher',type:'launcher'});
  app.setPath('userData',profile);
  const created=once(app,'browser-window-created');
  require('../../apps/desktop/main.cjs').startDesktop();
  const [,win]=await created;
  await once(win.webContents,'did-finish-load');
  const run=expr=>win.webContents.executeJavaScript(expr);
  async function wait(expr){
    for(let i=0;i<150;i++){if(await run(expr))return;await delay(40);}
    throw Error(expr);
  }
  async function reload(){
    const loaded=once(win.webContents,'did-finish-load');
    win.reload();await loaded;await wait("!!document.querySelector('.launcher .wb-add:enabled')");
  }
  const tile=label=>"Array.from(document.querySelectorAll('.launch-tile')).find(b=>b.textContent==="+JSON.stringify(label)+")";
  const native=process.argv.includes('--native-open');
  const nativeChoose=process.argv.includes('--native-choose');
  const bundle=join(profile,'Launcher Probe.app');
  const executable=join(bundle,'Contents','MacOS');
  mkdirSync(executable,{recursive:true});
  writeFileSync(join(bundle,'Contents','Info.plist'),`<?xml version="1.0"?>
    <plist version="1.0"><dict>
    <key>CFBundleIdentifier</key><string>local.workbench.launcher-probe</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleExecutable</key><string>probe</string>
    <key>LSBackgroundOnly</key><true/>
    </dict></plist>`);
  writeFileSync(join(executable,'probe'),'#!/bin/sh\ntouch "$0.started"\n',{mode:0o755});
  const selected=[],opened=[];
  const openNative=shell.openPath.bind(shell);
  const showNative=dialog.showOpenDialog.bind(dialog);
  dialog.showOpenDialog=async(win,options)=>{
    const pick=selected.length?bundle:folder;
    assert.deepEqual(options.properties,[pick===bundle?'openFile':'openDirectory']);
    if(pick===bundle)assert.deepEqual(options.filters[0].extensions,['app']);
    if(nativeChoose){
      console.log('请在系统选择器选择',pick);
      const result=await showNative(win,{...options,defaultPath:profile});
      if(result.canceled)return result;
      assert.equal(result.filePaths[0],pick);
    }
    selected.push(pick);
    return {canceled:false,filePaths:[pick]};
  };
  shell.openPath=async path=>{opened.push(path);return native?openNative(path):'';};
  await run('window.workspaces.save('+JSON.stringify(workspace)+')');
  await reload();
  async function add(kind,label){
    await run("document.querySelector('.launcher .wb-add').click()");
    await wait("!!document.querySelector('.launch-add-dialog[open]')");
    await run("document.querySelectorAll('.launch-kinds input')["+kind+"].click()");
    await wait("document.querySelector('.launch-footer .plugin').textContent.startsWith('选择')");
    await run("document.querySelector('.launch-footer .plugin').click()");
    await wait('!!'+tile(label));
  }
  await add(2,'设计稿');
  await add(1,'Launcher Probe');
  await run("document.querySelector('.pane [aria-label=关闭窗格]').click()");
  await wait("!!document.querySelector('.view-choice[aria-label=快捷入口]:enabled')");
  await run("document.querySelector('.view-choice[aria-label=快捷入口]').click()");
  await wait('!!'+tile('设计稿')+' && !!'+tile('Launcher Probe'));

  await reload();
  await wait(tile('Launcher Probe')+".querySelector('img')?.naturalWidth>0");
  await run(tile('Launcher Probe')+'.click()');
  await wait(tile('Launcher Probe')+'.disabled===false');
  if(native){
    const marker=join(executable,'probe.started');
    for(let i=0;i<100&&!existsSync(marker);i++)await delay(50);
    assert.ok(existsSync(marker),'macOS launched the saved app');
  }
  await run(tile('设计稿')+'.click()');
  await wait(tile('设计稿')+'.disabled===false');
  assert.deepEqual(selected,[folder,bundle]);
  assert.deepEqual(opened,[bundle,folder]);
  assert.equal(await run("!!document.querySelector('.launcher [role=alert]')"),false);
  renameSync(folder,folder+'-旧');mkdirSync(folder);
  await run(tile('设计稿')+'.click()');
  await wait("!!document.querySelector('.launcher [role=alert]')");
  assert.deepEqual(opened,[bundle,folder]);
  await run(tile('设计稿')+".dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))");
  await wait("!!document.querySelector('.launcher .action-menu[open]')");
  await run("Array.from(document.querySelectorAll('.launcher .action-menu button')).find(b=>b.textContent==='从快捷入口移除').click()");
  await wait('!'+tile('设计稿'));
  await reload();
  assert.equal(await run('!!'+tile('设计稿')),false);
}
const profile=mkdtempSync(join(tmpdir(),'workbench-launcher-test-'));
verify(profile).then(()=>app.exit(0),err=>{console.error(err);app.exit(1);});
app.on('quit',()=>rmSync(profile,{recursive:true,force:true}));
