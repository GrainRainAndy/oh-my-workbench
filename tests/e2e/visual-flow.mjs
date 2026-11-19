import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

export async function captureFlow({evaluate,send,sessionId,output}){
  await mkdir(output,{recursive:true});
  async function wait(expression){
    for(let i=0;i<100;i++){
      if(await evaluate(expression))return;
      await delay(50);
    }
    throw Error('Missing visual checkpoint: '+expression);
  }
  const accessibility=[];
  async function checkControls(stage,expected){
    const {nodes}=await send('Accessibility.getFullAXTree',{},sessionId);
    const matched=expected.map(([role,pattern])=>{
      const found=nodes.find(node=>!node.ignored&&node.role?.value===role&&pattern.test(node.name?.value??''));
      assert.ok(found,`Missing ${role} ${pattern} at ${stage}`);
      return {role,name:found.name.value};
    });
    accessibility.push({stage,matched});
  }
  async function capture(name){
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);
    await writeFile(join(output,name+'.png'),Buffer.from(data,'base64'));
  }
  if(process.argv.includes('--compact')){
    await send('Emulation.setDeviceMetricsOverride',{width:660,height:460,deviceScaleFactor:1,mobile:false},sessionId);
    await wait("innerWidth===660 && innerHeight<=460");
  }
  assert.equal(await evaluate("document.documentElement.dataset.appearance"),'light');
  if(process.argv.includes('--dark')){
    await evaluate("const theme=document.querySelector('.appearance select');theme.value='dark';theme.dispatchEvent(new Event('change',{bubbles:true}))");
    await wait("document.documentElement.dataset.appearance==='dark'");
  }else if(process.argv.includes('--light')){
    await evaluate("const theme=document.querySelector('.appearance select');theme.value='light';theme.dispatchEvent(new Event('change',{bubbles:true}))");
    await wait("document.documentElement.dataset.appearance==='light'");
  }
  await capture('welcome');
  await checkControls('welcome',[['button',/新建工作区/],['button',/^导入布局$/]]);
  async function press(key,keyCode){
    for(const type of ['keyDown','keyUp'])
      await send('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:keyCode,
        text:type==='keyDown'&&key==='Enter'?'\r':''},sessionId);
  }
  await send('Page.bringToFront',{},sessionId);
  await press('Tab',9);
  await wait("document.activeElement.matches('.skip-navigation')");
  await press('Enter',13);
  await wait("document.activeElement.matches('main')");
  await press('Tab',9);
  await wait("document.activeElement.matches('.welcome .plugin')");
  await press('Enter',13);
  await wait("!!document.querySelector('dialog input')");
  await checkControls('create-dialog',[['dialog',/^新建工作区$/],['textbox',/^工作区名称$/],['button',/^创建$/]]);
  await wait("document.activeElement.matches('dialog input')");
  await send('Input.insertText',{text:'设计工作区'},sessionId);
  await press('Enter',13);
  await wait("!!document.querySelector('.view-choice:enabled')");
  if(process.argv.includes('--compact')){
    assert.ok(await evaluate(`(()=>{
      const last=document.querySelector('.view-choice:last-child').getBoundingClientRect();
      const pane=document.querySelector('.pane').getBoundingClientRect();
      return last.bottom<=pane.bottom && last.bottom<=innerHeight;
    })()`),'Last view choice is clipped');
  }
  await capture('choose-view');
  await checkControls('choose-view',[['button',/^配色板/],['button',/^计数器/],['button',/^计数概览/],['button',/^左右切分$/]]);
  await wait("document.activeElement===document.querySelector('.view-choice')");
  await press('Enter',13);
  await wait("!!document.querySelector('.swatches')");
  assert.ok(await evaluate("Array.from(document.querySelectorAll('.swatches code')).every(el=>el.offsetWidth>0 && el.offsetWidth<=el.parentElement.clientWidth)"));
  await evaluate("document.querySelector('[aria-label=左右切分]').click()");
  await wait("!!document.querySelector('.view-choice:enabled')");
  await evaluate("Array.from(document.querySelectorAll('.view-choice')).find(b=>b.textContent.includes('计数器')).click()");
  await wait("document.querySelector('.tally-view output')?.textContent==='0'");
  if(process.argv.includes('--system-theme')){
    const emulate=value=>send('Emulation.setEmulatedMedia',{
      features:[{name:'prefers-color-scheme',value}]
    },sessionId);
    const surface="getComputedStyle(document.querySelector('.pane')).backgroundColor";
    const original=await evaluate("document.querySelector('.appearance select').value");
    assert.equal(original,'light');
    await emulate('dark');
    await wait("matchMedia('(prefers-color-scheme: dark)').matches");
    assert.equal(await evaluate(surface),'rgb(239, 241, 245)');
    await evaluate("const picker=document.querySelector('.appearance select');picker.value='system';picker.dispatchEvent(new Event('change',{bubbles:true}))");
    await wait(surface+"==='rgb(30, 30, 46)'");
    await emulate('light');
    await wait(surface+"==='rgb(239, 241, 245)'");
    assert.equal(await evaluate("document.querySelectorAll('.pane').length"),2);
  }
  await capture('split-workspace');
  await checkControls('split-workspace',[['separator',/^调整左右窗格比例$/],['button',/^后台导出$/],['button',/^记一次$/]]);
  await evaluate("document.querySelector('.job-export').click()");
  await wait("document.querySelector('.palette [role=status]')?.textContent.includes('已提交')");
  const receipt=await evaluate("document.querySelector('.palette [role=status]').textContent");
  await evaluate("document.querySelector('.jobs-link').click()");
  await wait("!!document.querySelector('[data-status=succeeded]')");
  await evaluate("document.querySelector('.job-card summary').click()");
  assert.ok(await evaluate(`(async()=>{
    const [job]=await window.jobs.list();
    const time=document.querySelector('.job-card time');
    return Date.parse(time.dateTime)===job.updatedAt &&
      time.textContent.includes(String(new Date(job.updatedAt).getFullYear()));
  })()`),'Completed task should display the year of its saved completion time');
  const taskTitle=await evaluate("document.querySelector('.job-card h3').textContent");
  assert.ok(receipt.includes('「'+taskTitle+'」'),'Receipt must name the task shown in the job center');
  assert.ok(await evaluate("document.querySelector('.job-card details[open] pre').textContent.includes('--color-1: #273f39')"));
  if(process.argv.includes('--compact')){
    const fits=await evaluate(`(()=>{
      const card=document.querySelector('.job-card'),title=card.querySelector('h3');
      const result=card.querySelector('pre'),badge=card.querySelector('[data-status]');
      const originalTitle=title.textContent,originalResult=result.textContent;
      try {
        title.textContent='LongPluginJobName'.repeat(7);
        result.textContent='x'.repeat(240);
        return card.scrollWidth<=card.clientWidth && result.scrollWidth<=result.clientWidth &&
          badge.getBoundingClientRect().right<=card.getBoundingClientRect().right;
      } finally {title.textContent=originalTitle;result.textContent=originalResult;}
    })()`);
    assert.ok(fits,'Long plugin text pushes task content outside the compact card');
  }
  await capture('job-result');
  await checkControls('job-result',[['heading',/^任务中心$/],['region',/^已结束$/]]);
  await writeFile(join(output,'accessibility.json'),JSON.stringify(accessibility,null,2)+'\n');
}
