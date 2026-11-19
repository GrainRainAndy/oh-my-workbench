import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

export async function measureDrag({evaluate,send,sessionId,binary}){
  await evaluate("document.querySelector('[aria-label=关闭操作菜单]').click()");
  for(const nested of [false,true])await dragDivider({evaluate,send,sessionId,binary,nested});
}

async function dragDivider({evaluate,send,sessionId,binary,nested}){
  const handle=nested?'.canvas > .split > .split:first-child > .divider':'.canvas > .split > .divider';
  const edge=nested?'top':'left';
  const {x,y,length}=await evaluate(`(()=>{
    const h=document.querySelector('${handle}'),r=h.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2,length:${nested}?h.parentElement.clientHeight-r.height:h.parentElement.clientWidth-r.width};
  })()`);
  const before=await evaluate("window.workspaces.list().then(ws=>ws.find(w=>w.id==='dense'))");
  const mouse=(type,offset,buttons)=>send('Input.dispatchMouseEvent',{type,x:x+(nested?0:offset),y:y+(nested?offset:0),buttons,button:type==='mouseMoved'?'none':'left'},sessionId);
  const hit=await evaluate(`document.elementFromPoint(${x},${y})?.outerHTML.slice(0,350)`);
  assert.ok(hit?.includes('role="separator"'),JSON.stringify({hit,x,y,length}));
  await evaluate(`window.pointerLog=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,e=>window.pointerLog.push([type,e.button,e.buttons,e.target.className,e.target.hasPointerCapture(e.pointerId)]),true)`);
  await mouse('mousePressed',0,1);
  await evaluate(`(()=>{
    window.dragFrames=[];
    function frame(t){
      window.dragFrames.push([t,document.querySelector('${handle}').getBoundingClientRect().${edge}]);
      window.dragFrameRequest=requestAnimationFrame(frame);
    }
    window.dragFrameRequest=requestAnimationFrame(frame);
  })()`);
  const count=90;
  let offset=0;
  for(let i=1;i<=count;i++){
    offset=length*.15*i/count;
    await mouse('mouseMoved',offset,1);
    await delay(12);
  }
  const frames=await evaluate("cancelAnimationFrame(window.dragFrameRequest);window.dragFrames");
  assert.ok(await evaluate(`(()=>{
    const divider=document.querySelector('${handle}');
    return divider.hasAttribute('data-dragging') &&
      getComputedStyle(divider,'::before').content.includes(divider.getAttribute('aria-valuetext'));
  })()`),'Drag preview should display the current proportions');
  await mouse('mouseReleased',offset,0);
  let saved;
  for(let i=0;i<50;i++){
    saved=await evaluate("window.workspaces.list().then(ws=>ws.find(w=>w.id==='dense'))");
    if(saved.revision>before.revision)break;
    await delay(25);
  }
  assert.equal(saved.revision,before.revision+1,JSON.stringify(await evaluate('window.pointerLog.slice(0,3).concat(window.pointerLog.slice(-3))')));
  const ratio=(nested?saved.layout.first:saved.layout).ratio;
  assert.ok(Math.abs(ratio-.65)<.01);
  const expectedLayout=structuredClone(before.layout);
  (nested?expectedLayout.first:expectedLayout).ratio=ratio;
  assert.deepEqual(saved.layout,expectedLayout);
  assert.deepEqual(saved.views,before.views);
  assert.ok(new Set(frames.map(row=>row[1])).size>30);
  const gaps=frames.slice(1).map(([t],i)=>t-frames[i][0]).toSorted((a,b)=>a-b);
  console.log(JSON.stringify({binary,architecture:process.arch,measured:new Date().toISOString(),
    os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),
    machine:execFileSync('sysctl',['-n','machdep.cpu.brand_string'],{encoding:'utf8'}).trim(),
    panes:8,inputMoves:count,frames,frameColumns:['rAF_ms',`divider_${edge}_CSS_px`],
    p95FrameIntervalMs:gaps[Math.ceil(.95*gaps.length)-1],savedRatio:ratio}));
}
