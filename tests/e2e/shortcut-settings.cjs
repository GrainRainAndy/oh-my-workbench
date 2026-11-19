const assert=require('node:assert/strict');
const {spawn,spawnSync,execFileSync}=require('node:child_process');
const {once}=require('node:events');
const {join}=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {app}=require('electron');
const globalShortcut=require('../../apps/desktop/shortcuts.cjs');

const replacement='Control+Alt+Shift+Command+Space';
const previous='Control+Alt+Shift+Command+9';
app.setPath('userData',join(process.env.WORKBENCH_E2E_TEMP_DIR,'shortcut-client'));

async function verify(){
  const created=once(app,'browser-window-created');
  require('../../apps/desktop/main.cjs').startDesktop();
  let [,win]=await created;
  await once(win.webContents,'did-finish-load');
  const run=async code=>{
    try{return await win.webContents.executeJavaScript(code);}
    catch(error){throw new Error(code,{cause:error});}
  };
  for(let i=0;i<100&&!await run("!!document.querySelector('.welcome')");i++)await delay(25);
  await run(`window.desktopPreferences.setShortcut(${JSON.stringify(previous)})`);
  await run("document.querySelector('.manage-link').click()");
  for(let i=0;i<100&&!await run("!!document.querySelector('.shortcut')");i++)await delay(25);
  async function recordReplacement(){
    await run("document.querySelector('.shortcut').click()");
    await run("document.querySelector('.shortcut').dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:' ',code:'Space',ctrlKey:true,altKey:true,shiftKey:true,metaKey:true}))");
  }
  if(process.argv.includes('--native-conflict')){
    const binary=join(process.env.WORKBENCH_E2E_TEMP_DIR,'native-shortcut-owner');
    execFileSync('clang',[join(__dirname,'../fixtures/shortcut-owner.c'),'-framework','Carbon','-o',binary]);
    const owner=spawn(binary,[],{stdio:['pipe','pipe','inherit']});
    const exited=once(owner,'exit');
    try{
      const [ready]=await once(owner.stdout,'data');
      assert.equal(ready.toString().trim(),'0');
      const probe=spawnSync(binary,[],{input:'',encoding:'utf8',timeout:3000});
      assert.ifError(probe.error);
      assert.equal(probe.status,1,'A second native process must be denied an exclusive registration: '+probe.stdout);
      assert.equal(probe.stdout.trim(),'-9878','Expected Carbon eventHotKeyExistsErr');
      console.log('Exclusive registration independently rejected with OSStatus',probe.stdout.trim());
      await recordReplacement();
      for(let i=0;i<100&&!await run("document.querySelector('.desktop-settings [role=alert]')?.textContent.includes('已被占用')");i++)await delay(25);
      const warning=await run("document.querySelector('.desktop-settings [role=alert]')?.textContent??''");
      const settings=await run('window.desktopPreferences.read()');
      assert.match(warning,/已被占用/,'Native conflict confirmed; current shortcut: '+settings.shortcut);
      assert.equal((await run('window.desktopPreferences.read()')).shortcut,previous);
      assert.equal(globalShortcut.isRegistered(previous),true);
      assert.equal(globalShortcut.isRegistered(replacement),false);
    }finally{
      owner.stdin.end();
      await exited;
    }
  }
  await recordReplacement();
  for(let i=0;i<100&&!globalShortcut.isRegistered(replacement);i++)await delay(25);
  assert.equal((await run('window.desktopPreferences.read()')).shortcut,replacement);
  assert.equal(globalShortcut.isRegistered(previous),false);
  assert.equal(globalShortcut.isRegistered(replacement),true);
  if(process.argv.includes('--system-press')||process.argv.includes('--manual-press')){
    const manual=process.argv.includes('--manual-press');
    const binary=join(process.env.WORKBENCH_E2E_TEMP_DIR,'native-shortcut-press');
    if(!manual)execFileSync('clang',[join(__dirname,'../fixtures/shortcut-press.c'),'-framework','ApplicationServices','-o',binary]);
    const closed=once(win,'closed');
    win.close();
    await closed;
    assert.equal(require('electron').BrowserWindow.getAllWindows().length,0);
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),manual?60000:5000);
    try{
      const reopened=once(app,'browser-window-created',{signal:controller.signal});
      reopened.catch(()=>{});
      if(manual)console.log('窗口已关闭。请在一分钟内按下 ⌃⌥⇧⌘空格以验证系统唤回。');
      else execFileSync(binary,{stdio:'inherit'});
      [,win]=await reopened;
      await once(win.webContents,'did-finish-load');
      await run("document.querySelector('.manage-link').click()");
      for(let i=0;i<100&&!await run("!!document.querySelector('.shortcut')");i++)await delay(25);
      assert.equal((await run('window.desktopPreferences.read()')).shortcut,replacement);
    }finally{clearTimeout(timeout);controller.abort();}
  }
  await run("Array.from(document.querySelectorAll('.desktop-settings button')).find(b=>b.textContent==='清除').click()");
  for(let i=0;i<100&&globalShortcut.isRegistered(replacement);i++)await delay(25);
  assert.equal(globalShortcut.isRegistered(replacement),false);
  assert.equal((await run('window.desktopPreferences.read()')).shortcut,'');
  app.quit();
}
verify().catch(error=>{console.error(error);app.exit(1);});
