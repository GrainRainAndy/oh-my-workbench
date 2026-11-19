const assert=require('node:assert/strict');
const {once}=require('node:events');
const {join}=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {app}=require('electron');

async function verify(){
  app.setPath('userData',join(process.env.WORKBENCH_E2E_TEMP_DIR,'compact'));
  const created=once(app,'browser-window-created');
  require('../../apps/desktop/main.cjs').startDesktop();
  const [,win]=await created;
  win.setSize(660,460);
  await once(win.webContents,'did-finish-load');
  const run=code=>win.webContents.executeJavaScript(code);
  await run(`(async()=>{
    for(let i=0;i<18;i++)await window.workspaces.save({id:'w'+i,name:i===0?'长'.repeat(76)+'👩🏽':'长名称工作区'.repeat(8)+i,revision:0,schemaVersion:1,
      activePaneId:'p',layout:{type:'leaf',paneId:'p',viewInstanceId:'v'},
      views:{v:{id:'v',pluginId:'fixture.palette',viewType:'palette',configVersion:1,stateVersion:1,config:{},state:{}}}});
    localStorage.setItem('workbench.recentWorkspace','w0');
  })()`);
  const loaded=once(win.webContents,'did-finish-load');
  win.reload();await loaded;
  for(let i=0;i<100&&!await run("!!document.querySelector('.swatches')");i++)await delay(30);
  assert.ok(await run(`(()=>{
    const nav=document.querySelector('nav'),footer=document.querySelector('footer'),menu=document.querySelector('.workspace-tools summary');
    const heading=document.querySelector('.heading h1');
    const appearance=document.querySelector('.appearance'),label=appearance.querySelector('span'),select=appearance.querySelector('select');
    const range=document.createRange();range.selectNodeContents(label);
    const textWidth=document.createElement('canvas').getContext('2d');
    textWidth.font=getComputedStyle(select).font;
    const required=textWidth.measureText(select.selectedOptions[0].textContent).width;
    return range.getClientRects().length===1 && label.getBoundingClientRect().right<=select.getBoundingClientRect().left
      && select.getBoundingClientRect().right<=footer.getBoundingClientRect().right && select.clientWidth>=required+18
      && nav.scrollHeight>nav.clientHeight && footer.getBoundingClientRect().bottom<=innerHeight
      && menu.getBoundingClientRect().right<=innerWidth && heading.scrollWidth>heading.clientWidth
      && document.documentElement.scrollWidth===innerWidth && !!document.querySelector('.swatches');
  })()`));
  assert.ok(await run(`(()=>{
    const pane=document.querySelector('.pane'),header=pane.querySelector('.panehead');
    const content=document.createElement('div');
    content.style.minHeight='150vh';
    pane.append(content);
    try {
      const top=header.getBoundingClientRect().top;
      pane.scrollTop=120;
      const menu=header.querySelector('[aria-haspopup]').getBoundingClientRect();
      return pane.scrollTop>0 && header.getBoundingClientRect().top===top
        && header.contains(document.elementFromPoint(menu.x+menu.width/2,menu.y+menu.height/2));
    } finally { content.remove(); pane.scrollTop=0; }
  })()`),'Long plugin content must leave the pane menu visible and clickable');
  await run("document.querySelector('nav button:last-child').focus()");
  assert.ok(await run("document.querySelector('nav').scrollTop>0 && document.querySelector('footer').getBoundingClientRect().bottom<=innerHeight"));
  assert.ok(await run(`(()=>{
    const button=document.activeElement,label=button.querySelector('.workspace-name');
    const [prefix,suffix]=label.children;
    return prefix.scrollWidth>prefix.clientWidth && suffix.getBoundingClientRect().right<=button.getBoundingClientRect().right
      && label.textContent===button.getAttribute('aria-label') && label.title.endsWith(suffix.textContent);
  })()`));
  await run("document.querySelector('.skip-navigation').focus()");
  assert.ok(await run("document.activeElement.getBoundingClientRect().left>=0"));
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});
  for(let i=0;i<40&&!await run("document.activeElement.matches('main')");i++)await delay(25);
  assert.ok(await run("document.activeElement.matches('main') && document.querySelector('.skip-navigation').getBoundingClientRect().right<0"));
  await run("document.querySelector('nav button:last-child').focus()");
  const focusedName=await run("document.activeElement.getAttribute('aria-label')");
  await run("document.activeElement.click()");
  for(let i=0;i<100&&!await run("document.querySelector('h1').textContent==="+JSON.stringify(focusedName));i++)await delay(25);
  assert.equal(await run("document.querySelector('nav [aria-current=page]').getAttribute('aria-label')"),focusedName);
  await run("Array.from(document.querySelectorAll('nav button')).find(button=>button.textContent.endsWith('👩🏽')).click()");
  for(let i=0;i<100&&!await run("document.querySelector('h1').textContent.endsWith('👩🏽')");i++)await delay(25);
  const copyName='长'.repeat(76)+' 副本';
  await run("document.querySelector('.workspace-tools summary').click();Array.from(document.querySelectorAll('.workspace-menu button')).find(b=>b.textContent==='复制工作区').click()");
  assert.equal(await run("document.querySelector('dialog input').value"),copyName);
  await run("document.querySelector('dialog form').requestSubmit()");
  for(let i=0;i<100&&await run("!!document.querySelector('dialog[open]')");i++)await delay(25);
  const reloaded=once(win.webContents,'did-finish-load');
  win.reload();await reloaded;
  for(let i=0;i<100&&!await run("!!document.querySelector('.swatches')");i++)await delay(25);
  assert.equal(await run("document.querySelector('.heading h1').textContent"),copyName);
  assert.equal(await run("document.querySelectorAll('nav button').length"),19);
  await run("window.backups.create()");
  await run("document.querySelector('.manage-link').click()");
  for(let i=0;i<100&&!await run("!!document.querySelector('.backup-history summary')");i++)await delay(25);
  await run("document.querySelector('.backup-history summary').click();document.querySelector('.backup-history button').click()");
  for(let i=0;i<100&&!await run("!!document.querySelector('.restore-confirm:modal')");i++)await delay(25);
  assert.ok(await run(`(()=>{
    const dialog=document.querySelector('.restore-confirm:modal'),bounds=dialog.getBoundingClientRect();
    const description=dialog.getAttribute('aria-describedby').split(' ').map(id=>document.getElementById(id).textContent).join(' ');
    const actions=dialog.querySelector('.restore-actions').getBoundingClientRect();
    return bounds.top>=0 && bounds.bottom<=innerHeight && actions.bottom<=bounds.bottom
      && description.includes('已撤销的凭据仍然失效') && document.activeElement.textContent==='取消';
  })()`));
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  for(let i=0;i<100&&await run("!!document.querySelector('.restore-confirm')");i++)await delay(25);
  assert.ok(await run("!document.querySelector('.restore-confirm') && document.activeElement===document.querySelector('.backup-history button')"));

}
verify().then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
