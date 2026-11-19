const assert=require('node:assert/strict');
const {once}=require('node:events');
const {mkdirSync,writeFileSync}=require('node:fs');
const {join}=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {app,dialog}=require('electron');

async function verify(){
  const profile=join(process.env.WORKBENCH_E2E_TEMP_DIR,'first-import');
  mkdirSync(profile);app.setPath('userData',profile);
  const file=join(profile,'layout.json');
  const created=once(app,'browser-window-created');
  require('../../apps/desktop/main.cjs').startDesktop();
  const [,win]=await created;await once(win.webContents,'did-finish-load');
  const run=code=>win.webContents.executeJavaScript(code);
  async function until(code){
    for(let i=0;i<100;i++){if(await run(code))return;await delay(25);}
    throw Error(code);
  }
  await until("!!document.querySelector('.welcome button')");
  for(const link of ['.jobs-link','.manage-link']){
    await run(`document.querySelector('${link}').click()`);
    await until("document.querySelector('.return-workspace')?.textContent.includes('返回首页')");
    await run("document.querySelector('.return-workspace').click()");
    await until("document.querySelector('.welcome button')===document.activeElement");
  }
  let picks=0;
  dialog.showOpenDialog=async()=>++picks===1?{canceled:true,filePaths:[]}:{canceled:false,filePaths:[file]};
  const clickImport="Array.from(document.querySelectorAll('.welcome button')).find(b=>b.textContent==='导入布局').click()";
  await run(clickImport);
  await until("!!document.querySelector('.welcome button')");
  assert.deepEqual(await run('window.workspaces.list()'),[]);
  writeFileSync(file,'broken');
  await run(clickImport);
  await until("!!document.querySelector('.import-error')");
  for(const [contents,reason] of [
    ['{}','从工作台导出'],
    [JSON.stringify({format:'workbench.layout',version:2}),'版本不兼容'],
    [Buffer.alloc(5*1024*1024+1),'超过 5 MiB']
  ]){
    writeFileSync(file,contents);
    await run("document.querySelector('.import-error button').click()");
    await until("document.querySelector('.import-error')?.textContent.includes("+JSON.stringify(reason)+")");
    assert.deepEqual(await run('window.workspaces.list()'),[]);
  }
  writeFileSync(file,JSON.stringify({format:'workbench.layout',version:1,workspace:{id:'example',name:'首次导入',schemaVersion:1,revision:0,activePaneId:'p',layout:{type:'leaf',paneId:'p',viewInstanceId:'v'},views:{v:{id:'v',pluginId:'fixture.tally',viewType:'counter',configVersion:1,stateVersion:1,config:{},state:{}}}}}));
  await run("document.querySelector('.import-error button').click()");
  await until("!!document.querySelector('.imported-workspace button')");
  assert.equal(await run("document.querySelector('.imported-workspace button').textContent"),'首次导入');
  assert.equal(await run("performance.getEntriesByType('resource').some(e=>e.name.includes('/assets/view-'))"),false);
  const loaded=once(win.webContents,'did-finish-load');
  win.reload();await loaded;
  await until("!!document.querySelector('.imported-workspace button')");
  assert.equal(await run("performance.getEntriesByType('resource').some(e=>e.name.includes('/assets/view-'))"),false);
  await run("document.querySelector('.imported-workspace button').click()");
  await until("document.querySelector('.tally-view output')?.textContent==='0'");
  await run("document.querySelector('.jobs-link').click()");
  await until("document.querySelector('.return-workspace')?.textContent.includes('返回工作区')");
  await run("document.querySelector('.return-workspace').click()");
  await until("document.activeElement.matches('nav button[aria-current=page]') && !!document.querySelector('.tally-view output')");
}
verify().then(()=>app.quit(),error=>{console.error(error);app.exit(1);});
