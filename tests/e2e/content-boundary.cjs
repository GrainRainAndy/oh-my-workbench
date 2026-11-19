const assert=require('node:assert/strict');
const {once}=require('node:events');
const {join}=require('node:path');
const {app,BrowserWindow}=require('electron');

async function verify(){
  app.setPath('userData',join(process.env.WORKBENCH_E2E_TEMP_DIR,'content-boundary'));
  const created=once(app,'browser-window-created');
  require('../../apps/desktop/main.cjs').startDesktop();
  const [,window]=await created;
  await once(window.webContents,'did-finish-load');
  const contents=window.webContents;
  const original=contents.getURL();
  const directives=await contents.executeJavaScript(`new Promise(resolve=>{
    const blocked=new Set();
    document.addEventListener('securitypolicyviolation',event=>{
      blocked.add(event.effectiveDirective);
      if(blocked.has('frame-src')&&blocked.has('form-action'))resolve([...blocked]);
    });
    const frame=document.createElement('iframe');
    frame.src='./index.html';
    document.body.append(frame);
    const form=document.createElement('form');
    form.action='./index.html';
    document.body.append(form);
    form.submit();
  })`);
  assert.ok(directives.includes('frame-src')&&directives.includes('form-action'));
  assert.equal(await contents.executeJavaScript("window.open('https://example.invalid/')===null"),true);
  const navigating=once(contents,'will-navigate');
  await contents.executeJavaScript("location.assign('https://example.invalid/');void 0");
  const [event]=await navigating;
  assert.ok(event.defaultPrevented);
  assert.equal(contents.getURL(),original);
  assert.equal(BrowserWindow.getAllWindows().length,1);
  assert.deepEqual(await contents.executeJavaScript('window.workspaces.list()'),[]);
}
verify().then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
