// Throwaway Electron API probe. Not yet runtime-verified in this environment.
const {app,BrowserWindow,ipcMain,protocol,utilityProcess,Menu}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs/promises');
const root=path.resolve(__dirname,'..');
const verifying=process.argv.includes('--verify');
if(verifying)app.setPath('userData',path.join(require('node:os').tmpdir(),'workbench-electron-spike'));
let activation=Promise.reject(Error('NOT_STARTED'));activation.catch(()=>{});
protocol.registerSchemesAsPrivileged([{scheme:'spike',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let window,backend,seq=0,quitting=false,booted=false;const pending=new Map();
function log(event,details={}) { console.log(JSON.stringify({time:new Date().toISOString(),event,...details})); }
function rejectPending(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('BACKEND_EXITED'));}pending.clear();}
async function show(){
  if(window){window.show();window.focus();return;}
  window=new BrowserWindow({width:900,height:600,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.on('closed',()=>{window=null;log('window-closed',{backendAlive:!!backend});});
  await window.loadURL('spike://app/index.html');log('window-loaded');
}
if(verifying)setTimeout(()=>{log('verification-timeout');app.exit(1);},20000).unref();
app.whenReady().then(async()=>{
  const {discover}=await import(pathToFileURL(path.join(root,'shared/package.mjs')));
  const plugin=await discover(path.join(root,'fixtures/counter'));
  const files=new Map([
    ['/index.html',path.join(__dirname,'index.html')],
    ['/renderer.mjs',path.join(__dirname,'renderer.mjs')],
    ['/fixture-ui.mjs',plugin.entries.ui]
  ]);
  protocol.handle('spike',async request=>{
    const url=new URL(request.url);const file=url.host==='app' && files.get(url.pathname);
    if(!file || request.method!=='GET')return new Response('Not found',{status:404});
    return new Response(await fs.readFile(file),{headers:{'Content-Type':file.endsWith('.html')?'text/html':'text/javascript','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'none'; connect-src 'none'; base-uri 'none'; frame-src 'none'"}});
  });
  const {waitUntilReady}=await import(pathToFileURL(path.join(root,'shared/activation.mjs')));
  backend=utilityProcess.fork(path.join(__dirname,'worker.cjs'),[plugin.entries.service],{stdio:'pipe'});
  activation=waitUntilReady(backend).catch(error=>{backend?.kill();throw error;});
  activation.catch(()=>{});
  backend.on('message',message=>{
    log('backend-message',{type:message.type,id:message.id});
    if(message.type!=='response')return;
    const p=pending.get(message.id);if(!p)return;
    clearTimeout(p.timer);pending.delete(message.id);
    message.error?p.reject(Error(message.error)):p.resolve(message.result);
  });
  backend.on('exit',code=>{log('backend-exit',{code});backend=null;rejectPending();});
  ipcMain.handle('fixture:call',async(event,method,params)=>{
    if(!window || event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame || event.senderFrame.url!=='spike://app/index.html')throw Error('INVALID_CALLER');
    if(!['stats','work'].includes(method))throw Error('INVALID_METHOD');
    return callBackend(method,params);
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Spike',submenu:[{label:'Reopen workspace',click:show},{label:'Crash fixture backend',click:()=>backend?.kill()},{type:'separator'},{role:'quit'}]}]));
  await activation;
  await show();booted=true;
  if(verifying)await verify();
}).catch(error=>{log('startup-error',{message:error.message});app.exit(1);});
app.on('window-all-closed',()=>log('no-windows')); // Intentionally remain alive.
app.on('activate',()=>{if(booted&&!quitting)show().catch(error=>{log('window-error',{message:error.message});});});
app.on('before-quit',()=>{quitting=true;backend?.kill();rejectPending();});

async function callBackend(method,params) {
  await activation;
  if(!backend)throw Error('BACKEND_EXITED');
  const id=++seq;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('TIMEOUT'));},35000);
    pending.set(id,{resolve,reject,timer});backend.postMessage({id,method,params});
  });
}
async function verify() {
  const assert=require('node:assert/strict');
  const evidence={runtime:process.versions,platform:process.platform,arch:process.arch,packaged:app.isPackaged,checks:[]};
  const check=name=>{evidence.checks.push(name);log('verified',{name});};
  const evaluate=source=>window.webContents.executeJavaScript(source);
  // loadURL finishes the document; module execution may finish on the following task.
  for(let i=0;i<50;i++){
    if(await evaluate("document.querySelectorAll('section button').length === 2"))break;
    await new Promise(r=>setTimeout(r,20));
  }
  assert.equal(await evaluate("document.querySelectorAll('section button').length"),2);check('independent ESM mounts two DOM instances');
  assert.equal(await evaluate("typeof process"),'undefined');check('renderer has no Node process global');
  const result=await evaluate("window.fixture.call('stats',{})");assert.equal(result.executions,0);check('renderer invokes scoped preload IPC');
  const job=callBackend('work',{delay:800});
  assert.equal((await callBackend('stats',{})).executions,1);
  const closed=require('node:events').once(window,'closed');
  window.close();await closed;const closedAt=Date.now();
  assert.equal(window,null);const outcome=await job;assert.equal(outcome.completed,true);assert.ok(outcome.completedAt>=closedAt,'job must finish after the window closed');check('utilityProcess completes after actual BrowserWindow close');
  await show();
  assert.equal((await evaluate("window.fixture.call('stats',{})")).completed,1);check('recreated window retrieves backend result');
  const crash=callBackend('work',{delay:10000});
  const rejected=assert.rejects(crash,/BACKEND_EXITED/);
  await callBackend('stats',{});backend.kill();await rejected;check('backend termination rejects pending calls while host survives');
  await fs.writeFile(path.resolve(root,'../../docs/qa/evidence/electron-runtime.json'),JSON.stringify(evidence,null,2));
  app.quit();
}
