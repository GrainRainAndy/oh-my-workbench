const assert=require('node:assert/strict');
const {once}=require('node:events');
const {mkdtempSync,writeFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {app,session}=require('electron');
const {newWorkspace}=require('../../packages/host-core/src/workspace/create.mjs');

async function verify(profile){
  app.setPath('userData',profile);
  await app.whenReady();
  const probe=join(profile,'count-listeners.cjs');
  writeFileSync(probe,`const {contextBridge,ipcRenderer}=require('electron');
    contextBridge.exposeInMainWorld('serviceListenerCount',()=>ipcRenderer.listenerCount('services:invalidated'));`);
  session.defaultSession.registerPreloadScript({type:'frame',filePath:probe});
  const created=once(app,'browser-window-created');
  require('../../apps/desktop/main.cjs').startDesktop();
  const [,win]=await created;
  await once(win.webContents,'did-finish-load');
  const run=expr=>win.webContents.executeJavaScript(expr);
  const blank=newWorkspace('空白'),counter=newWorkspace('计数',{pluginId:'fixture.tally',type:'counter'});
  for(const workspace of [blank,counter])await run('window.workspaces.save('+JSON.stringify(workspace)+')');
  const loaded=once(win.webContents,'did-finish-load');
  win.reload();await loaded;
  async function wait(expr){
    for(let i=0;i<150;i++){if(await run(expr))return;await delay(20);}
    throw Error('Timed out: '+expr);
  }
  await wait("!!document.querySelector('.empty')");
  const baseline=await run('window.serviceListenerCount()');
  for(let i=0;i<100;i++){
    await run("document.querySelector('nav [aria-label=计数]').click()");
    await wait("document.querySelector('.tally-view output')?.textContent==='0' && window.serviceListenerCount()==="+(baseline+1));
    await run("document.querySelector('nav [aria-label=空白]').click()");
    await wait("!!document.querySelector('.empty') && window.serviceListenerCount()==="+baseline);
  }
  assert.equal(await run('window.serviceListenerCount()'),baseline);
  console.log('100 mounted/unmounted counter views. IPC service listener baseline:',baseline);
}
const profile=mkdtempSync(join(tmpdir(),'workbench-subscription-test-'));
app.on('quit',()=>rmSync(profile,{recursive:true,force:true}));
verify(profile).then(()=>app.exit(0),err=>{console.error(err);app.exit(1);});
