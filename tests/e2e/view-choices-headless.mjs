// Exercise the production chooser without activating an Electron window.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const views=readdirSync('plugins').flatMap(folder=>{
  const plugin=JSON.parse(readFileSync(join('plugins',folder,'manifest.json'),'utf8'));
  return plugin.views.map(view=>({...view,pluginId:plugin.id,description:view.description??plugin.description}));
});
const dir=mkdtempSync(join(tmpdir(),'workbench-view-picker-'));
try{
  await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import ViewChoices from './apps/desktop/src/ViewChoices.jsx';
    import Launcher from './plugins/launcher/view.jsx';
    window.addEventListener('error',event=>document.body.dataset.testError=event.message);
    const views=${JSON.stringify(views)};
    const pane=document.querySelector('.pane');
    const root=createRoot(pane);
    flushSync(()=>root.render(<ViewChoices available={views} choose={v=>document.body.dataset.chosen=v.type}/>));
    const buttons=Array.from(pane.querySelectorAll('.view-choice'));
    for(const width of [210,410,900]){
      pane.style.width=width+'px';
      if(pane.scrollWidth>width)throw Error('Picker overflows at '+width);
      for(const b of buttons){
        if(!b.querySelector('svg :is(path,rect)')||!b.getAttribute('aria-description'))throw Error('Missing icon or description');
        b.focus();if(document.activeElement!==b)throw Error('Focus failed');
        const box=b.getBoundingClientRect(),last=b.querySelector('strong').getBoundingClientRect();
        if(last.right>box.right||last.left<box.left)throw Error('Title clipped');
      }
    }
    buttons.at(-1).click();
    document.body.dataset.count=buttons.length;
    const label='团队共享资料归档'.repeat(12);
    const launcher={views,open:id=>{document.body.dataset.folder=id;}};
    const services={watch:()=>()=>{},async call(service,version,method){
      if(method!=='read')throw Error('Unexpected service call '+method);
      return JSON.stringify({targets:[{id:'folder-1',kind:'folder',label}],pinnedViews:[]});
    }};
    flushSync(()=>root.render(<Launcher launcher={launcher} config={{}} services={services} registerController={()=>()=>{}}/>));
    async function checkLauncher(){
    for(let attempt=0;!pane.querySelector('.launch-icon')&&attempt<50;attempt++)await new Promise(done=>setTimeout(done,10));
    document.documentElement.dataset.appearance='light';
    if(getComputedStyle(document.documentElement).backgroundColor!=='rgb(240, 241, 244)')throw Error('Canvas differs from reviewed HTML');
    const launcherTitle=pane.querySelector('.launch-heading h2');
    const tileIcon=pane.querySelector('.launch-icon');
    if(getComputedStyle(launcherTitle).fontSize!=='24px'||tileIcon.getBoundingClientRect().width!==34)throw Error('Launcher scale differs from reviewed HTML');
    const add=pane.querySelectorAll('button[aria-label="添加入口"]');
    if(add.length!==1)throw Error('Expected one launcher add action');
    if([...pane.querySelectorAll('.launcher h3')].map(heading=>heading.textContent).join()!=='常用位置'||
      pane.querySelectorAll('.launch-grid').length!==1||pane.textContent.includes('暂无插件入口'))
      throw Error('Folder-only launcher shows an empty plugin group');
    for(const theme of ['light','dark']){
      document.documentElement.dataset.appearance=theme;
      const box=add[0].getBoundingClientRect(),style=getComputedStyle(add[0]);
      if(box.width!==30||box.height!==30||style.borderRadius!=='50%'||style.backgroundColor==='rgba(0, 0, 0, 0)'||
        style.backgroundColor===style.color)throw Error('Missing themed 30px add button');
    }
    for(const width of [210,410,900]){
      pane.style.width=width+'px';
      const tile=pane.querySelector('[data-kind=folder]');
      const caption=tile.querySelector('.launch-label');
      const line=parseFloat(getComputedStyle(caption).lineHeight);
      if(caption.clientHeight>Math.ceil(line*2)||caption.scrollHeight<=caption.clientHeight||
        tile.title!==label||caption.textContent!==label||pane.scrollWidth>width)throw Error('Folder caption at '+width);
      tile.focus();
      const focus=getComputedStyle(tile);
      const ring=parseFloat(focus.outlineOffset)+parseFloat(focus.outlineWidth);
      const bounds=tile.getBoundingClientRect();
      const viewport=pane.querySelector('.launcher').getBoundingClientRect();
      if(document.activeElement!==tile||!tile.matches(':focus-visible')||
        focus.outlineStyle==='none'||parseFloat(focus.outlineWidth)<1||
        bounds.left-ring<viewport.left||bounds.right+ring>viewport.right)
        throw Error('Folder focus outline clipped at '+width);
    }
    pane.querySelector('[data-kind=folder]').click();
    }
    checkLauncher().catch(error=>document.body.dataset.testError=error.message);
  `},bundle:true,minify:true,outfile:join(dir,'app.js'),define:{'process.env.NODE_ENV':'"production"'}});
  const html=join(dir,'page.html');
  writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>'+readFileSync('apps/desktop/src/style.css','utf8')+'</style><link rel="stylesheet" href="app.css"><section class="pane" style="height:340px"></section><script src="app.js"></script>');
  const browser=process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const output=execFileSync(browser,['--headless','--disable-gpu','--no-first-run','--disable-background-networking','--disable-extensions','--user-data-dir='+join(dir,'profile'),'--virtual-time-budget=1000','--dump-dom',pathToFileURL(html).href],{encoding:'utf8',timeout:30000});
  assert.equal(output.match(/data-test-error="([^"]*)"/)?.[1],undefined);
  assert.ok(output.includes('data-count="'+views.length+'"')&&output.includes('data-chosen="'+views.at(-1).type+'"'));
  assert.match(output,/data-folder="folder-1"/);
  console.log(views.length+' views verified at 210, 410 and 900 px');
}finally{rmSync(dir,{recursive:true,force:true});}
