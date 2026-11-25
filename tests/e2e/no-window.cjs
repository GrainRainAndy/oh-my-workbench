const {setTimeout:delay}=require("node:timers/promises");
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {createServer}=require('node:http');
const {join}=require('node:path');
const {mkdirSync,copyFileSync,writeFileSync,readFileSync}=require('node:fs');
const {app,BrowserWindow,dialog,ipcMain,powerMonitor}=require('electron');
const nativeSleep=process.argv.includes('--native-sleep');
const simulateSleep=process.argv.includes('--simulate-sleep-cycle');
const register=ipcMain.handle.bind(ipcMain);
let cancelCalls=0,staleProgress=false;
ipcMain.handle=(channel,listener)=>register(channel,channel==='jobs:cancel'?async(...args)=>{
  if(++cancelCalls===1)throw Error('Injected cancellation delivery failure');
  return listener(...args);
}:channel==='jobs:list'?async(...args)=>{
  const records=await listener(...args);
  return staleProgress?records.map(job=>job.status==='running'?{...job,progress:10}:job):records;
}:listener);

async function verify(){
  const fileMode=process.argv.includes('--file-job');
  const profile=join(process.env.WORKBENCH_E2E_TEMP_DIR,fileMode?'no-window-file':'no-window');
  mkdirSync(profile);
  app.setPath('userData',profile);
  const root=join(profile,'plugins');
  for(const name of ['fixture-palette','fixture-css']){
    const target=join(root,name);
    mkdirSync(target,{recursive:true});
    copyFileSync(join(__dirname,'../../plugins',name,'manifest.json'),join(target,'manifest.json'));
  }
  mkdirSync(join(root,'damaged'));
  writeFileSync(join(root,'damaged','manifest.json'),'{broken');
  const manifestPath=join(root,'fixture-palette','manifest.json');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  manifest.views[0].title='运行时配色视图';
  manifest.usesServices[0].provider='fixture.css';
  manifest.usesServices[0].optional=false;
  const alternative=join(root,'alternative');
  mkdirSync(alternative);
  const css=JSON.parse(readFileSync(join(root,'fixture-css','manifest.json'),'utf8'));
  writeFileSync(join(alternative,'manifest.json'),JSON.stringify({...css,id:'fixture.alternative',name:'备用提供者'}));
  writeFileSync(join(alternative,'backend.mjs'),'export function call(){return "incorrect provider";}');
  if(fileMode)manifest.jobs[0].timeoutMs=30000;
  manifest.jobs.push({...manifest.jobs[0],type:'cancel-test',cancellable:true});
  writeFileSync(manifestPath,JSON.stringify(manifest));
  let accepted=0;
  const server=createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const endpoint='http://127.0.0.1:'+server.address().port;
  writeFileSync(join(root,'fixture-css','backend.mjs'),
    `export async function call(service,method,input,context){
      if(input[0]==='wait'){
        context.reportProgress(40);
        await fetch(${JSON.stringify(endpoint)}+'/started');
        if(!context.signal.aborted)await new Promise(resolve=>context.signal.addEventListener('abort',resolve,{once:true}));
        await fetch(${JSON.stringify(endpoint)}+'/confirm');
        context.confirmCancelled();
      }
      if(input[0]==='#123456')context.reportProgress(25);
      if(input[0]==='#fedcba')context.reportProgress(65);
      const response=await (await fetch(${JSON.stringify(endpoint)})).text();
      if(context.readSelectedFile)return Buffer.from(await context.readSelectedFile()).toString('hex');
      return response;
    }`);
  function nextWindow(){
    return new Promise(resolve=>app.once('browser-window-created',(_,win)=>{
      win.webContents.once('did-finish-load',()=>resolve(win));
    }));
  }
  const first=nextWindow();
  require('../../apps/desktop/main.cjs').startDesktop(root);
  const win=await first;
  const run=code=>win.webContents.executeJavaScript(code);
  server.on('request',()=>accepted++);
  assert.deepEqual(await run("window.plugins.issues()"),[{folder:'damaged',reason:'插件清单或入口无效'}]);
  await run(`window.workspaces.save({schemaVersion:1,id:'test',revision:0,name:'无窗任务',activePaneId:'p',
    layout:{type:'leaf',paneId:'p',viewInstanceId:'v'},views:{v:{id:'v',pluginId:'fixture.palette',viewType:'palette',configVersion:1,stateVersion:1,config:{},state:{}}}})`);
  const submission=`window.jobs.${fileMode?'submitFile':'submit'}({workspaceId:'test',viewId:'v',type:'export-css',key:'once',input:['#123456']})`;
  if(fileMode){
    const selected=join(profile,'sample.bin');
    dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});
    assert.equal(await run(submission),null);
    writeFileSync(selected,Buffer.alloc(1024*1024+1));
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[selected]});
    await assert.rejects(run(submission),/超过大小限制/);
    assert.deepEqual(await run('window.jobs.list()'),[]);
    assert.equal(accepted,0);
    writeFileSync(selected,Buffer.from([0,128,255]));
  }
  const request=once(server,'request');
  const job=await run(submission);
  const [,response]=await request;
  assert.equal(job.status,'running');
  const closed=once(win,'closed');win.close();await closed;
  assert.equal(BrowserWindow.getAllWindows().length,0);
  const {DatabaseSync}=require('node:sqlite');
  const db=new DatabaseSync(join(profile,'jobs.sqlite'),{readOnly:true});
  const read=db.prepare('SELECT status FROM jobs WHERE id=?');
  const readProgress=db.prepare('SELECT percent FROM job_progress WHERE jobId=?');
  for(let i=0;i<100&&!readProgress.get(job.id);i++)await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(readProgress.get(job.id)?.percent,25);
  let windowsOpened=0;
  const onWindow=()=>{windowsOpened++;};
  app.on('browser-window-created',onWindow);
  if(!nativeSleep&&!simulateSleep)powerMonitor.emit('resume');
  assert.equal(read.get(job.id).status,'running');
  assert.equal(readProgress.get(job.id).percent,25);
  if(fileMode)await delay(11000);
  response.end('completed-without-window');
  const deadline=Date.now()+4000;
  while(read.get(job.id).status==='running'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(read.get(job.id).status,'succeeded');
  assert.equal(BrowserWindow.getAllWindows().length,0);
  if(fileMode){
    const stored=db.prepare('SELECT input,result FROM jobs WHERE id=?').get(job.id);
    assert.equal(stored.result,'0080ff');
    assert.equal(stored.input,JSON.stringify(['#123456']));
    db.close();server.close();
    console.log('Selected bytes read by utility process after last window closed.');
    return;
  }
  if(nativeSleep||simulateSleep){
    const cycle=new Promise(resolve=>powerMonitor.once('suspend',()=>{
      const suspendedAt=new Date().toISOString();
      powerMonitor.once('resume',()=>resolve(suspendedAt));
    }));
    if(simulateSleep){
      powerMonitor.emit('suspend');
      powerMonitor.emit('resume');
    }else console.log('任务已在无窗状态完成。现在可以手动让 Mac 睡眠，再将其唤醒。');
    const suspendedAt=await cycle;
    console.log(JSON.stringify({suspendedAt,resumedAt:new Date().toISOString()}));
    assert.equal(read.get(job.id).status,'succeeded');
    assert.equal(readProgress.get(job.id).percent,25);
  }
  assert.equal(windowsOpened,0);
  app.removeListener('browser-window-created',onWindow);
  db.close();
  const reopened=nextWindow();
  app.emit('activate');
  const second=await reopened;
  for(let i=0;i<100;i++){
    if(await second.webContents.executeJavaScript("document.querySelector('.pane-title')?.textContent==='运行时配色视图' && !!document.querySelector('.swatches')"))break;
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  assert.equal(await second.webContents.executeJavaScript("document.querySelector('.pane-title')?.textContent"),'运行时配色视图');
  const records=await second.webContents.executeJavaScript('window.jobs.list()');
  assert.equal(records.length,1);
  assert.equal(records[0].progress,25);
  assert.equal(records[0].result,'completed-without-window');
  assert.equal(accepted,1);
  if(nativeSleep||simulateSleep){
    server.close();
    console.log(nativeSleep?'真实系统睡眠唤醒通过':'注入的连续 suspend/resume 事件通过');
    return;
  }
  await second.webContents.executeJavaScript("document.querySelector('.jobs-link').click()");
  const finishedCard=".job-group[aria-label=已结束] .job-card";
  for(let i=0;i<100&&!await second.webContents.executeJavaScript(`Boolean(document.querySelector('${finishedCard}'))`);i++)await new Promise(resolve=>setTimeout(resolve,30));
  const visible=await second.webContents.executeJavaScript(`(()=>{
    const card=document.querySelector('${finishedCard}');
    card.querySelector('summary').click();
    return [card.querySelector('time').dateTime,card.querySelector('details[open] pre').textContent];
  })()`);
  assert.deepEqual(visible,[new Date(records[0].updatedAt).toISOString(),'completed-without-window']);
  const exported=join(profile,'任务结果.txt');
  const saveDialog=dialog.showSaveDialog;
  dialog.showSaveDialog=async()=>({canceled:false,filePath:exported});
  try{
    await second.webContents.executeJavaScript("document.querySelector('.export-job-result').click()");
    for(let i=0;i<100&&!await second.webContents.executeJavaScript("document.querySelector('.job-card details [role=status]')?.textContent==='已导出'");i++)await delay(30);
    assert.equal(readFileSync(exported,'utf8'),'completed-without-window');
  }finally{dialog.showSaveDialog=saveDialog;}
  await second.webContents.executeJavaScript("document.querySelector('nav button').click()");
  for(let i=0;i<100&&!await second.webContents.executeJavaScript("!!document.querySelector('.palette select')");i++)await new Promise(resolve=>setTimeout(resolve,30));
  const started=once(server,'request');
  await second.webContents.executeJavaScript("window.jobs.submit({workspaceId:'test',viewId:'v',type:'cancel-test',key:'cancel-once',input:['wait']})");
  const [,ack]=await started;ack.end();
  const waitFor=async expression=>{
    for(let i=0;i<100;i++){
      if(await second.webContents.executeJavaScript('Boolean('+expression+')'))return;
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    throw Error('Missing job UI state: '+expression);
  };
  const runSecond=code=>second.webContents.executeJavaScript(code);
  await runSecond("(async()=>{const [workspace]=await window.workspaces.list();return window.workspaces.save(workspace);})()");
  await runSecond("{const field=document.querySelector('.palette select');field.selectedIndex=1;field.dispatchEvent(new Event('change',{bubbles:true}));}");
  await waitFor("document.querySelector('.palette [role=alert]')");
  const nativePrompt=dialog.showMessageBox;
  let promptCount=0;
  try{
    dialog.showMessageBox=async options=>{
      assert.equal(options.message,'仍有后台任务正在执行');
      return {response:++promptCount===1?1:0};
    };
    const veto=once(second.webContents,'will-prevent-unload');
    app.quit();
    await veto;
    assert.equal(second.isDestroyed(),false);
    await waitFor("document.querySelector('.transfer-notice')?.textContent.includes('尚未保存')");
    app.quit();
    assert.equal(promptCount,2);
    await waitFor("document.querySelector('.palette [role=alert]')");
    assert.equal((await runSecond('window.jobs.list()')).find(item=>item.id!==job.id).status,'running');
  }finally{dialog.showMessageBox=nativePrompt;}
  await runSecond("Array.from(document.querySelectorAll('.palette button')).find(b=>b.textContent==='放弃更改').click()");
  staleProgress=true;
  await second.webContents.executeJavaScript("document.querySelector('.jobs-link').click()");
  await waitFor("document.querySelector('progress')?.value===10");
  const acceptedBeforeResume=accepted;
  staleProgress=false;
  powerMonitor.emit('resume');
  await waitFor("document.querySelector('progress')?.value===40");
  assert.equal(accepted,acceptedBeforeResume);
  await waitFor("document.querySelector('.cancel-job')");
  await waitFor("document.querySelector('progress')?.value===40");
  await runSecond("document.querySelector('.cancel-job').click()");
  await waitFor("document.activeElement.textContent==='继续运行'");
  assert.equal(cancelCalls,0);
  assert.equal(await runSecond("document.querySelector('.job-cancel-confirm p').textContent.includes(document.querySelector('.job-cancel-confirm').closest('article').querySelector('h3').textContent)"),true);
  await runSecond('document.activeElement.click()');
  await waitFor("document.activeElement.matches('.cancel-job')");
  assert.equal(cancelCalls,0);
  await runSecond("document.querySelector('.cancel-job').click()");
  await runSecond("{const button=document.querySelector('.confirm-cancel');button.click();button.click();}");
  await waitFor("document.querySelector('.job-card [role=alert]')?.textContent.includes('未收到取消确认')");
  assert.equal(cancelCalls,1);
  await waitFor("document.querySelector('.cancel-job:enabled')");
  assert.ok((await runSecond('window.jobs.list()')).some(item=>item.status==='running'));
  const cancelling=once(server,'request');
  await second.webContents.executeJavaScript("document.querySelector('.cancel-job').click()");
  await runSecond("document.querySelector('.confirm-cancel').click()");
  const [,confirmation]=await cancelling;
  await waitFor("document.querySelector('[data-status=cancel_requested]')");
  confirmation.end();
  await waitFor("document.querySelector('[data-status=cancelled]')");
  assert.equal(accepted,3);
  assert.equal(cancelCalls,2);
  const dispatch=key=>second.webContents.executeJavaScript(
    'window.jobs.submit('+JSON.stringify({workspaceId:'test',viewId:'v',type:'export-css',key,input:['#fedcba']})+')'
  );
  const interruptedRequest=once(server,'request');
  const interrupted=await dispatch('interrupted');
  await interruptedRequest;
  const workers=()=>app.getAppMetrics().filter(p=>p.name==='Workbench fixture.css');
  assert.equal(workers().length,1);
  const oldPid=workers()[0].pid;
  process.kill(oldPid,'SIGKILL');
  await waitFor("document.querySelector('[data-status=unknown]')");
  await waitFor("document.querySelector('.job-uncertain .last-progress strong')?.textContent==='65%'");
  await second.webContents.executeJavaScript("document.querySelector('.job-uncertain summary').click()");
  const detail=await second.webContents.executeJavaScript("document.querySelector('.job-uncertain details[open] code').textContent");
  assert.equal(detail,interrupted.id);
  const unknownGroup=await second.webContents.executeJavaScript(`(()=>{
    const card=document.querySelector('[data-status=unknown]').closest('article');
    return [card.closest('.job-group').getAttribute('aria-label'),card.querySelectorAll('.cancel-job').length];
  })()`);
  assert.deepEqual(unknownGroup,['需要核对',0]);
  const receipt=await dispatch('interrupted');
  assert.equal(receipt.id,interrupted.id);
  assert.equal(receipt.status,'unknown');
  assert.equal(accepted,4);
  const newRequest=once(server,'request');
  const fresh=await dispatch('new-request');
  const [,freshResponse]=await newRequest;
  assert.equal(workers().length,1);
  assert.notEqual(workers()[0].pid,oldPid);
  freshResponse.end('fresh result');
  await waitFor("Array.from(document.querySelectorAll('.job-card pre')).some(el=>el.textContent==='fresh result')");
  const final=await second.webContents.executeJavaScript('window.jobs.list()');
  assert.equal(final.find(r=>r.id===interrupted.id).status,'unknown');
  assert.equal(final.find(r=>r.id===fresh.id).status,'succeeded');
  assert.equal(accepted,5);
  const slowRequest=once(server,'request');
  const slow=await dispatch('timeout');
  const [,slowResponse]=await slowRequest;
  async function status(id){
    const list=await second.webContents.executeJavaScript('window.jobs.list()');
    return list.find(job=>job.id===id).status;
  }
  const end=Date.now()+12000;
  while(await status(slow.id)!=='unknown'&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await status(slow.id),'unknown');
  const restoreError=()=>second.webContents.executeJavaScript("window.backups.restore('invalid').catch(e=>e.message)");
  assert.match(await restoreError(),/正在处理请求/);
  await second.webContents.executeJavaScript("document.querySelector('.manage-link').click()");
  await waitFor("document.querySelector('.backup-card>button')");
  await second.webContents.executeJavaScript("document.querySelector('.backup-card>button').click()");
  await waitFor("document.querySelector('.backup-card [role=alert]')?.textContent.includes('稍后备份')");
  assert.deepEqual(await second.webContents.executeJavaScript('window.backups.list()'),[]);
  slowResponse.end('late completion');
  let reason;
  for(let i=0;i<30;i++){
    await new Promise(resolve=>setTimeout(resolve,30));
    reason=await restoreError();
    if(reason.includes('备份标识无效'))break;
  }
  assert.match(reason,/备份标识无效/);
  await second.webContents.executeJavaScript("document.querySelector('.backup-card>button').click()");
  await waitFor("document.querySelector('.backup-receipt')");
  assert.equal((await second.webContents.executeJavaScript('window.backups.list()')).length,1);
  assert.equal(await status(slow.id),'unknown');
  assert.equal(accepted,6);
  const providerSwitch="[role=switch][aria-label^=CSS]";
  await runSecond(`document.querySelector(${JSON.stringify(providerSwitch)}).click()`);
  await waitFor("document.querySelector('.dependency-issue')?.textContent.includes('已停用')");
  assert.equal(await runSecond("document.querySelector('[aria-label=配色板]').getAttribute('aria-checked')"),'true');
  assert.match(await runSecond("document.querySelector('.dependency-issue').textContent"),/已启用，暂不可用.*CSS/);
  await runSecond(`document.querySelector(${JSON.stringify(providerSwitch)}).click()`);
  await waitFor("!document.querySelector('.dependency-issue')");
  server.close();
  console.log('One request accepted; last window closed; job committed while window count was zero; reopened window recovered result.');
}
const timer=setTimeout(()=>{console.error('等待桌面验收超时');app.exit(1);},nativeSleep?900000:25000);
verify().then(()=>{clearTimeout(timer);app.quit();},error=>{console.error(error);app.exit(1);});
