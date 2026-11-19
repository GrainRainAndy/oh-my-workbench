const assert=require('node:assert/strict');
const {once}=require('node:events');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {app}=require('electron');

async function verify(){
  const directory=await mkdtemp(join(tmpdir(),'workbench-native-import-'));
  try{
    app.setPath('userData',directory);
    const file=join(directory,'原生选择器验证.json');
    const workspace={id:'sample',name:'原生选择器验证',schemaVersion:1,revision:0,
      activePaneId:'main',layout:{type:'leaf',paneId:'main'},views:{}};
    await writeFile(file,JSON.stringify({format:'workbench.layout',version:1,workspace}));
    const created=once(app,'browser-window-created');
    require('../../apps/desktop/main.cjs').startDesktop();
    const [,win]=await created;
    await once(win.webContents,'did-finish-load');
    const run=expression=>win.webContents.executeJavaScript(expression);
    const button="Array.from(document.querySelectorAll('.welcome button')).find(b=>b.textContent==='导入布局')";
    for(let attempt=0;attempt<100&&!await run('Boolean('+button+')');attempt++)await delay(50);
    await run(button+'.click()');
    console.log('Select file:',file);
    for(let attempt=0;attempt<120;attempt++){
      const importError=await run("document.querySelector('.import-error')?.textContent");
      if(importError)throw Error('Layout import reported: '+importError);
      if(await run("document.querySelector('.imported-workspace button')?.textContent==='原生选择器验证'")){
        const records=await run('window.workspaces.list()');
        assert.equal(records.length,1);
        assert.equal(records[0].name,workspace.name);
        assert.deepEqual(records[0].views,{});
        console.log('Native file selection, import receipt and persisted workspace verified.');
        return;
      }
      await delay(1000);
    }
    throw Error('Timed out waiting for native layout selection');
  }finally{await rm(directory,{recursive:true,force:true});}
}
verify().then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
