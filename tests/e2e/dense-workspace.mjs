import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
export async function verifyDenseWorkspace({evaluate,send,sessionId}){
  await evaluate(`(async()=>{
    const views={};
    function layout(i,n,depth){
      if(n===1){
        const id='v'+i;
        views[id]={id,pluginId:'fixture.palette',viewType:'palette',configVersion:1,stateVersion:1,config:{},state:{}};
        return {type:'leaf',paneId:'p'+i,viewInstanceId:id};
      }
      return {type:'split',axis:depth===1?'vertical':'horizontal',ratio:.5,first:layout(i,n/2,depth+1),second:layout(i+n/2,n/2,depth+1)};
    }
    await window.workspaces.save({id:'dense',name:'八窗格',revision:0,schemaVersion:1,activePaneId:'p0',layout:layout(0,8,0),views});
    localStorage.setItem('workbench.recentWorkspace','dense');
  })()`);
  const start=performance.now();
  await send('Page.reload',{},sessionId);
  let ready=false;
  for(let i=0;i<100&&!ready;i++){
    ready=await evaluate("document.querySelectorAll('.swatches').length===8");
    if(!ready)await delay(25);
  }
  assert.ok(ready);
  const elapsed=performance.now()-start;
  assert.ok(await evaluate("Array.from(document.querySelectorAll('.job-export')).every(b=>b.getBoundingClientRect().bottom<=document.querySelector('.canvas').getBoundingClientRect().bottom)"),'Bottom row actions are clipped');
  const geometry=await evaluate(`Array.from(document.querySelectorAll('.panehead'),h=>{
    const menu=h.querySelector('[aria-haspopup]'),box=menu.getBoundingClientRect();
    return {width:h.clientWidth,overflow:h.scrollWidth-h.clientWidth,visible:box.width>0&&box.right<=h.getBoundingClientRect().right,
      compact:h.querySelector('[aria-label=关闭窗格]').getBoundingClientRect().width===0};
  })`);
  assert.ok(geometry.every(h=>h.visible&&h.overflow===0&&h.compact),JSON.stringify(geometry));
  const dimensions=await evaluate(`({
    viewportWidth:innerWidth,viewportHeight:innerHeight,
    headingHeight:document.querySelector('main > .heading').getBoundingClientRect().height,
    canvasHeight:document.querySelector('.canvas').getBoundingClientRect().height
  })`);
  if(process.env.WORKBENCH_CAPTURE){
    const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);
    await writeFile(process.env.WORKBENCH_CAPTURE,Buffer.from(data,'base64'));
  }
  await send('Page.bringToFront',{},sessionId);
  await evaluate("document.querySelector('.panehead [aria-haspopup]').focus()");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32},sessionId);
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32},sessionId);
  for(let i=0;i<50&&!await evaluate("Boolean(document.querySelector('dialog[open]'))");i++)await delay(20);
  assert.equal(await evaluate("document.querySelectorAll('dialog[open] .layout-tools button').length"),4);
  console.log(JSON.stringify({...dimensions,panes:geometry.length,headerWidth:geometry[0].width,maximumOverflow:Math.max(...geometry.map(h=>h.overflow)),restoreMs:elapsed}));
}
