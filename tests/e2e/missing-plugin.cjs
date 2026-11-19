const assert=require('node:assert/strict');
const {once}=require('node:events');
const {setTimeout:delay}=require('node:timers/promises');
const {join}=require('node:path');
const {mkdirSync,cpSync,renameSync,readFileSync,writeFileSync}=require('node:fs');
const {app}=require('electron');

async function verify(){
  const phase=process.argv.at(-1);
  const profile=join(process.env.WORKBENCH_E2E_TEMP_DIR,'missing-plugin');
  const root=join(profile,'plugins'),palette=join(root,'fixture-palette'),offline=join(profile,'offline-palette');
  mkdirSync(root,{recursive:true});
  if(phase==='seed'){
    for(const name of ['fixture-tally','fixture-palette'])
      cpSync(join(__dirname,'../../plugins',name),join(root,name),{recursive:true});
  }else if(phase==='missing')renameSync(palette,offline);
  else renameSync(offline,palette);
  app.setPath('userData',profile);
  const created=once(app,'browser-window-created');
  require('../../apps/desktop/main.cjs').startDesktop(root);
  const [,win]=await created;
  await once(win.webContents,'did-finish-load');
  const run=code=>win.webContents.executeJavaScript(code);
  const expected=join(profile,'expected.json');
  if(phase==='seed'){
    const snapshot={id:'both',name:'插件恢复',revision:0,schemaVersion:1,activePaneId:'left',
      layout:{type:'split',axis:'horizontal',ratio:.4,first:{type:'leaf',paneId:'left',viewInstanceId:'a'},second:{type:'leaf',paneId:'right',viewInstanceId:'b'}},
      views:{a:{id:'a',pluginId:'fixture.palette',viewType:'palette',configVersion:1,stateVersion:1,config:{name:'暮色海岸'},state:{selectedIndex:2}},
        b:{id:'b',pluginId:'fixture.tally',viewType:'counter-summary',configVersion:1,stateVersion:1,config:{},state:{}}}};
    const saved=await run('window.workspaces.save('+JSON.stringify(snapshot)+')');
    writeFileSync(expected,JSON.stringify(saved));
    const loaded=once(win.webContents,'did-finish-load');
    win.reload();await loaded;
  }
  const target=phase==='missing'?"document.querySelector('.empty h2')?.textContent==='插件未安装'":"document.querySelector('.selected-color code')?.textContent==='#92afa9'";
  const visible="document.querySelector('.tally-view output')?.textContent==='0' && ("+target+")";
  for(let i=0;i<100&&!await run(visible);i++)await delay(30);
  assert.equal(await run(visible),true);
  assert.equal(await run("!!document.querySelector('.tally-view .plugin')"),false);
  assert.equal(await run("document.querySelector('.tally-view button').textContent"),'刷新');
  if(phase==='missing')assert.equal(await run("document.querySelector('.recovery-detail').textContent"),'fixture.palette · 视图配置与状态已保留');
  if(phase==='missing')assert.equal(await run("!!document.querySelector('.enable-plugin')"),false);
  assert.deepEqual(await run('window.workspaces.list()'),[JSON.parse(readFileSync(expected))]);
}
verify().then(()=>app.quit(),error=>{console.error(error);app.exit(1);});
