const assert=require('node:assert/strict');
const {once}=require('node:events');
const {mkdir,writeFile,readFile}=require('node:fs/promises');
const {setTimeout:delay}=require('node:timers/promises');
const {join}=require('node:path');
const {app,BrowserWindow}=require('electron');

async function verify(){
  app.setPath('userData',join(process.env.WORKBENCH_E2E_TEMP_DIR,'login-startup'));
  let checked;
  const startupChecked=new Promise(resolve=>{checked=resolve;});
  const readSettings=app.getLoginItemSettings.bind(app);
  // Supply only the launch reason; window lifecycle and plugin startup run normally.
  app.getLoginItemSettings=(...args)=>{
    const result=readSettings(...args);
    checked();
    return {...result,wasOpenedAtLogin:true};
  };
  const windows=[];
  app.on('browser-window-created',(_event,window)=>windows.push(window));
  const root=join(app.getPath('userData'),'fixtures'),directory=join(root,'resident');
  const marker=join(directory,'activated'),disposed=join(directory,'disposed');
  await mkdir(directory,{recursive:true});
  await writeFile(join(directory,'manifest.json'),JSON.stringify({id:'fixture.resident',name:'启动验证',views:[],description:'验证静默启动',backgroundMode:'resident',activationEvents:['onAppStart']}));
  await writeFile(join(directory,'backend.mjs'),`import {writeFile} from 'node:fs/promises';export async function activate(){await writeFile(${JSON.stringify(marker)},String(process.pid));return async()=>{await new Promise(resolve=>setTimeout(resolve,500));await writeFile(${JSON.stringify(disposed)},String(process.pid));};}`);
  require('../../apps/desktop/main.cjs').startDesktop(root);
  await startupChecked;
  let pid;
  for(let i=0;i<100&&!pid;i++){
    pid=await readFile(marker,'utf8').catch(()=>null);
    if(!pid)await delay(50);
  }
  assert.ok(Number(pid)>0&&Number(pid)!==process.pid);
  assert.equal(windows.length,0);
  assert.equal(BrowserWindow.getAllWindows().length,0);
  const created=once(app,'browser-window-created');
  app.emit('activate');
  const [,window]=await created;
  await once(window.webContents,'did-finish-load');
  assert.equal(windows.length,1);
  assert.equal(window.isVisible(),true);
  const run=code=>window.webContents.executeJavaScript(code);
  assert.deepEqual(await run('window.workspaces.list()'),[]);
  async function until(check){
    for(let attempt=0;attempt<100;attempt++){
      if(await check())return;
      await delay(50);
    }
    assert.fail('等待插件管理状态变化超时');
  }
  await until(()=>run("!!document.querySelector('.manage-link')"));
  await run("document.querySelector('.manage-link').click()");
  const toggle="document.querySelector('[role=switch][aria-label=启动验证]')";
  await until(()=>run('!!'+toggle));
  const description=await run(toggle+".getAttribute('aria-describedby').split(' ').map(id=>document.getElementById(id).textContent).join(' ')");
  assert.match(description,/验证静默启动.*常驻后台.*关闭窗口/);
  if(process.env.WORKBENCH_MANAGER_SCREENSHOT){
    const screenshot=await window.webContents.capturePage();
    await writeFile(process.env.WORKBENCH_MANAGER_SCREENSHOT,screenshot.toPNG());
  }
  await run(toggle+'.click()');
  await until(()=>run("document.querySelector('.plugin-info [role=status]')?.textContent==='正在停用「启动验证」…'"));
  assert.equal(await run(toggle+".disabled"),true);
  await until(()=>run(toggle+".getAttribute('aria-checked')==='false'"));
  assert.equal(await run("!!document.querySelector('.plugin-info [role=status]')"),false);
  await until(()=>{
    try{process.kill(Number(pid),0);return false;}
    catch(error){if(error.code==='ESRCH')return true;throw error;}
  });
  assert.equal(await readFile(disposed,'utf8'),pid);
  const backend=join(directory,'backend.mjs');
  const working=await readFile(backend);
  await writeFile(backend,"export function activate(){throw Error('private-test-detail')}");
  await run(toggle+'.click()');
  await until(()=>run("document.querySelector('.manager-issues')?.textContent.includes('后台启动失败')"));
  assert.equal(await run("document.body.textContent.includes('private-test-detail')"),false);
  await run(toggle+'.click()');
  await until(()=>run("!document.querySelector('.manager-issues')"));
  await writeFile(backend,working);
  await run(toggle+'.click()');
  await until(async()=>{
    const current=await readFile(marker,'utf8');
    return Number(current)>0&&current!==pid;
  });
  await run("window.plugins.setEnabled('fixture.resident',false)");
  const previousPid=await readFile(marker,'utf8');
  const cleaning=join(directory,'cleanup-started');
  await writeFile(backend,`import {writeFile} from 'node:fs/promises';
    export async function activate(){
      await writeFile(${JSON.stringify(marker)},String(process.pid));
      return async()=>{
        await writeFile(${JSON.stringify(cleaning)},String(process.pid));
        await new Promise(()=>{});
      };
    }`);
  await run("window.plugins.setEnabled('fixture.resident',true)");
  await until(async()=>{const value=await readFile(marker,'utf8');return Number(value)>0&&value!==previousPid;});
  const stuckPid=await readFile(marker,'utf8');
  await writeFile(backend,working);
  const began=performance.now();
  const states=await run(`Promise.all([false,true].map(enabled=>
    window.plugins.setEnabled('fixture.resident',enabled).then(list=>list.find(p=>p.id==='fixture.resident').enabled)))`);
  assert.deepEqual(states,[false,true]);
  assert.ok(performance.now()-began>=4950);
  assert.equal(await readFile(cleaning,'utf8'),stuckPid);
  assert.throws(()=>process.kill(Number(stuckPid),0),{code:'ESRCH'});
  await until(async()=>{const value=await readFile(marker,'utf8');return Number(value)>0&&value!==stuckPid;});
  assert.deepEqual(await run('window.workspaces.list()'),[]);
}
verify().then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
