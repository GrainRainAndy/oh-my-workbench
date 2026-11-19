const {app,BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
app.whenReady().then(async () => {
  const win = new BrowserWindow({width:920,height:680,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await win.loadFile(require('node:path').join(__dirname,'index.html'));
  if (!process.argv.includes('--verify')) return;
  const run = code => win.webContents.executeJavaScript(code);
  for (let i=1;i<12;i++) {
    await run(`document.querySelector('[data-pane=p${Math.floor((i-1)/2)}]').click(); document.querySelector('[data-action=${i%2?'horizontal':'vertical'}]').click()`);
  }
  win.setSize(480,320);
  const views = await run("Array.from(document.querySelectorAll('.pane'), p => [p.textContent,p.offsetWidth,p.offsetHeight])");
  assert.equal(new Set(views.map(v=>v[0])).size,12);
  assert.ok(views.every(([,w,h])=>w>=80 && h>=56));
  app.focus({steal:true});
  win.focus();
  win.webContents.focus();
  await run("document.querySelector('[data-action=close]').focus()");
  win.webContents.focus();
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
  await run(`new Promise((resolve,reject)=>{
    const check=()=>{if(document.querySelectorAll(".pane").length===11){observer.disconnect(); clearTimeout(timer); resolve(true)}};
    const observer=new MutationObserver(check);
    const timer=setTimeout(()=>{observer.disconnect();reject(Error("keyboard close timed out"))},3000);
    observer.observe(document.querySelector("main"),{childList:true});check();
  })`);
  console.log(JSON.stringify({views,keyboardClose:11}));
  app.exit(0);
}).catch(error=>{console.error(error);app.exit(1)});
app.on('window-all-closed',()=>app.quit());
