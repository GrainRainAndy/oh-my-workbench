import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

export async function captureFlow({evaluate,send,sessionId,output}){
  await mkdir(output,{recursive:true});
  async function wait(expression,{duringReload=false}={}){
    for(let i=0;i<100;i++){
      try{
        if(await evaluate(expression))return;
      }catch(error){
        if(!duringReload||!['Inspected target navigated or closed','Execution context was destroyed.'].includes(error.message))throw error;
      }
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
  if(process.argv.includes('--quick-start')){
    await checkControls('quick-start',[['button',/^从快捷入口开始$/]]);
    await evaluate("document.querySelector('.welcome-starters button').click()");
    await wait("!!document.querySelector('.launcher')");
    await evaluate("location.reload()");
    await wait("!!document.querySelector('.launcher')",{duringReload:true});
    const records=await evaluate("window.workspaces.list()");
    assert.equal(records.length,1);
    assert.equal(records[0].name,'我的工作台');
    assert.equal(records[0].views[records[0].layout.viewInstanceId].pluginId,'workbench.launcher');
    return;
  }
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
  if(process.argv.includes('--launcher')){
    await evaluate("{const select=document.querySelector('.starting-view');select.value=Array.from(select.options).find(o=>o.textContent==='快捷入口').value;select.dispatchEvent(new Event('change',{bubbles:true}))}");
    await evaluate("document.querySelector('dialog form').requestSubmit()");
    await wait("!!document.querySelector('.launcher .wb-add:enabled')");
    assert.equal(await evaluate("document.querySelectorAll('.launch-tile[data-kind=view]').length"),0);
    await evaluate("document.querySelector('.launcher .wb-add').click()");
    await wait("!!document.querySelector('.launch-add-dialog[open]')");
    await evaluate("Array.from(document.querySelectorAll('.launch-options label')).find(label=>label.textContent==='日程').querySelector('input').click()");
    await evaluate("document.querySelector('.launch-footer .plugin').click()");
    await wait("!!document.querySelector('.launch-grid [data-kind=view]')");
    await checkControls('launcher',[['button',/添加入口/],['button',/^日程$/]]);
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('.launch-tile')).every(b=>{
      const r=b.getBoundingClientRect(),i=b.querySelector('svg').getBoundingClientRect(),t=b.lastElementChild.getBoundingClientRect();
      return i.left>=r.left && i.right<=r.right && t.top>=i.bottom && r.height<120;
    })`),'Icons and labels must stack within each launcher tile');
    await capture('launcher');
    await evaluate("document.querySelector('.launch-tile[data-kind=view]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))");
    await wait("!!document.querySelector('.launcher .action-menu[open]')");
    await evaluate("Array.from(document.querySelectorAll('.launcher .action-menu button')).find(b=>b.textContent==='在旁边打开').click()");
    await wait("document.querySelectorAll('.pane').length===2 && !!document.querySelector('.launcher') && !!document.querySelector('.pane[data-active]')");
    assert.equal(await evaluate("document.querySelector('.pane[data-active] .pane-title').textContent"),'日程');
    return;
  }
  if(process.argv.includes('--starter')){
    await evaluate("{const select=document.querySelector('.starting-view');select.value=Array.from(select.options).find(o=>o.textContent==='待办').value;select.dispatchEvent(new Event('change',{bubbles:true}))}");
    await capture('starter-dialog');
    await evaluate("document.querySelector('dialog form').requestSubmit()");
    await wait("!!document.querySelector('.todo-view')");
    assert.ok(await evaluate("document.activeElement.matches('.pane[data-active] .pane-title')"),'Creating a workspace with a starting view must focus its pane');
    await press('Tab',9);
    assert.ok(await evaluate("document.activeElement.matches('.panehead [aria-haspopup=dialog]')"));
    await wait("!!document.querySelector('.todo-view .wb-add:enabled')");
    await evaluate("document.querySelector('.todo-view .wb-add').click()");
    await wait("document.activeElement?.getAttribute('aria-label')==='事项名称'");
    await send('Input.insertText',{text:'保留草稿'},sessionId);
    await evaluate("document.querySelector('.jobs-link').click()");
    await wait("!!document.querySelector('.draft-dialog[open]')");
    await evaluate("document.querySelector('.draft-dialog button').click()");
    await wait("document.querySelector('[aria-label=事项名称]')?.value==='保留草稿'");
    await evaluate("document.querySelector('.jobs-link').click()");
    await evaluate("document.querySelector('.draft-dialog .plugin').click()");
    await wait("!!document.querySelector('.job-center')");
    await evaluate("document.querySelector('nav button').click()");
    await wait("document.querySelector('.todo-row .todo-title strong')?.textContent==='保留草稿'");
    const before=await evaluate('performance.timeOrigin');
    await send('Page.reload',{},sessionId);
    await wait("performance.timeOrigin!=="+before+" && document.querySelector('.todo-row .todo-title strong')?.textContent==='保留草稿'",{duringReload:true});
    await evaluate("document.querySelector('.todo-more').click()");
    await evaluate("Array.from(document.querySelectorAll('.todo-row .action-menu button')).find(b=>b.textContent==='详情').click()");
    await evaluate("document.querySelector('.todo-details textarea').focus()");
    await send('Input.insertText',{text:'尚未保存的备注'},sessionId);
    await evaluate("document.querySelector('.jobs-link').click()");
    await wait("!!document.querySelector('.draft-dialog[open]')");
    assert.equal(await evaluate("!!document.querySelector('.draft-dialog .plugin')"),true);
    await capture('todo-draft');
    await evaluate("Array.from(document.querySelectorAll('.draft-dialog button')).find(b=>b.textContent==='放弃并继续').click()");
    await wait("!!document.querySelector('.job-center')");
    await evaluate("document.querySelector('nav button').click()");
    await wait("!!document.querySelector('.todo-more')");
    await evaluate("document.querySelector('.todo-more').click()");
    await evaluate("Array.from(document.querySelectorAll('.todo-row .action-menu button')).find(b=>b.textContent==='详情').click()");
    assert.equal(await evaluate("document.querySelector('.todo-details textarea').value"),'');
    await evaluate("document.querySelector('.todo-details textarea').focus()");
    await send('Input.insertText',{text:'确认保存的备注'},sessionId);
    await evaluate("document.querySelector('.jobs-link').click()");
    await evaluate("document.querySelector('.draft-dialog .plugin').click()");
    await wait("!!document.querySelector('.job-center')");
    await evaluate("document.querySelector('nav button').click()");
    await wait("!!document.querySelector('.todo-more')");
    await evaluate("document.querySelector('[aria-label=左右切分]').click()");
    await wait("!!document.querySelector('.view-choice:enabled')");
    await evaluate("Array.from(document.querySelectorAll('.view-choice')).find(b=>b.querySelector('strong').textContent==='待办').click()");
    await wait("document.querySelectorAll('.todo-more').length===2");
    for(const index of [0,1]){
      const pane="document.querySelectorAll('.todo-view')["+index+"]";
      await evaluate(pane+".querySelector('.todo-more').click()");
      await evaluate("Array.from("+pane+".querySelectorAll('.todo-row .action-menu button')).find(b=>b.textContent==='详情').click()");
      assert.equal(await evaluate(pane+".querySelector('textarea').value"),'确认保存的备注');
      await evaluate(pane+".querySelector('textarea').select()");
      await send('Input.insertText',{text:index?'待核对':'已确认'},sessionId);
    }
    await evaluate("{const priority=document.querySelector('.todo-details select');priority.value='high';priority.dispatchEvent(new Event('change',{bubbles:true}))}");
    await evaluate("document.querySelector('.todo-details button').click()");
    await wait("!!document.querySelectorAll('.todo-view')[0].querySelector('.todo-more')");
    await wait("document.querySelector('.todo-conflict dd')?.textContent==='已确认'");
    assert.equal(await evaluate("document.querySelector('textarea').value"),'待核对');
    await evaluate("document.querySelector('.jobs-link').click()");
    await wait("!!document.querySelector('.draft-dialog[open]')");
    assert.equal(await evaluate("!!document.querySelector('.draft-dialog .plugin')"),false);
    await evaluate("document.querySelector('.draft-dialog button').click()");
    await evaluate("Array.from(document.querySelectorAll('.todo-conflict button')).find(b=>b.textContent==='保留我的修改').click()");
    await evaluate("document.querySelector('.todo-details .plugin').click()");
    await wait("document.querySelectorAll('.todo-more').length===2");
    await evaluate("document.querySelector('.todo-more').click()");
    await evaluate("Array.from(document.querySelectorAll('.todo-row .action-menu button')).find(b=>b.textContent==='详情').click()");
    assert.equal(await evaluate("document.querySelector('textarea').value"),'待核对');
    assert.equal(await evaluate("document.querySelector('.todo-details select').value"),'high');
    return;
  }
  await press('Enter',13);
  await wait("!!document.querySelector('.view-choice:enabled')");
  if(process.argv.includes('--compact')){
    assert.ok(await evaluate(`(()=>{
      const last=document.querySelector('.view-choice:last-child').getBoundingClientRect();
      const pane=document.querySelector('.pane').getBoundingClientRect();
      return last.bottom<=pane.bottom && last.bottom<=innerHeight;
    })()`),'Last view choice is clipped');
  }
  if(process.argv.includes('--standalone')){
    const peer=process.argv.includes('--calendar')?'待办':'日程';
    const selector=JSON.stringify('[role=switch][aria-label="'+peer+'"]');
    const toggle='document.querySelector('+selector+')';
    await evaluate("document.querySelector('.manage-link').click()");
    await wait(toggle+"?.getAttribute('aria-checked')==='true'");
    await evaluate(toggle+'.click()');
    await wait(toggle+"?.getAttribute('aria-checked')==='false'");
    await evaluate("document.querySelector('.return-workspace').click()");
    await wait("!!document.querySelector('.view-choice:enabled')");
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.view-choice strong')).some(el=>el.textContent==="+JSON.stringify(peer)+")"),false);
    await send('Network.enable',{},sessionId);
    await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0},sessionId);
    assert.equal(await evaluate('navigator.onLine'),false);
  }
  if(process.argv.includes('--todo')){
    await evaluate("Array.from(document.querySelectorAll('.view-choice')).find(b=>b.querySelector('strong').textContent==='待办').click()");
    await wait("!!document.querySelector('.todo-view .wb-add:enabled')");
    await evaluate("document.querySelector('.todo-list-controls').open=true;document.querySelector('.todo-list-bar button').click()");
    await wait("document.activeElement?.getAttribute('aria-label')==='清单名称'");
    await send('Input.insertText',{text:'工作'},sessionId);
    await press('Enter',13);
    await wait("document.querySelector('.todo-list-bar select').selectedOptions[0]?.textContent==='工作'");
    if(process.argv.includes('--todo-navigation')){
      await wait("!!document.querySelector('.todo-view .wb-add:enabled')");
    await evaluate("document.querySelector('.todo-view .wb-add').click()");
    await wait("document.activeElement?.getAttribute('aria-label')==='事项名称'");
      await send('Input.insertText',{text:'仅保存在工作清单'},sessionId);
      const selectInbox="const field=document.querySelector('[aria-label=当前清单]');field.value='inbox';field.dispatchEvent(new Event('change',{bubbles:true}))";
      await evaluate('{'+selectInbox+'}');
      await wait("!!document.querySelector('.draft-dialog[open]')");
      await evaluate("Array.from(document.querySelectorAll('.draft-dialog button')).find(b=>b.textContent==='继续编辑').click()");
      assert.equal(await evaluate("document.querySelector('[aria-label=当前清单]').selectedOptions[0].textContent"),'工作');
      assert.equal(await evaluate("document.querySelector('[aria-label=事项名称]').value"),'仅保存在工作清单');
      await evaluate('{'+selectInbox+'}');
      await wait("!!document.querySelector('.draft-dialog[open]')");
      await evaluate("Array.from(document.querySelectorAll('.draft-dialog button')).find(b=>b.textContent==='保存并继续').click()");
      await wait("document.querySelector('[aria-label=当前清单]').value==='inbox' && document.querySelector('.todo-view').textContent.includes('暂无待完成事项')");
      await evaluate("{const f=document.querySelector('[aria-label=当前清单]');f.value=Array.from(f.options).find(o=>o.textContent==='工作').value;f.dispatchEvent(new Event('change',{bubbles:true}))}");
      await wait("document.querySelector('.todo-row .todo-title strong')?.textContent==='仅保存在工作清单'");
      await wait("!!document.querySelector('.todo-view .wb-add:enabled')");
    await evaluate("document.querySelector('.todo-view .wb-add').click()");
    await wait("document.activeElement?.getAttribute('aria-label')==='事项名称'");
      await send('Input.insertText',{text:'放弃的草稿'},sessionId);
      await evaluate("document.querySelector('.todo-filters button:last-child').click()");
      await wait("!!document.querySelector('.draft-dialog[open]')");
      await evaluate("Array.from(document.querySelectorAll('.draft-dialog button')).find(b=>b.textContent==='放弃并继续').click()");
      await wait("document.querySelector('.todo-view').textContent.includes('尚无已完成事项')");
      await evaluate("document.querySelector('.todo-filters button').click()");
      await wait("document.querySelector('.todo-row .todo-title strong')?.textContent==='仅保存在工作清单'");
      assert.equal(await evaluate("!!document.querySelector('[aria-label=事项名称]')"),false);
      return;
    }
    await evaluate("document.querySelector('.todo-view .wb-add').click()");
    await wait("document.activeElement?.getAttribute('aria-label')==='事项名称'");
    await send('Input.insertText',{text:'整理资料'},sessionId);
    await press('Enter',13);
    await wait("document.querySelector('.todo-view .todo-title strong')?.textContent==='整理资料'");
    await evaluate("document.querySelector('.todo-view li input').click()");
    await wait("document.querySelector('.todo-view').textContent.includes('暂无待完成事项')");
    await evaluate("document.querySelector('.todo-filters button:last-child').click()");
    await wait("document.querySelector('.todo-view li input')?.checked===true");
    const origin=await evaluate('performance.timeOrigin');
    await send('Page.reload',{},sessionId);
    await wait("performance.timeOrigin!=="+origin+" && document.querySelector('.todo-view li input')?.checked===true",{duringReload:true});
    assert.equal(await evaluate("document.querySelector('.todo-list-bar select').selectedOptions[0].textContent"),'工作');
    if(process.argv.includes('--todo-pair')){
      await evaluate("document.querySelector('[aria-label=左右切分]').click()");
      await wait("!!document.querySelector('.view-choice:enabled')");
      await evaluate("Array.from(document.querySelectorAll('.view-choice')).find(b=>b.querySelector('strong').textContent==='待办').click()");
      const both="Array.from(document.querySelectorAll('.todo-view'))";
      await wait(both+".length===2 && "+both+"[1].querySelector('.todo-list-bar select').options.length===3");
      await evaluate("{const panes="+both+";const field=panes[1].querySelector('.todo-list-bar select');field.value=panes[0].querySelector('.todo-list-bar select').value;field.dispatchEvent(new Event('change',{bubbles:true}))}");
      const names=both+".map(p=>p.querySelector('.todo-list-bar select').selectedOptions[0]?.textContent).join(',')";
      const filters=both+".map(p=>p.querySelector('.todo-filters [aria-pressed=true]').textContent).join(',')";
      await wait(names+"==='工作,工作'");
      await evaluate("document.querySelector('.todo-list-bar [aria-expanded]').click()");
      await evaluate("document.querySelector('[aria-label=归档工作]').click()");
      await wait(names+"==='工作（已归档）,工作（已归档）'");
      const before=await evaluate('performance.timeOrigin');
      await send('Page.reload',{},sessionId);
      await wait("performance.timeOrigin!=="+before+" && "+names+"==='工作（已归档）,工作（已归档）'",{duringReload:true});
      await evaluate("document.querySelector('.todo-list-bar [aria-expanded]').click()");
      await evaluate("document.querySelector('[aria-label=恢复工作]').click()");
      await wait(names+"==='工作,工作' && "+filters+"==='已完成,待完成'");
      await wait(both+"[0].querySelector('.todo-row input')?.checked && "+both+"[1].textContent.includes('暂无待完成事项')");
      await capture('todo-pair-restored');
      const firstButton=label=>evaluate(both+"[0] && Array.from(document.querySelector('.todo-view').querySelectorAll('button:enabled')).find(b=>b.textContent==="+JSON.stringify(label)+").click()");
      await evaluate("document.querySelector('.todo-more').click()");
      await firstButton('移动');
      await wait("document.querySelector('.todo-move select')?.value==='inbox'");
      await firstButton('确认移动');
      await wait(both+"[0].textContent.includes('尚无已完成事项')");
      await evaluate("document.querySelector('[aria-label=删除清单工作]').click()");
      await firstButton('确认删除');
      await wait(names+"==='全部清单,清单已删除'");
      await wait(both+"[0].querySelector('.todo-row input')?.checked && "+both+"[1].textContent.includes('此清单已删除') && !"+both+"[1].querySelector('[aria-label=事项名称]')");
      return;
    }
    await evaluate("document.querySelector('.todo-list-bar [aria-expanded]').click()");
    await evaluate("document.querySelector('[aria-label=上移工作]').click()");
    await wait("document.querySelector('.todo-order li span')?.textContent==='工作'");
    await capture('todo-order');
    await evaluate("document.querySelector('[aria-label=归档工作]').click()");
    await wait("document.querySelector('.todo-list-bar select').selectedOptions[0]?.textContent==='工作（已归档）' && !document.querySelector('.todo-row')");
    await capture('todo-archived');
    await evaluate("document.querySelector('[aria-label=恢复工作]').click()");
    await wait("document.querySelector('.todo-row input')?.checked && document.querySelector('.todo-list-bar select').selectedOptions[0]?.textContent==='工作'");
    await evaluate("document.querySelector('[aria-label=重命名工作]').click()");
    await wait("document.activeElement?.getAttribute('aria-label')==='新的清单名称'");
    await send('Input.insertText',{text:'项目'},sessionId);
    await press('Enter',13);
    await wait("document.querySelector('.todo-list-bar select').selectedOptions[0]?.textContent==='项目'");
    await evaluate("document.querySelector('.todo-list-bar [aria-expanded]').click()");
    await capture('todo-completed');
    const rowAction=async label=>{
      if(['详情','改名','移动','删除'].includes(label))await evaluate("document.querySelector('.todo-more').click()");
      await evaluate(`Array.from(document.querySelectorAll('.todo-view li button:enabled')).find(b=>b.textContent===${JSON.stringify(label)}).click()`);
    };
    await rowAction('详情');
    await evaluate("document.querySelector('.todo-details textarea').focus()");
    await send('Input.insertText',{text:'附原始附件'},sessionId);
    await evaluate("{const field=document.querySelector('.todo-details input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'2032-02-29');field.dispatchEvent(new Event('input',{bubbles:true}))}");
    await evaluate("const priority=document.querySelector('.todo-details select');priority.value='high';priority.dispatchEvent(new Event('change',{bubbles:true}))");
    await rowAction('保存详情');
    await wait("document.querySelector('.todo-row small')?.textContent==='2032-02-29 · 高优先级'");
    await rowAction('详情');
    await wait("document.querySelector('.todo-details textarea')?.value==='附原始附件'");
    await rowAction('取消');
    await wait("document.querySelector('.todo-filters [aria-pressed=true]')?.textContent==='已完成' && (()=>{const box=document.querySelector('.todo-row input[type=checkbox]:enabled');if(!box)return false;box.click();return true})()");
    await wait("document.querySelector('.todo-view').textContent.includes('尚无已完成事项')");
    const todoFilter=label=>evaluate(`Array.from(document.querySelectorAll('.todo-filters button')).find(b=>b.textContent===${JSON.stringify(label)}).click()`);
    await todoFilter('计划内');
    await wait("document.querySelector('.todo-row .todo-title strong')?.textContent==='整理资料'");
    const plannedOrigin=await evaluate('performance.timeOrigin');
    await send('Page.reload',{},sessionId);
    await wait("performance.timeOrigin!=="+plannedOrigin+" && document.querySelector('.todo-filters [aria-pressed=true]')?.textContent==='计划内' && !!document.querySelector('.todo-row')",{duringReload:true});
    assert.equal(await evaluate("document.querySelector('.todo-list-bar select').selectedOptions[0].textContent"),'项目');
    await rowAction('详情');
    await evaluate("{const field=document.querySelector('.todo-details input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,Temporal.Now.plainDateISO().toString());field.dispatchEvent(new Event('input',{bubbles:true}))}");
    await rowAction('保存详情');
    await wait("!!document.querySelector('.todo-row')");
    await todoFilter('今天');
    await wait("document.querySelector('.todo-row .todo-title strong')?.textContent==='整理资料'");
    await wait("document.querySelector('.todo-filters [aria-pressed=true]')?.textContent==='今天' && (()=>{const box=document.querySelector('.todo-row input[type=checkbox]:enabled');if(!box)return false;box.click();return true})()");
    await wait("document.querySelector('.todo-view').textContent.includes('今天没有到期事项')");
    await todoFilter('已完成');
    await wait("document.querySelector('.todo-row input[type=checkbox]')?.checked");
    await rowAction('改名');
    await evaluate("document.querySelector('[aria-label=修改事项名称]').select()");
    await send('Input.insertText',{text:'归档资料'},sessionId);
    await rowAction('保存');
    await wait("document.querySelector('.todo-view .todo-title strong')?.textContent==='归档资料'");
    await rowAction('删除');await rowAction('取消');
    await wait("document.querySelector('.todo-view .todo-title strong')?.textContent==='归档资料'");
    await rowAction('移动');
    await wait("document.querySelector('.todo-move select')?.value==='inbox'");
    await capture('todo-move');
    await rowAction('确认移动');
    await wait("document.querySelector('.todo-view').textContent.includes('尚无已完成事项')");
    await evaluate("document.querySelector('.todo-list-bar [aria-expanded]').click()");
    await evaluate("document.querySelector('[aria-label=删除清单项目]').click()");
    await rowAction('取消');
    await evaluate("document.querySelector('[aria-label=删除清单项目]').click()");
    await rowAction('确认删除');
    await wait("document.querySelector('.todo-list-bar select').selectedOptions[0]?.textContent==='全部清单' && !document.querySelector('[aria-label=删除清单项目]')");
    await evaluate("document.querySelector('.todo-list-bar [aria-expanded]').click()");
    await wait("document.querySelector('.todo-row .todo-title strong')?.textContent==='归档资料' && document.querySelector('.todo-row input:enabled')?.checked");
    await rowAction('删除');await rowAction('确认删除');
    await wait("document.querySelector('.todo-view').textContent.includes('尚无已完成事项')");
    return;
  }
  if(process.argv.includes('--calendar')){
    await evaluate("Array.from(document.querySelectorAll('.view-choice')).find(b=>b.querySelector('strong').textContent==='日程').click()");
    await wait("!!document.querySelector('.calendar-agenda')");
    if(process.argv.includes('--time-grid')){
      const w=(await evaluate("window.workspaces.list()"))[0];
      const v=Object.values(w.views)[0];
      const date='2031-05-05';
      for(const [method,input] of [
        ['createTimed',[crypto.randomUUID(),date,'设计评审','09:00',date,'10:30','Asia/Shanghai']],
        ['createTimed',[crypto.randomUUID(),date,'原型走查','09:30',date,'10:15','Asia/Shanghai']],
        ['createAllDay',[crypto.randomUUID(),date,'发布日']],
        ['createAllDay',[crypto.randomUUID(),'2031-05-12','下周交付']]
      ]){
        const request={workspaceId:w.id,viewId:v.id,service:'workbench.calendar.events',version:'1.0.0',method,input};
        await evaluate('window.viewServices.call('+JSON.stringify(request)+')');
      }
      await evaluate(`{const el=document.querySelector('.calendar-date-tools input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'2031-05-05');el.dispatchEvent(new Event('input',{bubbles:true}))}`);
      for(const [width,count] of [[1300,7],[900,5],[660,3]]){
        await send('Emulation.setDeviceMetricsOverride',{width,height:760,deviceScaleFactor:1,mobile:false},sessionId);
        await wait("document.querySelectorAll('.cal-day-track').length==="+count+" && document.querySelectorAll('.cal-day-track button').length===2");
        await capture('time-grid-'+count);
        const headingDate="document.querySelector('.calendar-date-tools input').value";
        await evaluate("document.querySelector('[aria-label=向后"+count+"天]').click()");
        await wait(headingDate+"==='2031-05-"+String(5+count).padStart(2,'0')+"'");
        await evaluate("document.querySelector('[aria-label=向前"+count+"天]').click()");
        await wait(headingDate+"==='2031-05-05' && document.querySelectorAll('.cal-day-track button').length===2");
      }
      await send('Emulation.setDeviceMetricsOverride',{width:790,height:760,deviceScaleFactor:1,mobile:false},sessionId);
      await wait("document.querySelectorAll('.cal-day-track').length===3");
      for(const target of ['2031-05-08','2031-05-11']){
        await evaluate("document.querySelector('[aria-label=向后3天]').click()");
        await wait("document.querySelector('.calendar-date-tools input').value==="+JSON.stringify(target));
      }
      await wait("document.querySelectorAll('.cal-allday .cal-page>div')[1]?.textContent==='下周交付'");
      for(const target of ['2031-05-08','2031-05-05']){
        await evaluate("document.querySelector('[aria-label=向前3天]').click()");
        await wait("document.querySelector('.calendar-date-tools input').value==="+JSON.stringify(target));
      }
      await send('Emulation.setDeviceMetricsOverride',{width:580,height:760,deviceScaleFactor:1,mobile:false},sessionId);
      await wait("document.querySelectorAll('.cal-day-track').length===1 && document.querySelectorAll('.cal-day-track button').length===2");
      const before=await evaluate("document.querySelector('.cal-timegrid').getBoundingClientRect().width");
      await evaluate("document.querySelector('.sidebar-control').click()");
      await wait("document.querySelector('.cal-timegrid').getBoundingClientRect().width>"+(before+100));
      await evaluate("document.querySelector('.sidebar-control').click()");
      await wait("document.querySelectorAll('.cal-day-track').length===1");
      await evaluate("document.querySelector('.cal-day-track button').click()");
      await wait("document.activeElement?.matches('.wb-record-dialog input')");
      return;
    }
    if(await evaluate("!!document.querySelector('.cal-timegrid')"))
      await evaluate("Array.from(document.querySelectorAll('.calendar-modes button')).find(b=>b.textContent==='日列表').click()");
    await wait("document.querySelector('.calendar-modes button:nth-child(2)').getAttribute('aria-pressed')==='true'");
    async function compose(index=0){
      await evaluate("document.querySelectorAll('.calendar-create')["+index+"].click()");
      await wait("document.activeElement?.getAttribute('aria-label')==='日程名称'");
    }
    if(process.argv.includes('--calendar-draft')){
      await compose();
      await evaluate("document.querySelector('.calendar-agenda form input').focus()");
      await send('Input.insertText',{text:'日程草稿验收'},sessionId);
      const click=label=>"Array.from(document.querySelectorAll('.draft-dialog button')).find(b=>b.textContent==="+JSON.stringify(label)+").click()";
      const originalDay=await evaluate("document.querySelector('.calendar-date-tools input').value");
      await evaluate("document.querySelector('[aria-label=下一周]').click()");
      await wait("!!document.querySelector('.draft-dialog[open]')");
      await evaluate(click('继续编辑'));
      assert.equal(await evaluate("document.querySelector('.calendar-date-tools input').value"),originalDay);
      await evaluate("document.querySelector('.jobs-link').click()");
      await wait("!!document.querySelector('.draft-dialog[open]')");
      await evaluate(click('继续编辑'));
      assert.equal(await evaluate("document.querySelector('.calendar-agenda form input').value"),'日程草稿验收');
      await evaluate("document.querySelector('.jobs-link').click()");
      await wait("!!document.querySelector('.draft-dialog[open]')");
      await evaluate(click('保存并继续'));
      await wait("!!document.querySelector('.job-center')");
      await evaluate("document.querySelector('.return-workspace').click()");
      await wait("document.querySelector('.calendar-event-row span')?.textContent==='日程草稿验收'");
      await evaluate("Array.from(document.querySelectorAll('.calendar-event-row button')).find(b=>b.textContent==='编辑').click()");
      await evaluate("document.querySelector('[aria-label=修改日程名称]').select()");
      await send('Input.insertText',{text:'放弃的改名'},sessionId);
      await evaluate("document.querySelector('[aria-label=月历]').click()");
      await wait("!!document.querySelector('.draft-dialog[open]')");
      await evaluate(click('继续编辑'));
      assert.equal(await evaluate("document.querySelector('[aria-label=修改日程名称]').value"),'放弃的改名');
      await evaluate("document.querySelector('.jobs-link').click()");
      await wait("!!document.querySelector('.draft-dialog[open]')");
      await evaluate(click('放弃并继续'));
      await wait("!!document.querySelector('.job-center')");
      await evaluate("document.querySelector('.return-workspace').click()");
      await wait("document.querySelector('.calendar-event-row span')?.textContent==='日程草稿验收'");
      await compose();
      await send('Input.insertText',{text:'切换前保存'},sessionId);
      await evaluate("document.querySelector('[aria-label=下一周]').click()");
      await wait("!!document.querySelector('.draft-dialog[open]')");
      await evaluate(click('保存并继续'));
      await wait("document.querySelector('.calendar-date-tools input').value!=="+JSON.stringify(originalDay));
      await wait("document.querySelector('.calendar-agenda').textContent.includes('当天没有日程')");
      await evaluate("document.querySelector('[aria-label=上一周]').click()");
      await wait("Array.from(document.querySelectorAll('.calendar-event-row span')).some(el=>el.textContent==='切换前保存')");
      return;
    }
    async function clickCalendarButton(label){
      const point=await evaluate(`(()=>{
        const button=Array.from(document.querySelectorAll('.calendar-agenda li button')).find(el=>el.textContent===${JSON.stringify(label)});
        if(!button)return null;
        button.scrollIntoView({block:'nearest',inline:'nearest'});
        const rect=button.getBoundingClientRect();
        const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
        return button.contains(document.elementFromPoint(x,y))?{x,y}:null;
      })()`);
      assert.ok(point,'Calendar button must be reachable: '+label);
      for(const type of ['mousePressed','mouseReleased']){
        await send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1},sessionId);
      }
    }
    async function reloadCalendar(){
      const origin=await evaluate("performance.timeOrigin");
      await send('Page.reload',{},sessionId);
      await wait("performance.timeOrigin!=="+origin+" && !!document.querySelector('.calendar-agenda')",{duringReload:true});
    }
    async function chooseDate(index,day){
      await evaluate(`{
        const field=document.querySelectorAll('.calendar-agenda input[type=date]')[${index}];
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(day)});
        field.dispatchEvent(new Event('input',{bubbles:true}));
      }`);
      await wait(`(async()=>Object.values((await window.workspaces.list())[0].views).some(view=>view.state.day===${JSON.stringify(day)}))()`);
    }
    if(process.argv.includes('--calendar-today')){
      await chooseDate(0,'2031-05-04');
      const days=[];
      for(const timezoneId of ['Pacific/Honolulu','Pacific/Kiritimati']){
        await send('Emulation.setTimezoneOverride',{timezoneId},sessionId);
        const localDay=await evaluate("Temporal.Now.plainDateISO().toString()");
        assert.equal(await evaluate("document.querySelector('.calendar-date-tools input').value"),days.at(-1)??'2031-05-04');
        await evaluate("document.querySelector('[aria-label=返回今天]').click()");
        await wait("document.querySelector('.calendar-date-tools input').value==="+JSON.stringify(localDay));
        days.push(localDay);
      }
      assert.notEqual(days[0],days[1]);
      await reloadCalendar();
      assert.equal(await evaluate("document.querySelector('.calendar-date-tools input').value"),days[1]);
      await capture('calendar-today');
      return;
    }
    await chooseDate(0,'2031-05-04');
    await evaluate("document.querySelector('[aria-label=下一周]').click()");
    await wait("document.querySelector('.calendar-date-tools input').value==='2031-05-11'");
    await evaluate("document.querySelector('[aria-label=上一周]').click()");
    await wait("document.querySelector('.calendar-date-tools input').value==='2031-05-04'");
    await evaluate("document.querySelector('.calendar-week button[aria-label=\"2031-04-28\"]').click()");
    await wait("document.querySelector('.calendar-date-tools input').value==='2031-04-28'");
    await chooseDate(0,'2031-05-04');
    await compose();
    await send('Input.insertText',{text:'团队评审'},sessionId);
    await press('Enter',13);
    await wait("document.querySelector('.calendar-event-row span')?.textContent==='团队评审'");
    await reloadCalendar();
    await wait("document.querySelector('.calendar-event-row span')?.textContent==='团队评审'");
    await evaluate("document.querySelector('[aria-label=左右切分]').click()");
    await wait("!!document.querySelector('.view-choice:enabled')");
    await evaluate("Array.from(document.querySelectorAll('.view-choice')).find(b=>b.querySelector('strong').textContent==='日程').click()");
    await wait("document.querySelectorAll('.calendar-agenda').length===2");
    if(await evaluate("!!document.querySelectorAll('.calendar-agenda')[1]?.querySelector('.cal-timegrid')")){
      await evaluate("Array.from(document.querySelectorAll('.calendar-agenda')[1].querySelectorAll('.calendar-modes button')).find(b=>b.textContent==='日列表').click()");
      await wait("!document.querySelectorAll('.calendar-agenda')[1]?.querySelector('.cal-timegrid')");
    }
    await chooseDate(1,'2031-05-05');
    await reloadCalendar();
    await wait("Array.from(document.querySelectorAll('.calendar-agenda input[type=date]'),e=>e.value).join(',')==='2031-05-04,2031-05-05'");
    await wait("document.querySelectorAll('.calendar-agenda')[1].textContent.includes('当天没有日程')");
    assert.equal(await evaluate("document.querySelector('.calendar-event-row span').textContent"),'团队评审');
    await clickCalendarButton('编辑');
    await evaluate("document.querySelector('[aria-label=修改日程名称]').select()");
    await send('Input.insertText',{text:'项目复盘'},sessionId);
    await press('Enter',13);
    await wait("document.querySelector('.calendar-event-row span')?.textContent==='项目复盘'");
    await reloadCalendar();
    await wait("document.querySelector('.calendar-event-row span')?.textContent==='项目复盘'");
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('.calendar-heading')).every(heading=>{
      const bounds=heading.getBoundingClientRect();
      const date=heading.nextElementSibling.querySelector('input').getBoundingClientRect();
      return getComputedStyle(heading).webkitAppRegion!=='drag' && date.top>=bounds.bottom&&date.right<=bounds.right+1;
    })`),'Calendar date field must fit its heading and remain outside window drag regions');
    await capture('calendar-agenda');
    await clickCalendarButton('编辑');
    await evaluate("{const field=document.querySelector('.calendar-agenda li input[type=date]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'2031-05-05');field.dispatchEvent(new Event('input',{bubbles:true}))}");
    await clickCalendarButton('保存');
    await wait("document.querySelectorAll('.calendar-agenda')[1].querySelector('.calendar-event-row span')?.textContent==='项目复盘'");
    await wait("document.querySelector('.calendar-agenda').textContent.includes('当天没有日程')");
    const clickDelete=()=>clickCalendarButton('删除');
    await clickDelete();
    await clickCalendarButton('取消');
    await wait("document.querySelector('.calendar-event-row span')?.textContent==='项目复盘'");
    await clickDelete();
    await clickCalendarButton('确认删除');
    await wait("Array.from(document.querySelectorAll('.calendar-agenda')).every(el=>el.textContent.includes('当天没有日程'))");
    await reloadCalendar();
    await wait("document.querySelectorAll('.calendar-agenda').length===2 && Array.from(document.querySelectorAll('.calendar-agenda')).every(el=>el.textContent.includes('当天没有日程'))");
    await compose();
    await evaluate("const select=document.querySelector('[aria-label=重复频率]');select.value='daily';select.dispatchEvent(new Event('change',{bubbles:true}))");
    await evaluate("const ending=document.querySelector('.calendar-rule select');ending.value='count';ending.dispatchEvent(new Event('change',{bubbles:true}))");
    await wait("document.querySelectorAll('.calendar-rule input[type=number]').length===2");
    await evaluate("document.querySelector('[aria-label=日程名称]').focus()");
    await send('Input.insertText',{text:'每日阅读'},sessionId);
    await press('Enter',13);
    const seriesVisible="Array.from(document.querySelectorAll('.calendar-agenda')).filter(el=>el.querySelector('.calendar-event-row span')?.textContent==='每日阅读').length===2";
    await wait(seriesVisible);
    await reloadCalendar();
    await wait(seriesVisible);
    await chooseDate(1,'2031-05-06');
    await wait("document.querySelectorAll('.calendar-agenda')[1].textContent.includes('当天没有日程')");
    const form=".calendar-agenda form";
    async function setValue(selector,value){
      await evaluate(`{
        const field=document.querySelector(${JSON.stringify(form+' '+selector)});
        const select=field instanceof HTMLSelectElement;
        Object.getOwnPropertyDescriptor(select?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});
        field.dispatchEvent(new Event(select?'change':'input',{bubbles:true}));
      }`);
    }
    await compose();
    await setValue('[aria-label=重复频率]','daily');
    await setValue('.calendar-rule input[type=number]','2');
    await setValue('.calendar-rule select','until');
    await setValue('.calendar-rule input[type=date]','2031-05-06');
    await setValue('[aria-label=日程名称]','隔天阅读');
    await evaluate("(document.querySelector('.calendar-compose form .plugin')??document.querySelector('.calendar-agenda li form .plugin')).click()");
    const lastOccurrence="document.querySelectorAll('.calendar-agenda')[1].textContent.includes('每 2 天 · 至 2031-05-06')";
    await wait(lastOccurrence);
    await reloadCalendar();
    await wait(lastOccurrence);
    await chooseDate(1,'2031-05-05');
    await wait("document.querySelectorAll('.calendar-agenda')[1].textContent.includes('每天 · 共 2 次') && !document.querySelectorAll('.calendar-agenda')[1].textContent.includes('隔天阅读')");
    await chooseDate(1,'2031-05-08');
    await wait("document.querySelectorAll('.calendar-agenda')[1].textContent.includes('当天没有日程')");
    await chooseDate(1,'2031-05-06');
    await wait(lastOccurrence);
    const seriesAction=async label=>{
      const pane="document.querySelectorAll('.calendar-agenda')[1]";
      const target=`Array.from(${pane}.querySelectorAll('li button')).find(button=>button.textContent===${JSON.stringify(label)})`;
      if(!await evaluate('!!'+target)){
        await evaluate(pane+".querySelector('.calendar-actions-toggle').click()");
        await wait('!!'+target);
      }
      await evaluate(target+'.click()');
    };
    assert.equal(await evaluate("document.querySelectorAll('.calendar-row-actions').length"),0);
    await seriesAction('编辑整组');
    await evaluate("document.querySelectorAll('.calendar-agenda')[1].querySelector('[aria-label=日程名称]').select()");
    await send('Input.insertText',{text:'隔天复盘'},sessionId);
    await press('Enter',13);
    const editedSeries="Array.from(document.querySelectorAll('.calendar-agenda')).filter(el=>el.textContent.includes('隔天复盘')).length===2";
    await wait(editedSeries);
    await reloadCalendar();
    await wait(editedSeries);

    await seriesAction('删除整组');
    await seriesAction('取消');
    await wait(editedSeries);
    await seriesAction('删除整组');
    await seriesAction('确认删除整组');
    const seriesRemoved="document.querySelectorAll('.calendar-agenda')[1]?.textContent.includes('当天没有日程') && document.querySelector('.calendar-agenda')?.textContent.includes('每日阅读') && !document.querySelector('.calendar-agenda')?.textContent.includes('隔天复盘')";
    await wait(seriesRemoved);
    await reloadCalendar();
    await wait(seriesRemoved);
    await chooseDate(1,'2031-05-05');
    await wait("document.querySelectorAll('.calendar-agenda')[1].textContent.includes('每日阅读')");
    await seriesAction('仅本次改期');
    await evaluate("{const field=document.querySelectorAll('.calendar-agenda')[1].querySelector('li input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'2031-05-03');field.dispatchEvent(new Event('input',{bubbles:true}))}");
    await seriesAction('保存改期');
    await wait(seriesRemoved);
    await chooseDate(1,'2031-05-03');
    await wait("document.querySelectorAll('.calendar-agenda')[1].textContent.includes('原定 2031-05-05')");
    await reloadCalendar();
    await wait("document.querySelectorAll('.calendar-agenda')[1].textContent.includes('原定 2031-05-05')");
    await seriesAction('仅取消本次');
    await seriesAction('确认取消本次');
    await wait(seriesRemoved);
    await reloadCalendar();
    await wait(seriesRemoved);
    await evaluate("document.querySelector('button[aria-label=月历]').click()");
    await wait("document.querySelector('.calendar-month-grid button[data-has-events=true]')?.textContent==='4'");
    await evaluate("document.querySelector('[aria-label=下一月]').click()");
    await wait("document.querySelector('.calendar-month-heading strong').textContent.includes('6 月')");
    await evaluate("document.querySelector('[aria-label=上一月]').click()");
    await wait("document.querySelector('.calendar-month-grid button[data-has-events=true]')?.textContent==='4'");
    await reloadCalendar();
    await wait("document.querySelectorAll('.calendar-month-grid').length===1 && document.querySelectorAll('.calendar-week').length===1");
    await capture('calendar-month');
    await evaluate("Array.from(document.querySelectorAll('.calendar-agenda')[1].querySelectorAll('button')).find(button=>button.textContent==='周列表').click()");
    await wait("document.querySelector('.calendar-week-list')?.textContent.includes('每日阅读')");
    await reloadCalendar();
    await wait("document.querySelector('.calendar-month-grid') && document.querySelector('.calendar-week-list h4')?.textContent.includes('2031-05-04')");
    await capture('calendar-week-overview');
    await compose();
    await setValue('[aria-label=日程类型]','timed');
    await setValue('[aria-label=开始时间]','23:00');
    await setValue('[aria-label=结束日期]','2031-05-05');
    await setValue('[aria-label=结束时间]','07:00');
    await setValue('[aria-label=日程名称]','夜间值班');
    await evaluate("(document.querySelector('.calendar-compose form .plugin')??document.querySelector('.calendar-agenda li form .plugin')).click()");
    await wait("document.querySelector('.calendar-agenda li strong')?.textContent==='夜间值班'");
    await chooseDate(0,'2031-05-05');
    await reloadCalendar();
    await wait("document.querySelector('.calendar-date-tools input').value==='2031-05-05' && document.querySelector('.calendar-agenda li')?.textContent.includes('23:00 – 2031-05-05 07:00')");
    await chooseDate(1,'2031-05-05');
    const changeReminder=value=>evaluate(`const select=document.querySelector('[aria-label=事件提醒]');select.value=${JSON.stringify(value)};select.dispatchEvent(new Event('change',{bubbles:true}))`);
    await changeReminder('10');
    const bothReminders=value=>`Array.from(document.querySelectorAll('.calendar-agenda')).every(p=>p.querySelector('[aria-label=事件提醒]')?.value===${JSON.stringify(value)})`;
    await wait(bothReminders('10'));
    await reloadCalendar();
    await wait(bothReminders('10'));
    await changeReminder('off');
    await wait(bothReminders('off'));
    await clickCalendarButton('编辑');
    await evaluate("{const field=document.querySelector('.calendar-agenda li input[type=time]:last-of-type');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'22:30');field.dispatchEvent(new Event('input',{bubbles:true}))}");
    await clickCalendarButton('保存修改');
    await wait("document.querySelector('.calendar-agenda li')?.textContent.includes('22:30 – 2031-05-05 07:00')");
    await reloadCalendar();
    await wait("document.querySelector('.calendar-agenda li')?.textContent.includes('22:30 – 2031-05-05 07:00')");
    await clickCalendarButton('删除');
    await clickCalendarButton('取消');
    await wait("document.querySelector('.calendar-agenda li strong')?.textContent==='夜间值班'");
    await clickCalendarButton('删除');
    await clickCalendarButton('确认删除');
    await wait("document.querySelector('.calendar-agenda').textContent.includes('当天没有日程')");
    await chooseDate(0,'2031-05-04');
    await reloadCalendar();
    await wait("document.querySelector('.calendar-agenda').textContent.includes('每日阅读') && !document.querySelector('.calendar-agenda').textContent.includes('夜间值班')");
    await compose();
    await setValue('[aria-label=日程类型]','timed');
    await setValue('[aria-label=开始时间]','23:00');
    await setValue('[aria-label=结束日期]','2031-05-05');
    await setValue('[aria-label=结束时间]','07:00');
    await setValue('[aria-label=重复频率]','weekly');
    await setValue('[aria-label=日程名称]','每周值班');
    await evaluate("(document.querySelector('.calendar-compose form .plugin')??document.querySelector('.calendar-agenda li form .plugin')).click()");
    await wait("document.querySelector('.calendar-agenda ul').textContent.includes('每周值班')");
    await chooseDate(0,'2031-05-12');
    await reloadCalendar();
    await wait("document.querySelector('.calendar-agenda .calendar-series')?.textContent.includes('2031-05-11 23:00 – 2031-05-12 07:00 · 每周')");
    assert.equal(await evaluate("document.querySelector('.calendar-agenda .calendar-series').textContent.includes('原定')"),false);
    await evaluate("document.querySelector('.calendar-agenda .calendar-actions-toggle').click()");
    await evaluate("{const reminder=document.querySelector('[aria-label=整组提醒]');reminder.value='10';reminder.dispatchEvent(new Event('change',{bubbles:true}))}");
    await wait("document.querySelector('[aria-label=整组提醒]:enabled')?.value==='10'");
    await reloadCalendar();
    await wait("!!document.querySelector('.calendar-series .calendar-actions-toggle')");
    await evaluate("document.querySelector('.calendar-series .calendar-actions-toggle').click()");
    await wait("document.querySelector('[aria-label=整组提醒]')?.value==='10'");
    await clickCalendarButton('仅本次改期');
    await wait("document.querySelector('.calendar-agenda li input[type=date]')?.value==='2031-05-11'");
    await evaluate("{const field=document.querySelector('.calendar-agenda li input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'2031-05-12');field.dispatchEvent(new Event('input',{bubbles:true}))}");
    await clickCalendarButton('保存改期');
    await wait("!document.querySelector('.calendar-agenda li input[type=date]')");
    await reloadCalendar();
    await wait("document.querySelector('.calendar-agenda .calendar-series')?.textContent.includes('2031-05-12 23:00 – 2031-05-13 07:00 · 每周 · 原定 2031-05-11')");
    await evaluate("document.querySelector('.calendar-agenda .calendar-actions-toggle').click()");
    await clickCalendarButton('编辑整组');
    await wait("document.querySelector('[aria-label=结束日期]').value==='2031-05-05'");
    await setValue('[aria-label=开始时间]','22:30');
    await evaluate("(document.querySelector('.calendar-compose form .plugin')??document.querySelector('.calendar-agenda li form .plugin')).click()");
    await wait("document.querySelector('.calendar-agenda .calendar-series')?.textContent.includes('2031-05-12 22:30 – 2031-05-13 07:00 · 每周 · 原定 2031-05-11')");
    await reloadCalendar();
    await wait("document.querySelector('.calendar-agenda .calendar-series')?.textContent.includes('2031-05-12 22:30 – 2031-05-13 07:00 · 每周 · 原定 2031-05-11')");
    await evaluate("document.querySelector('[aria-label=新建日历]').click()");
    await send('Input.insertText',{text:'工作'},sessionId);
    await evaluate("Array.from(document.querySelectorAll('.calendar-picker button')).find(b=>b.textContent==='创建日历').click()");
    await wait("document.querySelector('[aria-label=当前日历]').selectedOptions[0]?.textContent==='工作'");
    await compose();
    await setValue('[aria-label=日程名称]','部门评审');
    await evaluate("(document.querySelector('.calendar-compose form .plugin')??document.querySelector('.calendar-agenda li form .plugin')).click()");
    await wait("document.querySelector('.calendar-event-row span')?.textContent==='部门评审'");
    await reloadCalendar();
    await wait("Array.from(document.querySelectorAll('[aria-label=当前日历]'),el=>el.selectedOptions[0]?.textContent).join(',')==='工作,默认日历'");
    await wait("document.querySelector('.calendar-event-row span')?.textContent==='部门评审'");
    await chooseDate(1,'2031-05-12');
    await clickCalendarButton('移动到日历');
    await wait("document.querySelector('[aria-label=目标日历]').selectedOptions[0].textContent==='默认日历'");
    await clickCalendarButton('确认移动');
    const movedCalendar="!document.querySelectorAll('.calendar-agenda')[0].textContent.includes('部门评审') && document.querySelectorAll('.calendar-agenda')[1].textContent.includes('部门评审')";
    await wait(movedCalendar);
    await reloadCalendar();
    await wait(movedCalendar);
    return;
  }
  await capture('choose-view');
  await checkControls('choose-view',[['button',/^配色板/],['button',/^计数器/],['button',/^计数概览/],['button',/^左右切分$/]]);
  await wait("document.activeElement===document.querySelector('.view-choice')");
  for(let i=0;i<10&&!await evaluate("document.activeElement.textContent.includes('配色板')");i++)await press('Tab',9);
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
  assert.ok(await evaluate(`(()=>{
    const probe=document.createElement('section');
    document.querySelector('.tally-view').append(probe);
    try {
      const initial=[getComputedStyle(probe).marginTop,getComputedStyle(probe).borderTopWidth];
      probe.className='palette-result';
      const style=getComputedStyle(probe);
      return style.marginTop===initial[0] && style.borderTopWidth===initial[1];
    } finally {probe.remove();}
  })()`),'Palette styles leaked into the sibling counter view');
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
