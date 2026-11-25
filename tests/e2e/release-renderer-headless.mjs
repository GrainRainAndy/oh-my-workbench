// Run shipped renderer assets against the packaged SQLite repository through a test bridge.
import assert from 'node:assert/strict';
import {fork,spawn} from 'node:child_process';
import {once} from 'node:events';
import {cp,mkdir,mkdtemp,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';

if(!process.argv[2])throw Error('Pass a packaged .app path');
const app=resolve(process.argv[2],'Contents/Resources/app');
const assets=join(app,'apps/desktop/dist');
const profile=await mkdtemp(join(tmpdir(),'workbench-release-renderer-'));
const load=file=>import(pathToFileURL(join(app,file)).href);
const {exportJobResult}=await load('apps/desktop/export.cjs');
let destinationAttempt=0;
const {openRepository}=await load('packages/host-core/src/workspace/repository.cjs');
const {validateWorkspace}=await load('apps/desktop/dist-main/workspace.mjs');
const {openPlugins}=await load('packages/host-core/src/runtime/plugins.cjs');
const repository=openRepository(join(profile,'workspaces.sqlite'),validateWorkspace);
let scannedPlugins;
const scanDirectory=join(profile,'scan');
const plugins=openPlugins(join(app,'plugins'),join(profile,'plugins.sqlite'));
const {createServices}=await load('packages/host-core/src/runtime/services.cjs');
const transport=join(profile,'node-parent-port.cjs');
await writeFile(transport,`process.parentPort={
  postMessage:message=>process.send(message),
  on:(event,listener)=>process.on(event,data=>listener({data}))
};`);
const workerExits=new Set();
const serviceRuntime=createServices({plugins,fork(id){
  const child=fork(join(app,'apps/desktop/service-worker.cjs'),[plugins.backend(id),join(profile,id)],{
    execArgv:['--require',transport],stdio:['ignore','ignore','ignore','ipc']
  });
  const exit=once(child,'exit');
  workerExits.add(exit);
  exit.then(()=>workerExits.delete(exit));
  child.postMessage=message=>child.send(message);
  return child;
}});
const result=Promise.withResolvers();
const prefix='/'+crypto.randomUUID()+'/';

const timedScenario=process.argv.includes('--timed');
const retryScenario=timedScenario||process.argv.includes('--read-retry');
const jobScenario=process.argv.includes('--job-center');
const compactScenario=process.argv.includes('--compact-ui');
const evidenceDirectory=process.env.WORKBENCH_UI_EVIDENCE;
if(evidenceDirectory)await mkdir(evidenceDirectory,{recursive:true});
const releaseExport=Promise.withResolvers();
let jobStore,cancelRequests=0,dispatches=0;
if(!jobScenario&&!retryScenario&&!compactScenario){
  const {openJobs}=await load('packages/host-core/src/jobs/registry.cjs');
  jobStore=openJobs(join(profile,'jobs.sqlite'),{execute:async(owner,definition,input)=>{
    const css=await serviceRuntime.call(owner,{...definition,input});
    await releaseExport.promise;
    return css;
  }});
}
if(jobScenario){
  const {openJobs}=await load('packages/host-core/src/jobs/registry.cjs');
  const {ConfirmedCancellation,NotDispatched}=await load('packages/host-core/src/runtime/dispatch-error.cjs');
  const file=join(profile,'jobs.sqlite');
  const open=()=>openJobs(file,{execute:(_owner,job,input,signal,progress)=>{
    dispatches++;
    if(job.type==='unavailable')throw new NotDispatched('服务未启用');
    progress(42);
    return new Promise((_resolve,reject)=>signal?.addEventListener('abort',()=>reject(new ConfirmedCancellation())));
  }});
  jobStore=open();
  jobStore.submit('fixture.palette',{type:'interrupted',title:'中断的导出 '+ 'workspace-export-'.repeat(8)},'original',[]);
  await new Promise(done=>setImmediate(done));
  jobStore.close();
  jobStore=open();
  jobStore.submit('fixture.palette',{type:'unavailable',title:'未派发的导出'},'unavailable',[]);
  jobStore.submit('fixture.palette',{type:'active',title:'可取消的导出',cancellable:true},'active',[]);
}


for(const id of ['fixture.css','workbench.calendar','workbench.todo','workbench.launcher']){
  await mkdir(join(profile,id));
}

function businessRecords(){
  return [['calendar','events'],['todo','items']].map(([folder,table])=>{
    const db=new DatabaseSync(join(profile,'workbench.'+folder,folder+'.sqlite'),{readOnly:true});
    try{return db.prepare('SELECT id,title FROM '+table+' ORDER BY id').all();}
    finally{db.close();}
  });
}
let recordsBeforeReload;

function bridge(retryScenario,jobScenario,timedScenario,compactScenario,captureEvidence){
  const request=async(method,input)=>{
    const response=await fetch(method,{method:'POST',body:JSON.stringify(input??null)});
    if(!response.ok)throw Error('Fixture bridge failed: '+method);
    return response.json();
  };
  window.workspaces={list:()=>request('list'),save:input=>request('save',input)};
  window.plugins={list:()=>request('plugins'),safeMode:async()=>false,setEnabled:(id,enabled)=>request('enable',{id,enabled})};
  async function until(get){
    for(let attempt=0;attempt<200;attempt++){
      const value=get();if(value)return value;
      await new Promise(done=>setTimeout(done,30));
    }
    throw Error('Missing '+get);
  }
  async function run(){
    if(document.querySelector('script[src$="initial-appearance.js"]')){
      const expected=sessionStorage.getItem('phase')?'dark':'light';
      const background=expected==='dark'?'rgb(28, 28, 30)':'rgb(240, 241, 244)';
      if(document.querySelector('#root')||document.documentElement.dataset.appearance!==expected||
        getComputedStyle(document.documentElement).backgroundColor!==background)throw Error('Incorrect pre-render appearance: '+expected);
    }
    const button=selector=>until(()=>document.querySelector(selector)).catch(()=>{throw Error('Missing '+selector);});
    async function appearanceMode(mode){
      (await button('.settings-link')).click();
      const picker=await button('.settings-dialog select[aria-label="外观"]');
      if(mode&&picker.value!==mode){
        picker.value=mode;
        picker.dispatchEvent(new Event('change',{bubbles:true}));
      }
      const selected=picker.value;
      document.querySelector('.settings-close').click();
      await until(()=>!document.querySelector('.settings-dialog'));
      return selected;
    }
    async function contextAction(target,label){
      target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:120,clientY:120}));
      (await until(()=>Array.from(document.querySelectorAll('.action-menu button')).find(b=>b.textContent===label))).click();
    }
    if(compactScenario){
      if(innerWidth!==660||innerHeight!==460)throw Error('Unexpected compact viewport '+innerWidth+'×'+innerHeight);
      const menu=await button('.sidehead button');
      const mark=document.querySelector('.brand img');
      if(!mark||mark.alt!=='')throw Error('Sidebar is missing the app mark');
      await mark.decode();
      if(mark.naturalWidth!==64||mark.naturalHeight!==64)throw Error('Sidebar app mark did not load at Retina resolution');
      menu.focus();menu.click();
      const dialog=await button('dialog[open]');
      const name=dialog.querySelector('input');
      const setValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      setValue.call(name,'跨部门季末复盘与后续事项'.repeat(6));
      name.dispatchEvent(new Event('input',{bubbles:true}));
      await until(()=>!dialog.querySelector('.plugin').disabled);
      dialog.querySelector('form').requestSubmit();
      const choice=await button('.pane[data-active] .view-choice:enabled');
      await until(()=>document.activeElement===choice);
      const tools=()=>Array.from(document.querySelectorAll('.panehead .actions'));
      const tooltip=(bar,name)=>bar.querySelector('button[aria-label="'+name+'"]');
      for(const [index,label] of [[0,'左右切分'],[0,'上下切分'],[2,'上下切分'],
        [0,'左右切分'],[2,'左右切分'],[4,'左右切分'],[6,'左右切分']]){
        const count=tools().length;
        const split=tooltip(tools()[index],label);
        split.focus();split.click();
        await until(()=>tools().length===count+1&&document.activeElement.matches('.pane[data-active] .view-choice:enabled'));
      }
      const divider=await button('.canvas > .split > [role=separator]');
      divider.focus();
      for(let index=0;index<2;index++)divider.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
      await until(()=>divider.getAttribute('aria-valuenow')==='60');
      divider.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
      await until(()=>divider.getAttribute('aria-valuenow')==='50');
      for(const theme of ['dark','system','light']){
        await appearanceMode(theme);
        if(document.documentElement.dataset.appearance!==theme)throw Error('Theme change not reflected');
        const brandBox=mark.closest('.brand').getBoundingClientRect(),markBox=mark.getBoundingClientRect();
        if(markBox.width!==34||markBox.height!==34||markBox.left<brandBox.left||markBox.right>brandBox.right)
          throw Error('Sidebar app mark is clipped in '+theme);
        for(const bar of tools()){
          for(const label of ['左右切分','上下切分']){
            const split=tooltip(bar,label);
            split.focus();
            const box=split.getBoundingClientRect(),pane=bar.closest('.pane').getBoundingClientRect();
            await until(()=>getComputedStyle(bar).opacity==='1');
            if(box.left<pane.left||box.right>pane.right||box.bottom>pane.bottom)
              throw Error('Compact pane split action clipped');
          }
        }
      }
      if(captureEvidence)await request('capture',{name:'compact-eight-panes',width:660,height:460});
      const zoom=tooltip(tools()[7],'放大窗格');
      zoom.click();
      await until(()=>document.querySelector('.pane[data-maximized]'));
      zoom.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      await until(()=>document.activeElement===zoom&&!document.querySelector('.pane[data-maximized]'));
      window.jobs={list:async()=>[],watch:()=>()=>{}};
      const trigger=await button('.jobs-link');
      trigger.focus();trigger.click();
      (await button('.return-workspace')).click();
      await until(()=>document.activeElement===trigger);
      const [saved]=await window.workspaces.list();
      if(Object.keys(saved.views).length!==0||tools().length!==8)throw Error('Zoom or service navigation changed saved layout');
      await request('done',{compact:true});return;
    }
    if(jobScenario){
      let changed;
      window.jobs={
        list:()=>request('jobs-list'),
        watch:callback=>{changed=callback;return ()=>{changed=null;};},
        cancel:async id=>{await request('jobs-cancel',id);changed?.();}
      };
      (await button('.jobs-link')).click();
      const unknown=await button('.job-uncertain');
      const card=unknown.closest('.job-card');
      card.style.maxWidth='320px';
      const status=card.querySelector('[data-status]'),owner=card.querySelector('.job-owner');
      if(card.scrollWidth>card.clientWidth||status.getBoundingClientRect().right>card.getBoundingClientRect().right)
        throw Error('Long job title displaced the status');
      if(getComputedStyle(owner).backgroundColor===getComputedStyle(status).backgroundColor||
        parseFloat(getComputedStyle(owner).paddingInlineStart)>0)throw Error('Owner metadata inherits status badge styling');
      if(!unknown.textContent.includes('42%')||unknown.querySelector('button'))throw Error('Unexpected action or progress on unknown receipt');
      unknown.querySelector('summary').click();
      if(!unknown.querySelector('details').open||!unknown.querySelector('code').textContent)throw Error('Missing receipt details');
      await until(()=>document.querySelector('.job-reason')?.textContent==='服务未启用');
      (await button('.cancel-job')).click();
      (await button('.job-cancel-confirm button')).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      const cancelTrigger=await button('.cancel-job');
      await until(()=>document.activeElement===cancelTrigger);
      if(!(await request('jobs-list')).some(j=>j.status==='running'))throw Error('Dismissed cancellation changed the running job');
      (await button('.cancel-job')).click();
      (await button('.confirm-cancel')).click();
      await until(()=>document.querySelector('[data-status=cancelled]'));
      (await button('.return-workspace')).click();
      await button('.welcome-starters');
      (await button('.jobs-link')).click();
      await until(()=>document.querySelector('[data-status=cancelled]')&&document.querySelector('[data-status=unknown]'));
      let upgradeOwner;
      Object.assign(window.plugins,{issues:async()=>[],watchIssues:()=>()=>{},
        upgrade:async id=>{upgradeOwner=id;return '已是最新版本';}});
      window.backups={list:async()=>[]};
      let attempts=0;
      window.desktopPreferences={read:async()=>({tray:true,shortcut:''}),loginStatus:async()=>false,
        async setTray(tray){if(++attempts===1)throw Error('系统设置写入失败');return {tray,shortcut:''};}};
      (await button('.manage-link')).click();
      const tray=await button('[aria-label=显示菜单栏图标]');
      tray.click();
      await until(()=>document.querySelector('.desktop-settings [role=alert]'));
      if(tray.getAttribute('aria-checked')!=='true')throw Error('Failed setting changed the visible preference');
      tray.click();
      await until(()=>tray.getAttribute('aria-checked')==='false'&&document.querySelector('.desktop-settings [role=status]')?.textContent.includes('已保存'));
      const calendar=await until(()=>Array.from(document.querySelectorAll('.manager-list article')).find(el=>el.querySelector('h2')?.textContent.includes('日程')));
      await contextAction(calendar,'检查数据升级');
      await until(()=>upgradeOwner==='workbench.calendar'&&calendar.textContent.includes('已是最新版本'));
      await request('done',{cancelled:true});return;
    }
    if(retryScenario){
      const failed=new Set(),listeners=new Map(),todoRequests=[];
      let failTodoWrite=true,failLibraryWrite=false;
      window.desktopLauncher={choose:async({kind})=>({id:'retained-folder',kind,label:'跨窗格资料'})};
      const restoring=sessionStorage.getItem('businessPhase')==='restore';
      window.viewServices={
        watch(service,version,callback){
          const group=listeners.get(service)??new Set();
          listeners.set(service,group);group.add(callback);
          return ()=>group.delete(callback);
        },
        async call(payload){
          const {service,method}=payload;
          if(restoring&&['listRange','list'].includes(method)&&!failed.has(method)){
            failed.add(method);throw Error('Injected read failure');
          }
          if(service==='workbench.launcher.library'&&method==='change'&&failLibraryWrite){
            failLibraryWrite=false;throw Error('Injected library write failure');
          }
          if(method==='createWithDetails'){
            todoRequests.push(payload.input[0]);
            if(failTodoWrite){failTodoWrite=false;throw Error('Injected write failure');}
          }
          const value=await request('service',payload);
          if(!['read','listRange','listCalendars','lists','list','listItems'].includes(method)){
            for(const notify of listeners.get(service)??[])notify();
          }
          return value;
        }
      };
      const scenarios=[
        {title:'日程',container:'.calendar-agenda',field:'日程名称',value:'发布验收会议',row:timedScenario?'.calendar-agenda li > strong':'.calendar-event-row span'},
        {title:'待办',container:'.todo-view',field:'事项名称',value:'核对发布清单',row:'.todo-row .todo-title strong'}
      ];
      if(!restoring)(await button('.welcome-starters button')).click();
      const sidebar=await button('.sidebar-resize');
      if(!restoring){
        const previous=Number(sidebar.getAttribute('aria-valuenow'));
        sidebar.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
        await until(()=>sidebar.getAttribute('aria-valuenow')===String(previous+8));
        sessionStorage.setItem('expected-sidebar',String(previous+8));
      }else if(sidebar.getAttribute('aria-valuenow')!==sessionStorage.getItem('expected-sidebar')){
        throw Error('Sidebar width lost after reload');
      }
      if(!restoring){
        const split=await button('.panehead [aria-label=左右切分]');
        split.focus();
        await until(()=>getComputedStyle(split.closest('.actions')).opacity==='1');
        split.click();
        const picker=await button('.pane[data-active] .view-choice');
        await until(()=>document.activeElement===picker);
        const [splitWorkspace]=await window.workspaces.list();
        if(splitWorkspace.layout.second.viewInstanceId)throw Error('Split must persist an empty pane');
        (await button('.view-choice[aria-label=快捷入口]')).click();
        await until(()=>document.querySelectorAll('.launcher').length===2);
        const [firstLauncher,secondLauncher]=document.querySelectorAll('.launcher');
        await until(()=>[firstLauncher,secondLauncher].every(view=>view.querySelector('.wb-add:enabled')));
        for(const view of [firstLauncher,secondLauncher]){
          if(view.querySelector('h3,.launch-grid')||view.querySelector('.launch-empty')?.textContent!=='用加号添加入口')
            throw Error('Empty launcher should give one hint and omit empty groups');
        }
        const openPins=async launcher=>{
          const add=await until(()=>launcher.querySelector('.wb-add:enabled'));
          add.click();
          return until(()=>launcher.querySelector('.launch-add-dialog[open]'));
        };
        const checks=dialog=>[...dialog.querySelectorAll('input[type=checkbox]')];
        let pins=await openPins(firstLauncher);
        if(checks(pins).length<2||checks(pins).some(input=>input.checked)||firstLauncher.querySelector('[data-kind=view]'))
          throw Error('New library includes default pins');
        checks(pins)[0].click();
        pins.querySelector('.launch-footer button').click();
        await until(()=>!document.querySelector('.launch-add-dialog'));
        if(firstLauncher.querySelector('[data-kind=view]'))throw Error('Cancel changed pinned views');
        pins=await openPins(firstLauncher);
        for(const label of pins.querySelectorAll('.launch-options label')){
          if(['待办','日程'].includes(label.textContent))label.querySelector('input').click();
        }
        failLibraryWrite=true;
        pins.querySelector('.launch-footer .plugin').click();
        await until(()=>pins.querySelector('[role=alert]')&&!pins.querySelector('.plugin').disabled);
        if(checks(pins).filter(input=>input.checked).length!==2||
          firstLauncher.querySelector('[data-kind=view]')||secondLauncher.querySelector('[data-kind=view]'))
          throw Error('Failed library write lost the draft or exposed uncommitted pins');
        pins.querySelector('.launch-footer .plugin').click();
        await until(()=>[firstLauncher,secondLauncher].every(view=>view.querySelectorAll('[data-kind=view]').length===2));
        for(const view of [firstLauncher,secondLauncher]){
          if([...view.querySelectorAll('h3')].map(heading=>heading.textContent).join()!=='插件'||view.querySelector('.launch-empty'))
            throw Error('Plugin-only launcher shows an empty locations group');
        }
        const dialog=await openPins(secondLauncher);
        dialog.querySelectorAll('input[type=radio]')[2].click();
        await until(()=>dialog.querySelector('.launch-footer .plugin').textContent.includes('选择文件夹'));
        dialog.querySelector('.launch-footer .plugin').click();
        await until(()=>[firstLauncher,secondLauncher].every(view=>view.querySelector('[data-kind=folder]')?.textContent==='跨窗格资料'));
        const [beforeClose]=await window.workspaces.list();
        secondLauncher.closest('.pane').querySelector('[aria-label=关闭窗格]').click();
        await until(()=>document.querySelectorAll('.launcher').length===1);
        (await button('.panehead [aria-label=左右切分]:enabled')).click();
        (await button('.view-choice[aria-label=快捷入口]:enabled')).click();
        await until(()=>document.querySelectorAll('.launcher [data-kind=folder]').length===2);
        const [reopened]=await window.workspaces.list();
        if(beforeClose.layout.second.viewInstanceId===reopened.layout.second.viewInstanceId||
          document.querySelectorAll('.launcher [data-kind=view]').length!==4)throw Error('Reopened pane did not restore the library');
      }
      if(restoring){
        await button('.launcher .wb-add:enabled');
        const launcher=document.querySelector('.launcher');
        const folders=[...launcher.querySelectorAll('[data-kind=folder]')].map(tile=>tile.textContent);
        if(launcher.querySelector('[data-kind=view]')||!folders.includes('跨窗格资料')||!folders.includes('旧布局资料'))
          throw Error('Local library did not restore or migrate the legacy layout after worker restart');
      }
      for(const {title,container,field,value,row} of scenarios){
        if(restoring){
          const retry=await button(container+' .plugin-read-error button');
          const saved=JSON.stringify(await window.workspaces.list());
          retry.click();
          await until(()=>[...document.querySelectorAll(row)].some(el=>el.textContent===value)&&!document.querySelector(container+' .plugin-read-error'));
          if(saved!==JSON.stringify(await window.workspaces.list()))throw Error('Retry changed persisted view state');
          if(title==='待办'){
            const created=[...document.querySelectorAll('.todo-title')].find(button=>button.querySelector('strong')?.textContent===value);
            created.click();
            const detail=await button('.todo-details');
            if(detail.querySelector('textarea').value!=='复核签核附件'||detail.querySelector('input[type=date]').value!=='2032-02-29'||
              detail.querySelector('select').value!=='high')throw Error('Quick-entry details did not survive reopening');
            [...detail.querySelectorAll('button')].find(button=>button.textContent==='取消').click();
          }
        }else{
          const tile=await until(()=>Array.from(document.querySelectorAll('.launch-tile')).filter(b=>b.textContent===title).at(-1));
          if(title==='日程'){
            const saved=await window.workspaces.list();
            const save=window.workspaces.save;
            window.workspaces.save=async()=>{
              window.workspaces.save=save;
              throw Error('存储空间不足');
            };
            tile.click();
            const retry=await until(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='重试保存布局'));
            if(document.querySelectorAll('.launcher').length!==2||!document.querySelector('.launcher')||
              JSON.stringify(saved)!==JSON.stringify(await window.workspaces.list()))throw Error('Failed launch changed workspace');
            retry.click();
            await button('.calendar-create');
            const [recovered]=await window.workspaces.list();
            if(recovered.layout.second.paneId!==saved[0].layout.second.paneId||document.querySelectorAll('.launcher').length!==1||Object.keys(recovered.views).length!==2||document.querySelectorAll('.pane').length!==2)
              throw Error('Layout retry did not create exactly one view');
          }else await contextAction(tile,'在旁边打开');
          let alternateCalendar,alternateDay;
          if(title==='日程'){
            if(!timedScenario){
              const [workspace]=await window.workspaces.list();
              const view=Object.values(workspace.views).find(view=>view.pluginId==='workbench.calendar');
              alternateCalendar=crypto.randomUUID();
              await window.viewServices.call({workspaceId:workspace.id,viewId:view.id,service:'workbench.calendar.events',
                version:'1.0.0',method:'createCalendar',input:[alternateCalendar,'交付日历']});
            }
            const add=await button('.calendar-create');
            add.click();
            const card=await button('.calendar-compose[open]');
            const name=card.querySelector('[aria-label="日程名称"]');
            const rect=card.getBoundingClientRect();
            const anchor=add.getBoundingClientRect();
            if(document.activeElement!==name||!card.querySelector('[aria-label="保存到日历"]')||
              card.querySelector('[aria-label="开始日期"]').value!==document.querySelector('.calendar-date-tools input').value||
              rect.left<0||rect.top<0||rect.bottom>innerHeight+1||Math.abs(rect.right-anchor.right)>20)
              throw Error('New event card is not anchored, focused or initialized with the browsed date');
            if(timedScenario&&captureEvidence)await request('capture',{name:'calendar-create-card',width:innerWidth,height:innerHeight});
          }else{
            const add=await button('.todo-view .wb-add:enabled');
            const addIcon=add.querySelector('svg').innerHTML;
            if(document.querySelector('[aria-label="事项名称"]'))throw Error('Composer opened by default');
            add.click();
            const entry=await button('[aria-label="事项名称"]');
            if(document.activeElement!==entry||entry.closest('.todo-composer').getAnimations().length)
              throw Error('Keyboard composer focus or motion differs from review');
            if(add.querySelector('svg').innerHTML!==addIcon)
              throw Error('The new-item shortcut looks like a cancel action while editing');
            entry.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
            await until(()=>!document.querySelector('.todo-composer'));
            await until(()=>document.activeElement===add);
            add.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true,cancelable:true}));
            const pointerEntry=await button('[aria-label="事项名称"]');
            const animation=pointerEntry.closest('.todo-composer').getAnimations()[0];
            if(document.activeElement!==pointerEntry||animation?.effect.getTiming().duration!==140)
              throw Error('Pointer composer did not use the reviewed 140ms fade');
          }
          if(title==='日程'&&!timedScenario){
            const type=await button('[aria-label="日程类型"]');
            type.value='allDay';type.dispatchEvent(new Event('change',{bubbles:true}));
            await until(()=>!document.querySelector('[aria-label="开始时间"]'));
            const destination=await button('[aria-label="保存到日历"]');
            await until(()=>[...destination.options].some(option=>option.value===alternateCalendar));
            destination.value=alternateCalendar;
            destination.dispatchEvent(new Event('change',{bubbles:true}));
            const start=await button('[aria-label="开始日期"]');
            alternateDay=Temporal.PlainDate.from(start.value).add({days:2}).toString();
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(start,alternateDay);
            start.dispatchEvent(new Event('input',{bubbles:true}));
          }
          const input=await button('[aria-label="'+field+'"]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
          input.dispatchEvent(new Event('input',{bubbles:true}));
          if(title==='日程')await until(()=>!input.form.querySelector('button.plugin').disabled);
          if(title==='待办'){
            if(input.form.querySelector('button:not([type]),button[type=submit]'))
              throw Error('Inline todo creation still requires a visible submit control');
            const setField=(target,prototype,value)=>{
              Object.getOwnPropertyDescriptor(prototype,'value').set.call(target,value);
              target.dispatchEvent(new Event(target instanceof HTMLSelectElement?'change':'input',{bubbles:true}));
            };
            const note=await button('[aria-label="新待办备注"]');
            note.focus();
            setField(note,HTMLTextAreaElement.prototype,'复核签核附件');
            if(todoRequests.length)throw Error('Moving between inline fields committed too early');
            (await button('[aria-label="设置到期日"]')).click();
            const tomorrow=await until(()=>[...input.form.querySelectorAll('button')].find(button=>button.textContent==='明天'));
            tomorrow.click();
            await until(()=>!input.form.querySelector('[aria-label="新待办到期日"]'));
            if(document.activeElement!==input||todoRequests.length)
              throw Error('Date preset required confirmation or prematurely saved the item');
            (await button('[aria-label="设置到期日"]')).click();
            const due=await button('[aria-label="新待办到期日"]');
            if(document.activeElement!==due)throw Error('Date control did not take focus');
            setField(due,HTMLInputElement.prototype,'2032-02-29');
            const priority=await button('[aria-label="新待办优先级"]');
            priority.focus();
            setField(priority,HTMLSelectElement.prototype,'high');
            await until(()=>note.value==='复核签核附件');
            if(timedScenario&&captureEvidence)await request('capture',{name:'todo-quick-entry',width:innerWidth,height:innerHeight});
            input.focus();
            input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
            const enter=()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
            enter();
            if(todoRequests.length)throw Error('Composition submitted an unfinished title');
            input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
            enter();
            await until(()=>input.getAttribute('aria-invalid')==='true'&&!input.readOnly);
            if(input.value!==value||document.activeElement!==input||note.value!=='复核签核附件'||
              !input.form.querySelector('[aria-label="设置到期日"]').textContent.includes('2032-02-29')||
              priority.value!=='high')
              throw Error('Todo failure lost quick-entry details or focus');
            if(timedScenario)enter();
            else (await button('.todo-view .wb-add:enabled')).click();
          }else input.form.requestSubmit();
          if(title==='日程'){
            await until(()=>!document.querySelector('.calendar-compose'));
            if(alternateCalendar){
              async function persistedSelection(key,value){
                for(let attempt=0;attempt<60;attempt++){
                  const [workspace]=await window.workspaces.list();
                  const view=Object.values(workspace.views).find(view=>view.pluginId==='workbench.calendar');
                  if(view.state[key]===value)return;
                  await new Promise(done=>setTimeout(done,30));
                }
                throw Error('Calendar selection failed to persist '+key);
              }
              const calendar=await button('[aria-label="当前日历"]');
              if(calendar.value===alternateCalendar)throw Error('Creating in another calendar changed the workspace filter');
              calendar.value=alternateCalendar;calendar.dispatchEvent(new Event('change',{bubbles:true}));
              await persistedSelection('calendarId',alternateCalendar);
              await until(()=>!calendar.disabled);
              const date=await button('.calendar-date-tools input');
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(date,alternateDay);
              date.dispatchEvent(new Event('input',{bubbles:true}));
              await persistedSelection('day',alternateDay);
              await until(()=>!date.disabled);
            }
            document.querySelector('.calendar-modes button:nth-child(2)').click();
          }else{
            await until(()=>input.value===''&&!input.readOnly);
            if(todoRequests.length!==2||todoRequests[0]!==todoRequests[1]||document.activeElement!==input)
              throw Error('Retry changed request identity or lost focus');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'继续录入第二项');
            input.dispatchEvent(new Event('input',{bubbles:true}));
            document.querySelector('.todo-filters button:last-child').click();
            const keep=await until(()=>[...document.querySelectorAll('.draft-dialog[open] button')].find(button=>button.textContent==='继续编辑'));
            keep.click();
            await until(()=>!document.querySelector('.draft-dialog[open]'));
            if(input.value!=='继续录入第二项'||todoRequests.length!==2)
              throw Error('List navigation lost or saved a draft without confirmation');
            input.focus();
            const existing=await button('.todo-title');
            if(timedScenario)existing.focus();
            else existing.closest('li').click();
            await until(()=>!input.isConnected&&document.querySelectorAll('.todo-title').length===2);
            if(todoRequests.length!==3||(timedScenario&&document.activeElement!==existing))
              throw Error('Leaving the inline todo row duplicated the write or moved focus');
          }
          await until(()=>[...document.querySelectorAll(row)].some(el=>el.textContent===value));
          await contextAction([...document.querySelectorAll(row)].find(el=>el.textContent===value),title==='日程'?'删除':'改名');
          const activeForm=await button(title==='日程'?'.calendar-delete':'.todo-view li form');
          Array.from(activeForm.querySelectorAll('button')).find(b=>b.textContent==='取消').click();
          await until(()=>[...document.querySelectorAll(row)].some(el=>el.textContent===value));
          if(title==='日程'){
            const modes=document.querySelector('.calendar-modes');
            const [timeline,list,weekList,month]=modes.querySelectorAll('button');
            if(weekList.textContent!=='周列表'||modes.contains(document.querySelector('[aria-label="返回今天"]')))
              throw Error('Calendar modes and date navigation overlap');
            weekList.click();
            await button('.calendar-week-list');
            await until(()=>weekList.getAttribute('aria-pressed')==='true');
            for(const mode of [weekList,month]){
              mode.click();
              await until(()=>!mode.disabled&&mode.getAttribute('aria-pressed')==='true');
              mode.click();
              await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
              if(mode.disabled||mode.getAttribute('aria-pressed')!=='true')
                throw Error('Reselecting a calendar mode changed the active view');
            }
            timeline.click();
            let grid=await button('.cal-timegrid');
            const divider=await button('.split > [role=separator]');
            for(const [key,ratio,days] of [['End',92,1],['Home',8,7],['Enter',50,3],['ArrowLeft',45,5]]){
              divider.focus();
              divider.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
              await until(()=>divider.getAttribute('aria-valuenow')===String(ratio)&&grid.querySelectorAll('.cal-day-track').length===days);
              const left=divider.previousElementSibling.getBoundingClientRect();
              const right=divider.nextElementSibling.getBoundingClientRect();
              const handle=divider.getBoundingClientRect();
              if(left.right>handle.left+1||right.right>divider.parentElement.getBoundingClientRect().right+1)
                throw Error('Pane exceeds split bounds at '+ratio+'%');
              const controls=document.querySelector('.calendar-controls');
              controls.open=true;
              const dateTools=document.querySelector('.calendar-date-tools');
              const todayBox=document.querySelector('[aria-label=返回今天]').getBoundingClientRect();
              const dateBox=dateTools.querySelector('input').getBoundingClientRect();
              for(const box of [todayBox,dateBox]){
                if(box.width<=0||box.left<right.left-1||box.right>right.right+1)
                  throw Error('Calendar date navigation clipped at '+ratio+'%');
              }
              if(todayBox.right>dateBox.left&&todayBox.bottom>dateBox.top&&dateBox.bottom>todayBox.top)
                throw Error('Calendar date navigation overlaps at '+ratio+'%');
              for(const choice of modes.querySelectorAll('button')){
                const label=document.createRange();
                label.selectNodeContents(choice);
                const bounds=choice.getBoundingClientRect();
                if(bounds.left<right.left-1||bounds.right>right.right+1)
                  throw Error('Calendar mode outside pane at '+ratio+'%: '+choice.textContent);
                for(const line of label.getClientRects()){
                  if(line.left<bounds.left-1||line.right>bounds.right+1||line.bottom>bounds.bottom+1)
                    throw Error('Calendar mode label clipped at '+ratio+'%: '+choice.textContent);
                }
              }
              controls.open=false;
              for(const pane of [divider.previousElementSibling,divider.nextElementSibling]){
                const menu=pane.querySelector('.panehead [aria-haspopup]');
                const tools=Array.from(pane.querySelectorAll('.panehead .actions button')).filter(b=>b.offsetWidth);
                const centers=tools.map(b=>{
                  const icon=b.querySelector('svg').getBoundingClientRect(),box=b.getBoundingClientRect();
                  if(b.textContent.trim()||Math.abs(icon.left+icon.width/2-box.left-box.width/2)>1)
                    throw Error('Pane action icon not centered');
                  return icon.top+icon.height/2;
                });
                if(Math.max(...centers)-Math.min(...centers)>1)throw Error('Pane toolbar icons misaligned');
                menu.focus();
                const box=menu.getBoundingClientRect(),bounds=pane.getBoundingClientRect();
                if(box.left<bounds.left-1||box.right>bounds.right+1)throw Error('Pane menu unreachable at '+ratio+'%');
              }
            }
            for(const [width,days] of [[439,1],[440,3],[599,3],[600,5],[759,5],[760,7]]){
              grid.style.width=width+'px';
              await until(()=>grid.clientWidth===width&&grid.querySelectorAll('.cal-day-track').length===days);
              await until(()=>{
                const headers=Array.from(grid.querySelectorAll('.cal-grid-head button'));
                const selected=headers.findIndex(header=>header.getAttribute('aria-pressed')==='true');
                if(timedScenario){
                  const track=grid.querySelectorAll('.cal-day-track')[selected];
                  const block=track?.querySelector('button');
                  if(block?.querySelector('strong')?.textContent!==value)return false;
                  const box=block.getBoundingClientRect();
                  return Math.abs(box.top-track.getBoundingClientRect().top-9*62)<1&&Math.abs(box.height-60)<1;
                }
                const dateColumn=grid.querySelectorAll('.cal-allday .cal-page > div')[selected];
                return dateColumn?.querySelector('button')?.textContent===value;
              });
            }
            if(timedScenario){
              grid.style.width='600px';
              const timeScroll=grid.querySelector('.cal-hours-scroll');
              const dateInput=document.querySelector('.calendar-date-tools input');
              await until(()=>grid.querySelectorAll('.cal-day-track').length===5);
              const today=dateInput.value;
              const heading=document.querySelector('.calendar-heading-date').textContent;
              const localDay=Temporal.Now.plainDateISO();
              if(!heading.startsWith(localDay.year+'年'+localDay.month+'月'+localDay.day+'日'))
                throw Error('Calendar heading is not local today');
              const select=async date=>{
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(dateInput,date);
                dateInput.dispatchEvent(new Event('input',{bubbles:true}));
                await until(()=>!dateInput.disabled&&grid.querySelector('.cal-grid-head [aria-pressed=true]')?.dataset.date===date);
              };
              for(const [center,first,last] of [['2026-11-29','2026-11-28','2026-12-02'],['2026-12-31','2026-12-30','2027-01-03']]){
                await select(center);
                const lists=['.cal-grid-head button','.cal-allday .cal-page > div','.cal-day-track'];
                for(const selector of lists){
                  const columns=[...grid.querySelectorAll(selector)].map(node=>node.dataset.date);
                  if(columns.length!==5||columns[0]!==first||columns.at(-1)!==last||columns[1]!==center)
                    throw Error('Incorrect five-day boundary at '+center+' in '+selector);
                }
              }
              if(document.querySelector('.calendar-heading-date').textContent!==heading)throw Error('Browsing changed the today heading');
              await select(today);
              timeScroll.scrollTop=490;
              const tick=grid.querySelector('.cal-ticks');
              const ticksLeft=tick.getBoundingClientRect().left;
              const wheel=(deltaX,deltaY=0,shiftKey=false,ctrlKey=false)=>{
                const event=new WheelEvent('wheel',{deltaX,deltaY,shiftKey,ctrlKey,bubbles:true,cancelable:true});
                timeScroll.dispatchEvent(event);
                return event.defaultPrevented;
              };
              const offsets=()=>[...grid.querySelectorAll('.cal-page-track')].map(node=>new DOMMatrixReadOnly(getComputedStyle(node).transform).m41);
              if(wheel(1,100)||wheel(120,0,false,true))throw Error('Vertical scroll or zoom consumed');
              if(!wheel(6))throw Error('Horizontal scroll was not handled');
              await until(()=>grid.querySelectorAll('.cal-grid-head .cal-page[inert]').length===2);
              if(offsets().some(offset=>offset!==-6)||tick.getBoundingClientRect().left!==ticksLeft)
                throw Error('Header, all-day and hours do not pan together around the fixed ticks');
              await new Promise(resolve=>setTimeout(resolve,75));
              const before=offsets()[0];
              wheel(-4);
              if(Math.abs(offsets()[0]-before-4)>1)throw Error('Reverse wheel did not take over current position');
              await until(()=>!grid.hasAttribute('data-panning'));
              if(dateInput.value!==today)throw Error('Light movement turned the page');
              if(!wheel(0,420,true))throw Error('Shift-wheel was not handled');
              const next=Temporal.PlainDate.from(today).add({days:1}).toString();
              await until(()=>dateInput.value===next&&!dateInput.disabled&&!grid.hasAttribute('data-panning'));
              const dates=[...grid.querySelectorAll('.cal-day-track')].map(column=>column.dataset.date);
              if(dates[0]!==today||grid.querySelector('[aria-current=date]')?.dataset.date!==today||
                timeScroll.scrollTop!==490||document.querySelector('.calendar-heading-date').textContent!==heading)
                throw Error('Daily snap did not preserve the heading, today column or vertical scroll');
              document.querySelector('[aria-label=返回今天]').click();
              await until(()=>dateInput.value===today&&!dateInput.disabled&&grid.querySelector('[aria-current=date]')?.dataset.date===today);
              const offsetDay=delta=>Temporal.PlainDate.from(today).add({days:delta}).toString();
              const dayWidth=grid.querySelector('.cal-grid-head .cal-page:not([data-side]) button').getBoundingClientRect().width;
              const leadingDay=()=>grid.querySelector('.cal-grid-head .cal-page:not([data-side]) button').dataset.date;
              const originalStart=leadingDay();
              const shiftDay=(start,delta)=>Temporal.PlainDate.from(start).add({days:delta}).toString();
              for(let i=0;i<8;i++)wheel(dayWidth*.34);
              if(leadingDay()!==shiftDay(originalStart,3)||offsets().some(x=>Math.abs(x-dayWidth*.28)>1))
                throw Error('Continuous wheel stuck at the first date column');
              await until(()=>dateInput.value===offsetDay(3)&&!dateInput.disabled&&!grid.hasAttribute('data-panning'));
              for(let i=0;i<8;i++)wheel(-dayWidth*.34);
              await until(()=>dateInput.value===today&&!dateInput.disabled&&!grid.hasAttribute('data-panning'));
              if(leadingDay()!==originalStart||timeScroll.scrollTop!==490||tick.getBoundingClientRect().left!==ticksLeft)
                throw Error('Continuous wheel reversal changed the date alignment or time scroll');
              const actualSave=window.workspaces.save;
              const hold=Promise.withResolvers();
              let held=false;
              window.workspaces.save=async snapshot=>{
                window.workspaces.save=actualSave;held=true;
                await hold.promise;
                return actualSave(snapshot);
              };
              try{
                wheel(dayWidth);
                await until(()=>held&&dateInput.value===next&&dateInput.disabled);
                if(!wheel(dayWidth))throw Error('Second swipe ignored while the first date was being saved');
                await until(()=>dateInput.value===offsetDay(2)&&!grid.hasAttribute('data-panning'));
              }finally{
                hold.resolve();
                window.workspaces.save=actualSave;
              }
              await until(()=>!dateInput.disabled);
              const [workspaceAfterSwipes]=await window.workspaces.list();
              const calendarAfterSwipes=Object.values(workspaceAfterSwipes.views).find(view=>view.pluginId==='workbench.calendar');
              if(calendarAfterSwipes?.state.day!==offsetDay(2))throw Error('The second swipe did not persist');
              document.querySelector('[aria-label=返回今天]').click();
              await until(()=>dateInput.value===today&&!dateInput.disabled&&grid.querySelector('.cal-day-track button'));
              const saved=await window.workspaces.list();
              const save=window.workspaces.save;
              window.workspaces.save=async()=>{window.workspaces.save=save;throw Error('存储空间不足');};
              wheel(454);
              await until(()=>document.querySelector('.calendar-agenda > [role=alert]')&&!grid.hasAttribute('data-panning'));
              if(dateInput.value!==today||JSON.stringify(await window.workspaces.list())!==JSON.stringify(saved))
                throw Error('Failed calendar paging changed selected date');
              await select(next);
              await select(today);
              await until(()=>!document.querySelector('.calendar-agenda > [role=alert]')&&grid.querySelector('.cal-day-track button')?.textContent.includes(value));
              document.querySelector('[aria-label=新建日历]').click();
              const draft=await button('[aria-label=日历名称]');
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(draft,'保留日历草稿');
              draft.dispatchEvent(new Event('input',{bubbles:true}));
              wheel(432);
              const prompt=await button('.draft-dialog[open]');
              prompt.querySelector('button').click();
              await until(()=>!grid.hasAttribute('data-panning')&&!document.querySelector('.draft-dialog'));
              if(draft.value!=='保留日历草稿'||dateInput.value!==today)throw Error('Paging lost the draft or changed date on cancel');
              [...draft.parentElement.querySelectorAll('button')].find(button=>button.textContent==='取消').click();
              timeScroll.scrollTop=420;
              const block=grid.querySelector('.cal-day-track button').getBoundingClientRect();
              const point={x:block.left+block.width/2,y:block.top+block.height/2};
              await request('drag',{...point,delta:dayWidth*1.8});
              const previous=offsetDay(-2);
              await until(()=>dateInput.value===previous&&!dateInput.disabled);
              if(!grid.isConnected||document.querySelector('.calendar-compose')||timeScroll.scrollTop!==420)
                throw Error('Dragging an event opened it or reset vertical time');
              document.querySelector('[aria-label=返回今天]').click();
              await until(()=>dateInput.value===today&&!dateInput.disabled&&grid.querySelector('.cal-day-track button'));
              grid.style.width='760px';
              await until(()=>grid.querySelectorAll('.cal-day-track').length===7);
              const week=[...grid.querySelectorAll('.cal-day-track')].map(column=>column.dataset.date);
              wheel(200);
              await until(()=>dateInput.value===next&&!dateInput.disabled&&!grid.hasAttribute('data-panning'));
              const rolled=[...grid.querySelectorAll('.cal-day-track')].map(column=>column.dataset.date);
              if(JSON.stringify(rolled.slice(0,-1))!==JSON.stringify(week.slice(1)))throw Error('Seven-column swipe did not advance one day');
              document.querySelector('[aria-label=返回今天]').click();
              await until(()=>dateInput.value===today&&!dateInput.disabled);
              wheel(420);
              list.click();
              await until(()=>!grid.isConnected&&list.getAttribute('aria-pressed')==='true'&&!dateInput.disabled);
              const [afterUnmount]=await window.workspaces.list();
              await new Promise(resolve=>setTimeout(resolve,560));
              if(JSON.stringify(await window.workspaces.list())!==JSON.stringify([afterUnmount])||dateInput.value!==today)
                throw Error('Unmounted timeline wrote a late page transition');
              timeline.click();
              await until(()=>document.querySelector('.cal-day-track button'));
              grid=document.querySelector('.cal-timegrid');
            }
            grid.style.removeProperty('width');
            const scroller=grid.querySelector('.cal-hours-scroll');
            const pane=grid.closest('.pane');
            const gap=pane.getBoundingClientRect().bottom-scroller.getBoundingClientRect().bottom;
            if(gap>36||gap<0||scroller.clientHeight<=innerHeight*.43)throw Error('Unexpected timeline space: '+gap);
            pane.style.height='340px';
            await until(()=>scroller.clientHeight<200&&scroller.clientHeight>=144);
            scroller.scrollTop=640;
            if(scroller.scrollTop!==640)throw Error('Compact timeline cannot scroll');
            pane.style.removeProperty('height');
            if(timedScenario){
              await contextAction(grid.querySelector('.cal-day-track button'),'编辑');
              const editor=await button('.calendar-agenda li form');
              Array.from(editor.querySelectorAll('button')).find(b=>b.textContent==='取消').click();
              await until(()=>!document.querySelector('.wb-record-dialog'));
            }
            list.click();
            if(timedScenario)await until(()=>document.querySelector('.calendar-agenda li > div')?.textContent.includes('09:00 – 10:00'));
            await until(()=>[...document.querySelectorAll(row)].some(el=>el.textContent===value));
          }
        }
      }
      if(!restoring){
        const original=await button('.todo-view');
        const todoPin=await until(()=>[...document.querySelectorAll('.launcher [data-kind=view]:enabled')].find(tile=>tile.textContent==='待办'));
        await contextAction(todoPin,'在旁边打开');
        const peer=await until(()=>[...document.querySelectorAll('.todo-view')].find(view=>view!==original));
        await until(()=>peer.querySelectorAll('.todo-title').length===2);
        const checkbox=original.querySelector('.todo-row input');
        const title=checkbox.getAttribute('aria-label');
        [...peer.querySelectorAll('.todo-title')].find(button=>button.querySelector('strong').textContent===title).click();
        const note=await until(()=>peer.querySelector('.todo-details textarea'));
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(note,'保留未保存备注');
        note.dispatchEvent(new Event('input',{bubbles:true}));
        peer.querySelector('.wb-add').click();
        const composer=await until(()=>peer.querySelector('.todo-composer input'));
        const beforeCancel=todoRequests.length;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(composer,'局部放弃此项');
        composer.dispatchEvent(new Event('input',{bubbles:true}));
        composer.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
        await until(()=>!peer.querySelector('.todo-composer'));
        if(peer.querySelector('.action-menu')||todoRequests.length!==beforeCancel)
          throw Error('Escape did not cancel only the new item');
        if(note.value!=='保留未保存备注'||!note.isConnected)throw Error('Composer cancellation discarded an unrelated edit');
        checkbox.click();
        await until(()=>original.querySelectorAll('.todo-title').length===1&&peer.querySelector('.todo-details [role=status]'));
        if(note.value!=='保留未保存备注'||!note.isConnected||!peer.querySelector('.todo-details .plugin').disabled)
          throw Error('A peer completion lost the note draft or allowed stale save');
        peer.querySelector('.todo-details button[type=button]').click();
        await until(()=>!peer.querySelector('.todo-details'));
        const completed=peer.querySelector('.todo-filters button:last-child');
        completed.click();
        await until(()=>completed.getAttribute('aria-pressed')==='true'&&peer.querySelector('.todo-title strong')?.textContent===title);
        peer.querySelector('.todo-row input').click();
        await until(()=>original.querySelectorAll('.todo-title').length===2&&peer.textContent.includes('尚无已完成事项'));
        if(original.querySelector('.todo-filters button').getAttribute('aria-pressed')!=='true')throw Error('Todo filters leaked across instances');
        peer.closest('.pane').querySelector('[aria-label=关闭窗格]').click();
        await until(()=>document.querySelectorAll('.todo-view').length===1);
        if(timedScenario&&captureEvidence){
          const timeline=document.querySelector('.calendar-modes button');
          timeline.click();
          await until(()=>document.querySelector('.cal-day-track button'));
          const launcherBox=document.querySelector('.launcher').getBoundingClientRect();
          await request('pointer',{x:launcherBox.left+6,y:launcherBox.top+6});
          await request('capture',{name:'workbench-light-hover',width:innerWidth,height:innerHeight});
          await appearanceMode('dark');
          document.querySelector('.calendar-navigation button:last-child').focus();
          await request('tab');
          if(!document.activeElement.matches('.calendar-agenda .wb-add:focus-visible'))throw Error('Screenshot keyboard focus missing');
          await request('capture',{name:'workbench-dark-focus',width:innerWidth,height:innerHeight});
          await appearanceMode('light');
          document.querySelector('.calendar-modes button:nth-child(2)').click();
          await until(()=>document.querySelector('.calendar-agenda li > strong'));
        }
        for(const label of ['待办','日程']){
          const tile=await until(()=>[...document.querySelectorAll('.launcher [data-kind=view]:enabled')].find(tile=>tile.textContent===label));
          await contextAction(tile,'从快捷入口移除');
          await until(()=>!tile.isConnected);
        }
        await until(()=>!document.querySelector('.launcher [data-kind=view]'));
        const headings=[...document.querySelectorAll('.launcher h3')].map(heading=>heading.textContent);
        if(headings.join()!=='常用位置')throw Error('Removing the last plugin shortcut left its group visible');
        if(timedScenario&&captureEvidence)await request('capture',{name:'launcher-locations-only',width:innerWidth,height:innerHeight});
        const [oldLayout]=await window.workspaces.list();
        const launcher=Object.values(oldLayout.views).find(view=>view.pluginId==='workbench.launcher');
        launcher.config={
          targets:[{id:'legacy-folder',kind:'folder',label:'旧布局资料'}],
          pinnedViews:[{pluginId:'workbench.todo',type:'items'}]
        };
        await window.workspaces.save(oldLayout);
        await request('close-service-stores');
        sessionStorage.setItem('businessPhase','restore');location.reload();return;
      }
      if(document.querySelector('.split')?.querySelector(':scope > [role=separator]')?.getAttribute('aria-valuenow')!=='45')throw Error('Workspace split ratio lost after reload');
      await request('done',{panes:document.querySelectorAll('.pane').length,launcher:!!document.querySelector('.launcher')});
      return;
    }
    async function addFolder(){
      (await button('.launcher .wb-add:enabled')).click();
      const dialog=await button('.launch-add-dialog');
      dialog.querySelectorAll('input[type=radio]')[2].click();
      await until(()=>dialog.querySelector('.launch-footer .plugin').textContent.includes('选择文件夹'));
      dialog.querySelector('.launch-footer .plugin').click();
    }
    const folders=['资料归档','项目文件'];
    let chosen=0,opened;
    window.desktopLauncher={
      choose:async()=>({kind:'folder',id:'test-folder-'+chosen,label:folders[chosen++]}),
      open:async target=>{opened=target;}
    };
    const folderButton=label=>until(()=>Array.from(document.querySelectorAll('.launch-tile:enabled')).find(tile=>tile.textContent===label)).catch(()=>{throw Error('Missing '+label+' in '+document.querySelector('.launcher')?.textContent);});
    async function verifyPalettes(){
      await until(()=>{
        const selects=Array.from(document.querySelectorAll('.palette select'));
        return selects.length===2&&selects[0].value==='砖红花园'&&selects[1].value==='暮色海岸';
      });
    }
    async function verifyAppearance(mode){
      const value=await appearanceMode();
      const add=await button('.launcher .wb-add');
      const dark=mode==='dark';
      const canvas=getComputedStyle(document.documentElement).backgroundColor;
      const icon=getComputedStyle(add).backgroundColor;
      if(value!==mode||canvas!==(dark?'rgb(28, 28, 30)':'rgb(240, 241, 244)')||
        icon==='rgba(0, 0, 0, 0)')throw Error('Wrong '+mode+' appearance: '+canvas+', '+icon);
    }
    window.viewServices={call:payload=>request('service',payload),watch:()=>()=>{}};
    const phase=sessionStorage.getItem('phase');
    if(phase==='missing'||phase==='reinstalled'){
      if(phase==='missing'){
        await until(()=>Array.from(document.querySelectorAll('.recovery-view h2')).filter(el=>el.textContent==='插件未安装').length===2);
        await button('.launcher');
        const recovery=document.querySelector('.recovery-view');
        const pane=recovery.closest('.pane');
        pane.style.height='145px';
        if(!recovery.querySelector('.recovery-detail').textContent.includes('fixture.palette')||
          !recovery.textContent.includes('视图配置与状态已保留'))throw Error('Missing restoration information');
        const manage=recovery.querySelector('.recovery-actions button');
        manage.focus();
        if(document.activeElement!==manage)throw Error('Plugin management is not keyboard accessible');
        const action=manage.getBoundingClientRect(),bounds=pane.getBoundingClientRect();
        if(action.bottom>bounds.bottom+1||action.top<pane.querySelector('.panehead').getBoundingClientRect().bottom)
          throw Error('Recovery action clipped in compact pane');
        pane.style.removeProperty('height');
        if(document.querySelector('.palette'))throw Error('Unexpected missing plugin layout');
      }else await verifyPalettes();
      const [current]=await window.workspaces.list();
      if(JSON.stringify(current)!==sessionStorage.getItem('missingSnapshot'))throw Error('Plugin availability changed the workspace');
      if(phase==='missing'){
        await request('rescan-palette',true);
        sessionStorage.setItem('phase','reinstalled');location.reload();return;
      }
      await request('done',{panes:document.querySelectorAll('.pane').length,launcher:!!document.querySelector('.launcher')});
      return;
    }
    if(phase==='disabled'){
      (await button('.enable-plugin')).click();
      await verifyPalettes();
      const palette=document.querySelector('.palette');
      const generate=Array.from(palette.querySelectorAll('button')).find(b=>b.textContent==='生成 CSS');
      generate.click();
      const css=await button('.palette .css-result');
      const colors=Array.from(palette.querySelectorAll('.swatches code'),node=>node.textContent);
      const expected=':root {\n'+colors.map((color,index)=>'  --color-'+(index+1)+': '+color+';').join('\n')+'\n}';
      if(colors.length!==5||css.textContent!==expected)throw Error('Incorrect CSS service result');
      const edges=Array.from(document.querySelectorAll('.panehead'),header=>header.getBoundingClientRect().bottom);
      if(edges.length!==3||Math.max(...edges)-Math.min(...edges)>1)throw Error('Misaligned pane headers: '+edges.join(', '));
      const [workspace]=await window.workspaces.list();
      if(JSON.stringify(workspace)!==sessionStorage.getItem('snapshot'))throw Error('Recovery changed workspace');
      const rightPane=Array.from(document.querySelectorAll('.pane')).at(-1);
      rightPane.querySelector('[aria-label="上下切分"]').click();
      const separator=await button('[role=separator][aria-orientation=horizontal]');
      for(const [key,ratio] of [['Home',8],['End',92],['Enter',50]]){
        separator.focus();
        separator.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
        await until(()=>separator.getAttribute('aria-valuenow')===String(ratio));
        const upper=separator.previousElementSibling.getBoundingClientRect();
        const lower=separator.nextElementSibling.getBoundingClientRect();
        const handle=separator.getBoundingClientRect();
        const bounds=separator.parentElement.getBoundingClientRect();
        if(upper.bottom>handle.top+1||lower.top<handle.bottom-1||lower.bottom>bounds.bottom+1)
          throw Error('Vertical panes exceed nested split at '+ratio+'%');
      }
      separator.nextElementSibling.querySelector('[aria-label="关闭窗格"]').click();
      await until(()=>document.querySelectorAll('.pane').length===3);
      await verifyPalettes();
      const [after]=await window.workspaces.list();
      if(JSON.stringify(after.views)!==JSON.stringify(workspace.views))throw Error('Resizing changed persisted instances');
      window.jobs={exportResult:async id=>{const saved=await request('export-job-result',id);if(!saved)document.body.dataset.exportCancelled='true';return saved;},submit:payload=>request('submit-export',payload),list:()=>request('jobs-list'),watch:()=>()=>{}};
      document.querySelector('.job-export').click();
      await until(()=>document.querySelector('.palette [role=status]')?.textContent.includes('已提交'));
      (await button('.jobs-link')).click();
      await button('[data-status=running]');
      if(document.querySelector('.palette'))throw Error('Submitting view still mounted');
      await request('finish-export');
      (await button('.return-workspace')).click();
      await button('.palette');
      (await button('.jobs-link')).click();
      const details=await button('.job-center details');
      details.querySelector('summary').click();
      if(details.querySelector('pre').textContent!==expected)throw Error('Incorrect persisted CSS job result');
      const exportButton=details.querySelector('.export-job-result');
      exportButton.click();
      await until(()=>document.body.dataset.exportCancelled==='true'&&!exportButton.disabled);
      if(details.querySelector('[role=status],[role=alert]'))throw Error('Cancelled export showed a receipt');
      exportButton.click();
      await until(()=>details.querySelector('[role=alert]'));
      exportButton.click();
      await until(()=>details.querySelector('[role=status]')?.textContent==='已导出');
      if(await request('read-export')!==expected)throw Error('Export file differs from task result');
      (await button('.return-workspace')).click();
      await verifyPalettes();
      const [current]=await window.workspaces.list();
      sessionStorage.setItem('missingSnapshot',JSON.stringify(current));
      await request('rescan-palette',false);
      sessionStorage.setItem('phase','missing');location.reload();
      return;
    }
    if(phase==='reload'){
      await verifyPalettes();
      await verifyAppearance('dark');
      const [workspace]=await window.workspaces.list();
      (await folderButton(folders[1])).click();
      await new Promise(done=>setTimeout(done,0));
      const launcher=Object.values(workspace.views).find(view=>view.pluginId==='workbench.launcher');
      if(opened?.id!=='test-folder-1'||opened.workspaceId!==workspace.id||opened.viewId!==launcher.id)throw Error('Restored folder opened the wrong target');
      await contextAction(await folderButton(folders[0]),'从快捷入口移除');
      await until(()=>!Array.from(document.querySelectorAll('.launch-tile')).some(tile=>tile.textContent===folders[0]));
      const [edited]=await window.workspaces.list();
      const pins=JSON.parse(await request('service',{workspaceId:edited.id,viewId:launcher.id,
        service:'workbench.launcher.library',version:'1.0.0',method:'read',input:''})).targets;
      if(pins.length!==1||pins[0].id!=='test-folder-1')throw Error('Removing a folder changed its neighbor');
      sessionStorage.setItem('snapshot',JSON.stringify(edited));
      await window.plugins.setEnabled('fixture.palette',false);
      sessionStorage.setItem('phase','disabled');
      location.reload();
      return;
    }
    (await button('.welcome-starters button')).click();
    await button('.launcher');
    await verifyAppearance('light');
    await appearanceMode('dark');
    await verifyAppearance('dark');
    for(const label of folders){
      await addFolder();
      await folderButton(label);
    }
    (await button('[aria-label=左右切分]')).click();
    const choice=await button('.view-choice[aria-label=配色板]');
    if(!choice.querySelector('svg path'))throw Error('Missing picker icon');
    choice.click();
    const select=await button('.palette select');
    select.value='暮色海岸';select.dispatchEvent(new Event('change',{bubbles:true}));
    await until(()=>select.value==='暮色海岸'&&!select.disabled);
    (await button('.launcher .wb-add:enabled')).click();
    const pinDialog=await button('.launch-add-dialog');
    [...pinDialog.querySelectorAll('.launch-options label')].find(label=>label.textContent==='配色板').querySelector('input').click();
    pinDialog.querySelector('.launch-footer .plugin').click();
    const paletteTile=await folderButton('配色板');
    const launcherPane=paletteTile.closest('.pane');
    launcherPane.querySelector('[aria-label=放大窗格]').click();
    await until(()=>launcherPane.hasAttribute('data-maximized'));
    const saveBeforeLaunch=window.workspaces.save;
    window.workspaces.save=async()=>{
      window.workspaces.save=saveBeforeLaunch;
      throw Error('存储空间不足');
    };
    await contextAction(paletteTile,'在旁边打开');
    const retryLaunch=await until(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='重试保存布局'));
    if(!launcherPane.hasAttribute('data-maximized')||document.querySelectorAll('.palette select').length!==1)
      throw Error('Failed launch disturbed maximized workspace');
    retryLaunch.click();
    const second=await until(()=>document.querySelectorAll('.palette select').length===2&&document.querySelector('.palette select'));
    if(!second.getClientRects().length)throw Error('Opened view hidden behind maximized launcher');
    if(second.value!=='山间晨雾')throw Error('New instance inherited its neighbor configuration');
    const original=document.querySelectorAll('.palette select')[1];
    const [before]=await window.workspaces.list();
    const save=window.workspaces.save;
    const entered=Promise.withResolvers(),release=Promise.withResolvers();
    window.workspaces.save=async snapshot=>{
      entered.resolve();
      await release.promise;
      return save(snapshot);
    };
    second.value='砖红花园';second.dispatchEvent(new Event('change',{bubbles:true}));
    await entered.promise;
    original.value='山间晨雾';original.dispatchEvent(new Event('change',{bubbles:true}));
    window.workspaces.save=save;
    release.resolve();
    await until(()=>original.value==='山间晨雾'&&second.value==='砖红花园');
    let bothCommitted=false;
    for(let attempt=0;attempt<200;attempt++){
      const [saved]=await window.workspaces.list();
      if(saved.revision===before.revision+2){
        const names=Object.values(saved.views).filter(view=>view.pluginId==='fixture.palette').map(view=>view.config.name);
        if(!names.includes('山间晨雾')||!names.includes('砖红花园'))throw Error('Concurrent view edits lost a configuration');
        bothCommitted=true;break;
      }
      await new Promise(done=>setTimeout(done,30));
    }
    if(!bothCommitted)throw Error('Missing independent view revisions');
    original.value='暮色海岸';original.dispatchEvent(new Event('change',{bubbles:true}));
    await verifyPalettes();
    for(let attempt=0;attempt<200;attempt++){
      const [workspace]=await window.workspaces.list();
      if(['暮色海岸','砖红花园'].every(name=>Object.values(workspace.views).some(v=>v.config.name===name))){
        sessionStorage.setItem('phase','reload');location.reload();return;
      }
      await new Promise(done=>setTimeout(done,30));
    }
    throw Error('View configuration did not commit');
  }
  run().catch(error=>request('failure',String(error)));
}

async function withBrowserPage(use){
  const [port]=(await readFile(join(profile,'browser','DevToolsActivePort'),'utf8')).split('\n');
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=pages.find(target=>target.type==='page'&&target.url.endsWith(prefix));
  assert.ok(page,'Headless page missing');
  const socket=new WebSocket(page.webSocketDebuggerUrl);
  try{
    await once(socket,'open');
    let id=0;
    await use(async(method,params)=>{
      const requestId=++id;
      const receive=new Promise((resolve,reject)=>{
        function message(event){
          const response=JSON.parse(event.data);
          if(response.id!==requestId)return;
          socket.removeEventListener('message',message);
          if(response.error)reject(Error(JSON.stringify(response.error)));
          else resolve(response.result);
        }
        socket.addEventListener('message',message);
      });
      socket.send(JSON.stringify({id:requestId,method,params}));
      return receive;
    });
  }finally{socket.close();}
}

async function captureScreenshot({name,width,height}){
  assert.ok(evidenceDirectory&&/^[a-z-]+$/.test(name));
  await withBrowserPage(async send=>{
    const {data}=await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width,height,scale:1}});
    await writeFile(join(evidenceDirectory,name+'.png'),Buffer.from(data,'base64'));
  });
}

async function dragCalendar({x,y,delta}){
  await withBrowserPage(async send=>{
    const mouse=(type,target,pressed)=>send('Input.dispatchMouseEvent',{
      type,x:target,y,button:pressed?'left':'none',buttons:pressed?1:0,clickCount:1
    });
    await mouse('mousePressed',x,true);
    for(let step=1;step<=4;step++)await mouse('mouseMoved',x+delta*step/4,true);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+delta,y,button:'left',buttons:0,clickCount:1});
  });
}

const server=createServer(async(req,res)=>{
  try{
    if(!req.url.startsWith(prefix)){res.writeHead(404).end();return;}
    const file=req.url.slice(prefix.length);
    if(req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk;
      const input=JSON.parse(body);
      let value=null;
      switch(file){
        case 'submit-export':{
          const workspace=repository.list().find(w=>w.id===input.workspaceId);
          const owner=workspace?.views[input.viewId]?.pluginId;
          const definition=plugins.list().find(p=>p.id===owner)?.jobs.find(job=>job.type===input.type);
          assert.equal(definition?.type,'export-css');
          value=jobStore.submit(owner,definition,input.key,input.input);
          break;
        }
        case 'export-job-result':{
          const attempt=++destinationAttempt;
          const filePath=join(profile,attempt===2?'fixture.css':'result.txt');
          try{value=await exportJobResult(jobStore,input,async()=>({canceled:attempt===1,filePath}));}
          catch(error){if(attempt!==2)throw error;res.writeHead(409).end();return;}
          break;
        }
        case 'read-export':value=await readFile(join(profile,'result.txt'),'utf8');break;
        case 'finish-export':releaseExport.resolve();break;
        case 'jobs-list':value=jobStore.list();break;
        case 'jobs-cancel':cancelRequests++;value=jobStore.cancel(input);break;
        case 'capture':await captureScreenshot(input);break;
        case 'pointer':
          assert.ok(evidenceDirectory);
          await withBrowserPage(send=>send('Input.dispatchMouseEvent',{type:'mouseMoved',...input}));
          break;
        case 'tab':
          assert.ok(evidenceDirectory);
          await withBrowserPage(async send=>{
            for(const type of ['keyDown','keyUp'])
              await send('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
          });
          break;
        case 'drag':assert.ok(timedScenario);await dragCalendar(input);break;
        case 'list':value=repository.list();break;
        case 'save':value=repository.save(input);break;
        case 'enable':value=plugins.setEnabled(input);break;
        case 'service':{
          const workspace=repository.list().find(w=>w.id===input.workspaceId);
          const owner=workspace?.views[input.viewId]?.pluginId;
          assert.ok(owner,'Expected a live view instance');
          value=await serviceRuntime.call(owner,input);
          break;
        }
        case 'close-service-stores':
          recordsBeforeReload=businessRecords();
          assert.equal(workerExits.size,3);
          serviceRuntime.close();
          await Promise.all([...workerExits]);
          break;
        case 'rescan-palette':{
          const palette=join(scanDirectory,'fixture-palette'),removed=join(profile,'removed-palette');
          if(input)await rename(removed,palette);
          else{
            await cp(join(app,'plugins'),scanDirectory,{recursive:true});
            await rename(palette,removed);
          }
          scannedPlugins?.close();
          scannedPlugins=openPlugins(scanDirectory,join(profile,'plugins.sqlite'));
          assert.equal(scannedPlugins.list().some(p=>p.id==='fixture.palette'),input);
          break;
        }
        case 'plugins':value=(scannedPlugins??plugins).list();break;
        case 'done':result.resolve(input);break;
        case 'failure':result.reject(Error(input));break;
        default:throw Error('Unknown bridge method');
      }
      res.setHeader('content-type','application/json');res.end(JSON.stringify(value));return;
    }
    if(file==='bridge.js'){res.setHeader('content-type','text/javascript');res.end('('+bridge.toString()+')('+[retryScenario,jobScenario,timedScenario,compactScenario,Boolean(evidenceDirectory)].join(',')+')');return;}
    if(compactScenario&&file===''){
      res.setHeader('content-type','text/html; charset=utf-8');
      res.end('<!doctype html><style>body{margin:0}</style><iframe title="660 × 460" width="660" height="460" style="border:0;display:block" src="compact"></iframe>');
      return;
    }
    if(file===''||compactScenario&&file==='compact'){
      const html=await readFile(join(assets,'index.html'),'utf8');
      res.setHeader('content-type','text/html; charset=utf-8');
      res.end(html.replace('</head>','<script src="./bridge.js"></script></head>'));return;
    }
    if(!/^assets\/[\w.-]+$/.test(file)){res.writeHead(404).end();return;}
    res.setHeader('content-type',extname(file)==='.css'?'text/css':'text/javascript');
    res.end(await readFile(join(assets,file)));
  }catch(error){res.writeHead(500).end();result.reject(error);}
});
let child,closed,timeout;
try{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  child=spawn(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
    '--headless','--disable-gpu','--disable-background-networking','--disable-extensions','--no-first-run',
    ...(evidenceDirectory||timedScenario?['--remote-debugging-port=0']:[]),
    '--window-size=1440,900','--user-data-dir='+join(profile,'browser'),'http://127.0.0.1:'+server.address().port+prefix
  ],{stdio:'ignore'});
  closed=once(child,'close');
  timeout=setTimeout(()=>result.reject(Error('Renderer workflow timed out')),30000);
  const report=await Promise.race([result.promise,closed.then(()=>{throw Error('Browser closed early');})]);
  if(compactScenario){
    assert.deepEqual(report,{compact:true});
    console.log('660 × 460 viewport: eight panes, both splits, three theme preferences and focus restored.');
  }else if(jobScenario){
    assert.deepEqual(report,{cancelled:true});
    assert.deepEqual(jobStore.list().map(job=>job.status).sort(),['cancelled','failed','unknown']);
    assert.equal(cancelRequests,1);assert.equal(dispatches,3);
    console.log('Cancellation confirmed once; unknown receipt retained progress without redispatch.');
  }else{
    const panes=3;
    assert.deepEqual(report,{panes,launcher:true});
    const [workspace]=repository.list();
    assert.equal(workspace.layout.type,'split');
    assert.equal(Object.keys(workspace.views).length,panes);
    if(retryScenario){
      assert.equal(workspace.layout.ratio,.45);
      const records=businessRecords();
      assert.deepEqual(records.map(rows=>rows.map(row=>row.title).sort()),[['发布验收会议'],['核对发布清单','继续录入第二项'].sort()]);
      assert.deepEqual(records,recordsBeforeReload);
      console.log('Business records retained their IDs in separate SQLite stores after reopen and retry.');
    }
    else console.log('Packaged launcher, picker, palette config and split restored from SQLite.');
  }
}finally{
  serviceRuntime.close();
  jobStore?.close();
  clearTimeout(timeout);child?.kill();if(closed)await closed;
  server.closeAllConnections();server.close();scannedPlugins?.close();plugins.close();repository.close();
  await Promise.all([...workerExits]);
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
