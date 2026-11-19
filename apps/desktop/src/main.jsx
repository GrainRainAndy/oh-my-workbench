import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {edit} from '../../../packages/host-core/src/workspace/operations.ts';
import {validateLayout} from '../../../packages/contracts/src/layout.ts';
import './style.css';
import Appearance from './Appearance.jsx';
import ViewBoundary from './ViewBoundary.jsx';
import JobCenter from './JobCenter.jsx';
import PluginManager from './PluginManager.jsx';
import {PaneOptions} from './PaneOptions.jsx';
import DraftDialog from './DraftDialog.jsx';
import WorkspaceDialog from './WorkspaceDialog.jsx';
import {newWorkspace} from '../../../packages/host-core/src/workspace/create.mjs';
import {duplicateWorkspace} from '../../../packages/host-core/src/workspace/duplicate.ts';

const modules=import.meta.glob('../../../plugins/*/view.jsx');
const viewComponents=new Map(Object.entries(modules).map(([path,load])=>[path.split('/').at(-2),React.lazy(load)]));
const uuid=()=>crypto.randomUUID();
const nameSegments=new Intl.Segmenter();
const WorkspaceName=React.memo(function WorkspaceName({name}){
  const characters=Array.from(nameSegments.segment(name),part=>part.segment);
  return <span className="workspace-name" title={name}><span>{characters.slice(0,-3).join('')}</span><span>{characters.slice(-3).join('')}</span></span>;
});
function Split({node,commit,children}){
  const [preview,setPreview]=useState(null);
  const group=React.useRef(null);
  const horizontal=node.axis==='horizontal';
  const clamp=value=>Math.max(.08,Math.min(.92,value));
  const ratio=preview??node.ratio;
  const stopDrag=React.useRef(null);
  useEffect(()=>()=>stopDrag.current?.(),[]);
  function beginDrag(event){
    if(event.button!==0||stopDrag.current)return;
    const pointer=event.pointerId;
    const box=group.current.getBoundingClientRect();
    const handle=event.currentTarget.getBoundingClientRect();
    const gutter=horizontal?handle.width:handle.height;
    const length=(horizontal?box.width:box.height)-gutter;
    const start=horizontal?event.clientX:event.clientY;
    let moved=false;
    function position(e){
      const offset=horizontal?e.clientX-box.left:e.clientY-box.top;
      return clamp((offset-gutter/2)/Math.max(1,length));
    }
    function move(e){
      if(e.pointerId!==pointer)return;
      moved ||= (horizontal?e.clientX:e.clientY)!==start;
      if(moved)setPreview(position(e));
    }
    function end(e){
      if(e.pointerId!==pointer)return;
      cleanup();
      setPreview(null);
      if(moved&&e.type==='pointerup')commit(position(e));
    }
    function cleanup(){
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',end);
      window.removeEventListener('pointercancel',end);
      window.removeEventListener('blur',cancel);
      stopDrag.current=null;
    }
    function cancel(){cleanup();setPreview(null);}
    stopDrag.current=cleanup;
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',end);
    window.addEventListener('pointercancel',end);
    window.addEventListener('blur',cancel);
    event.currentTarget.setPointerCapture(pointer);
  }
  function keyboardResize(event){
    const keys=horizontal?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];
    let next;
    if(event.key==='Home')next=.08;
    else if(event.key==='End')next=.92;
    else if(event.key==='Enter')next=.5;
    else if(keys.includes(event.key))next=clamp(ratio+(event.key===keys[0]?-.05:.05));
    else return;
    event.preventDefault();
    if(next!==node.ratio)commit(next);
  }
  const percent=Math.round(ratio*100);
  const ratioText=horizontal?`左侧 ${percent}%，右侧 ${100-percent}%`:`上方 ${percent}%，下方 ${100-percent}%`;
  const keyboardHint=(horizontal?'左右':'上下')+'方向键调整比例，Home 最小，End 最大，Enter 均分';
  const [first,second]=React.Children.toArray(children);
  return <div className="split" ref={group} style={{[horizontal?'gridTemplateColumns':'gridTemplateRows']:`minmax(0,${ratio}fr) 10px minmax(0,${1-ratio}fr)`}}>
    {first}<div role="separator" tabIndex={0} aria-label={horizontal?'调整左右窗格比例':'调整上下窗格比例'} aria-orientation={horizontal?'vertical':'horizontal'} aria-valuenow={Math.round(ratio*100)} aria-valuemin={8} aria-valuemax={92}
      title={'拖动调整比例，双击均分。'+keyboardHint} aria-description={keyboardHint} aria-valuetext={ratioText} data-ratio={ratioText} className={'divider '+(horizontal?'vertical':'horizontal')}
      onPointerDown={beginDrag}
      onDoubleClick={()=>{if(node.ratio!==.5)commit(.5);}} onKeyDown={keyboardResize}/>{second}</div>;
}
function App(){
  const [items,setItems]=useState([]),[active,setActiveId]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[dialog,setDialog]=useState(false);
  const [safeMode,setSafeMode]=useState(true);
  const [plugins,setPlugins]=useState([]);
  const [manager,setManager]=useState(false);
  const [notice,setNotice]=useState('');
  const [importError,setImportError]=useState('');
  const [options,setOptions]=useState(null);
  const [zoom,setZoom]=useState(null);
  useEffect(()=>{setZoom(null);},[active,manager]);
  useEffect(()=>{
    if(!zoom)return;
    const restore=event=>{if(event.key==='Escape'&&!event.defaultPrevented)setZoom(null);};
    window.addEventListener('keydown',restore);
    return ()=>window.removeEventListener('keydown',restore);
  },[zoom]);
  const available=React.useMemo(()=>safeMode?[]:plugins.flatMap(plugin=>{
    const Component=viewComponents.get(plugin.folder);
    if(!plugin.available||!Component)return [];
    return plugin.views.map(view=>({...view,description:view.description??plugin.description,pluginId:plugin.id,Component}));
  }),[safeMode,plugins]);
  async function toggle(id,enabled){
    setBusy(true);
    try{setPlugins(await window.plugins.setEnabled(id,enabled));setError('');}
    catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  function navigateWorkspaceList(event){
    const buttons=Array.from(event.currentTarget.querySelectorAll('button:enabled'));
    const index=buttons.indexOf(event.target);
    if(index<0)return;
    let next;
    switch(event.key){
      case 'ArrowUp': next=Math.max(0,index-1);break;
      case 'ArrowDown': next=Math.min(buttons.length-1,index+1);break;
      case 'Home': next=0;break;
      case 'End': next=buttons.length-1;break;
      default:return;
    }
    event.preventDefault();
    buttons[next].focus();
  }
  function setActive(id){
    if(id)localStorage.setItem('workbench.recentWorkspace',id);
    else localStorage.removeItem('workbench.recentWorkspace');
    setActiveId(id);
  }
  const writes=React.useRef(Promise.resolve());
  const pendingWrites=React.useRef(0);
  const controllers=React.useRef(new Map());
  const [draftRequest,setDraftRequest]=useState(null);
  function beforeLeaving(proceed,reason='workspace-switch',instanceId=null){
    const entries=[];
    try{
      for(const [id,controller] of controllers.current){
        if(instanceId!==null&&id!==instanceId)continue;
        const result=controller.prepareClose(reason);
        if(result.status==='blocked'){setNotice(result.message);return;}
        if(result.status==='dirty')entries.push({...result,id,controller});
      }
    }catch{setNotice('视图未能确认离开，请检查未保存的编辑。');return;}
    if(entries.length)setDraftRequest({entries,proceed});
    else proceed();
  }
  function registerController(id,controller){
    controllers.current.set(id,controller);
    return ()=>{if(controllers.current.get(id)===controller)controllers.current.delete(id);};
  }
  useEffect(()=>{
    function keepPendingWrites(event){
      let message='';
      for(const controller of controllers.current.values()){
        try{
          const result=controller.prepareClose('window-close');
          if(result.status!=='ready'){message=result.message;break;}
        }catch{message='视图未能确认关闭，请检查未保存的编辑。';break;}
      }
      if(!message&&!pendingWrites.current)return;
      event.preventDefault();
      event.returnValue=false;
      setNotice(message||'工作区正在保存。保存完成后可关闭窗口。');
    }
    window.addEventListener('beforeunload',keepPendingWrites);
    return ()=>window.removeEventListener('beforeunload',keepPendingWrites);
  },[]);
  const saveButton=React.useRef(null);
  useEffect(()=>{
    function saveShortcut(event){
      if(event.defaultPrevented||!event.metaKey||event.altKey||event.ctrlKey||event.shiftKey||
        event.key.toLowerCase()!=='s'||!saveButton.current||document.querySelector('dialog[open]'))return;
      event.preventDefault();
      if(!event.repeat)saveButton.current.click();
    }
    window.addEventListener('keydown',saveShortcut);
    return ()=>window.removeEventListener('keydown',saveShortcut);
  },[]);
  const [failedLayout,setFailedLayout]=useState(null);
  const committed=React.useRef(new Map());
  const w=items.find(item=>item.id===active);
  const [initialized,setInitialized]=useState(false);
  async function loadDesktop(){
    setBusy(true);
    setError('');
    try{
      const [list,installed,safe]=await Promise.all([window.workspaces.list(),window.plugins.list(),window.plugins.safeMode()]);
      setSafeMode(safe);
      setPlugins(installed);
      const recent=localStorage.getItem('workbench.recentWorkspace');
      committed.current=new Map(list.map(item=>[item.id,item]));
      setItems(list);
      if(recent==='')setActiveId(null);
      else setActive(list.find(item=>item.id===recent)?.id??list[0]?.id??null);
      setInitialized(true);
    }catch{setError('无法读取本机工作区或插件设置。');}
    finally{setBusy(false);}
  }
  useEffect(()=>{void loadDesktop();},[]);
  function reloadWorkspaces(){
    setBusy(true);
    pendingWrites.current++;
    const operation=writes.current.then(async()=>{
      const list=await window.workspaces.list();
      committed.current=new Map(list.map(item=>[item.id,item]));
      setItems(list);
      if(!committed.current.has(active))setActive(list[0]?.id??null);
      setOptions(null);
      setZoom(null);
      setError('');
      setNotice('已载入本机保存的最新工作区');
    }).catch(error=>setError(error.message)).finally(()=>{
      if(--pendingWrites.current===0)setBusy(false);
    });
    writes.current=operation;
  }
  function enqueueSave(build,selectWorkspace){
    pendingWrites.current++;
    setBusy(true);
    const operation=writes.current.then(async()=>{
      setFailedLayout(null);
      const saved=await window.workspaces.save(build());
      committed.current.set(saved.id,saved);
      setItems(old=>old.some(x=>x.id===saved.id)?old.map(x=>x.id===saved.id?saved:x):[...old,saved]);
      if(selectWorkspace){setActive(saved.id);setManager(false);}
      setError('');
    }).catch(error=>{setError(error.message);throw error;}).finally(()=>{
      if(--pendingWrites.current===0)setBusy(false);
    });
    writes.current=operation.catch(()=>{});
    return operation;
  }
  function save(snapshot,propagate=false){
    const operation=enqueueSave(()=>snapshot,true);
    return propagate?operation:operation.catch(()=>{});
  }
  async function saveImmediately(){
    setNotice('');
    try{
      await enqueueSave(()=>w,false);
      setNotice('「'+w.name+'」已保存到本机');
    }catch{/* The shared save queue displays the persistence error. */}
  }
  function updateView(workspaceId,paneId,viewId,patch){
    return enqueueSave(()=>{
      const workspace=committed.current.get(workspaceId);
      const view=workspace?.views[viewId];
      if(!view)throw Error('视图已关闭，无法保存更改');
      return {...workspace,activePaneId:paneId,views:{...workspace.views,[viewId]:{...view,...patch}}};
    },false);
  }
  async function submitWorkspace(name){
    const current=w&&committed.current.get(w.id);
    if(dialog==='remove'){
      setBusy(true);
      try{
        const remaining=await window.workspaces.remove({id:current.id,revision:current.revision});
        committed.current=new Map(remaining.map(item=>[item.id,item]));
        setItems(remaining);setActive(remaining[0]?.id??null);setError('');
      }finally{setBusy(false);}
      return;
    }
    const snapshot=dialog==='rename'?{...current,name}:dialog==='duplicate'?duplicateWorkspace(current,name):newWorkspace(name);
    await save(snapshot,true);
  }
  async function transfer(mode){
    setBusy(true);setNotice('');setError('');setImportError('');
    try{
      if(mode==='export'||mode==='exportStructure'){
        if(await window.workspaces.exportLayout(w.id,mode==='export'))setNotice(mode==='export'?'已导出布局和视图配置':'已导出布局，已省略视图配置');
      }else{
        // Remember the chooser before the native dialog can commit a first import.
        if(!w)localStorage.setItem('workbench.recentWorkspace','');
        const imported=await window.workspaces.importLayout();
        if(imported){
          committed.current.set(imported.id,imported);
          setItems(old=>[...old,imported]);
          setNotice({message:'已导入「'+imported.name+'」',workspaceId:imported.id});
        }
      }
    }catch(e){
      if(mode==='import')setImportError(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''));
      else setError(e.message);
    }finally{setBusy(false);}
  }
  function changeLayout(next,views=w.views,selected=w.activePaneId,source=w){
    const ids=validateLayout(next);
    const snapshot={...source,layout:next,activePaneId:ids.paneIds.has(selected)?selected:[...ids.paneIds][0],views:Object.fromEntries([...ids.viewIds].map(id=>[id,views[id]]))};
    return saveLayout(snapshot);
  }
  async function saveLayout(snapshot){
    try{
      await save(snapshot,true);
      requestAnimationFrame(()=>{
        if(document.activeElement===document.body)
          document.querySelector('.pane[data-active] .pane-title:enabled')?.focus({preventScroll:true});
      });
    }catch(error){
      if(error.message.includes('存储空间不足'))setFailedLayout(snapshot);
    }
  }
  function modify(paneId,command){
    function apply(){
      const current=committed.current.get(w.id);
      setZoom(null);
      try{changeLayout(edit(current.layout,paneId,command),current.views,command.leaf?.paneId??paneId,current);}
      catch(e){setError(e.message);}
    }
    // Changing the split tree can remount neighboring React subtrees.
    beforeLeaving(apply,command.kind==='close'?'pane-close':'layout-change');
  }
  function mount(pane,plugin){
    function apply(){
      const current=committed.current.get(w.id);
      const id=uuid();
      const replace=n=>n.type==='leaf'?(n.paneId===pane.paneId?{...n,viewInstanceId:id}:n):{...n,first:replace(n.first),second:replace(n.second)};
      changeLayout(replace(current.layout),{...current.views,[id]:{id,pluginId:plugin.pluginId,viewType:plugin.type,configVersion:plugin.configVersion??1,stateVersion:plugin.stateVersion??1,config:{},state:{}}},pane.paneId,current);
    }
    if(pane.viewInstanceId)beforeLeaving(apply,'replace-view',pane.viewInstanceId);
    else apply();
  }
  function tree(node){
    if(node.type==='split'){
      return <Split node={node} commit={ratio=>{
        const replace=n=>n===node?{...n,ratio}:n.type==='leaf'?n:{...n,first:replace(n.first),second:replace(n.second)};
        changeLayout(replace(w.layout));
      }}>{tree(node.first)}{tree(node.second)}</Split>;
    }
    const v=w.views[node.viewInstanceId],plugin=v&&available.find(p=>p.pluginId===v.pluginId&&p.type===v.viewType);
    const incompatible=plugin&&(v.configVersion!==(plugin.configVersion??1)||v.stateVersion!==(plugin.stateVersion??1));
    const Component=incompatible?null:plugin?.Component;
    const installed=v&&plugins.find(p=>p.id===v.pluginId);
    return <section key={node.paneId} className="pane" data-active={w.activePaneId===node.paneId||undefined} data-maximized={zoom===node.paneId||undefined}><div className="panehead"><span className="dot"/><button className="pane-title" title="选为当前窗格" aria-pressed={w.activePaneId===node.paneId} disabled={busy} onClick={()=>{
      if(w.activePaneId!==node.paneId)save({...w,activePaneId:node.paneId});
    }}>{plugin?.title??installed?.views.find(view=>view.type===v.viewType)?.title??(v?v.viewType:'空窗格')}</button><div className="actions"><button disabled={busy} aria-label="窗格操作" title="窗格操作" aria-haspopup="dialog" onClick={()=>setOptions(node)}>···</button>{[['horizontal','左右切分'],['vertical','上下切分']].map(([axis,label])=><button className="split-action" key={axis} disabled={busy} title={label} aria-label={label} onClick={()=>modify(node.paneId,{kind:'split',axis,leaf:{type:'leaf',paneId:uuid()}})}><i className={'split-symbol '+axis} aria-hidden="true"/><span aria-hidden="true">{label}</span></button>)}{w.layout.type==='split'&&<button className="zoom-pane" aria-label={zoom===node.paneId?'还原窗格':'放大窗格'} title={zoom===node.paneId?'还原窗格 (Esc)':'放大窗格'} aria-pressed={zoom===node.paneId} onClick={()=>setZoom(zoom===node.paneId?null:node.paneId)}><i aria-hidden="true"/></button>}<button disabled={busy} title="关闭窗格" aria-label="关闭窗格" onClick={()=>modify(node.paneId,{kind:'close'})}>×</button></div></div>
    {Component?<ViewBoundary key={v.id} title={plugin.title} manage={()=>beforeLeaving(()=>setManager(true))}><React.Suspense fallback={<p>正在加载视图…</p>}><Component viewType={v.viewType} registerController={controller=>registerController(v.id,controller)} jobs={{submit:(type,key,input)=>window.jobs.submit({workspaceId:w.id,viewId:v.id,type,key,input})}} services={{watch:(service,version,callback)=>{
      const dependency=installed?.usesServices?.find(s=>s.id===service&&s.version===version);
      if(!dependency)throw Error('视图未声明此服务');
      return window.viewServices.watch(service,version,callback,dependency.provider);
    },selectFile:(service,version,method,input)=>window.viewServices.selectFile({workspaceId:w.id,viewId:v.id,service,version,method,input}),call:(service,version,method,input)=>window.viewServices.call({workspaceId:w.id,viewId:v.id,service,version,method,input})}} config={v.config} updateConfig={config=>updateView(w.id,node.paneId,v.id,{config})} state={v.state} updateState={state=>updateView(w.id,node.paneId,v.id,{state})}/></React.Suspense></ViewBoundary>:v?<div className="empty recovery-view">
      <h2>{safeMode?'插件已暂停':incompatible?'视图版本不兼容':!installed?'插件未安装':!installed.enabled?'插件已停用':'插件暂不可用'}</h2>
      <p>{safeMode?'正常启动工作台后可重新加载此视图。':incompatible?'请使用兼容的插件版本打开此视图。':!installed?'装回兼容版本并重新打开工作台，即可恢复此视图。':installed.dependencyIssue??(!installed.enabled?'启用插件即可继续使用此视图。':'请在插件管理中检查插件状态。')}</p>
      <p className="recovery-detail">{installed?.name??v.pluginId} · 视图配置与状态已保留</p>
      <div className="recovery-actions">{!safeMode&&installed&&!installed.enabled&&<button className="plugin enable-plugin" disabled={busy} onClick={()=>toggle(installed.id,true)}>启用「{installed.name}」</button>}<button onClick={()=>beforeLeaving(()=>setManager(true))}>打开插件管理</button></div>
    </div>:<div className="empty"><div className="layout-icon" aria-hidden="true"><i/><i/><i/></div><h2>选择窗格视图</h2><div className="view-choices">{!available.length&&<button className="plugin" onClick={()=>beforeLeaving(()=>setManager(true))}>打开插件管理</button>}{available.map(p=><button disabled={busy} className="plugin view-choice" key={p.pluginId+p.type} onClick={()=>mount(node,p)}>
      <span className="choice-content"><strong>{p.title}</strong>{p.description&&<small>{p.description}</small>}</span><span aria-hidden="true">＋</span>
    </button>)}</div></div>}</section>;
  }
  if(!initialized)return <main className="startup">
    <section aria-labelledby="startup-title"><h1 id="startup-title">打开工作台</h1>
      {error?<><p role="alert">{error}</p><button className="plugin" onClick={loadDesktop}>重新读取</button></>
        :<p role="status">正在载入工作区和插件设置…</p>}
    </section></main>;
  const returnButton=manager&&<button className="return-workspace" onClick={()=>{
    setManager(false);
    requestAnimationFrame(()=>document.querySelector('nav button[aria-current="page"], .welcome button')?.focus());
  }}><span aria-hidden="true">← </span>{w?'返回工作区':'返回首页'}</button>;
  return <div className="app"><aside><div className="brand"><b>W</b> Workbench</div><div className="sidehead">工作区<button aria-label="新建工作区" disabled={busy} onClick={()=>setDialog('create')}>＋</button></div><nav aria-label="工作区列表" onKeyDown={navigateWorkspaceList}>{items.map(x=><button key={x.id} aria-label={x.name} disabled={busy} aria-current={!manager&&active===x.id?'page':undefined} onClick={()=>{if(manager||active!==x.id)beforeLeaving(()=>{setManager(false);setActive(x.id);});}}><span aria-hidden="true">▦</span><WorkspaceName name={x.name}/></button>)}</nav><footer><button className="jobs-link" aria-pressed={manager==='jobs'} onClick={()=>beforeLeaving(()=>setManager('jobs'))}>任务中心</button><button className="manage-link" aria-pressed={manager===true} onClick={()=>beforeLeaving(()=>setManager(manager!==true))}>插件管理</button><Appearance/><span className="dot"/> 本地工作台</footer></aside><main><div className="window-drag-region" aria-hidden="true"/>{safeMode&&<div className="safe-mode" role="status"><strong>安全模式</strong><span id="safe-mode-explanation">{manager===true?'本次启动已暂停所有插件。开关设置会保存，并在下次正常启动时生效。':'插件执行已暂停。可在插件管理中停用故障项，再正常启动工作台。'}</span></div>}{notice&&<p role="status" className="transfer-notice">{typeof notice==='string'?notice:notice.message}{notice.workspaceId&&notice.workspaceId!==active&&items.some(item=>item.id===notice.workspaceId)&&<button className="open-import" disabled={busy} onClick={()=>beforeLeaving(()=>{
    setActive(notice.workspaceId);setManager(false);setNotice('');
  })}>打开工作区</button>}<button aria-label="关闭提示" onClick={()=>setNotice('')}>×</button></p>}{importError&&<div role="alert" className="workspace-error import-error"><span>{importError}</span><button disabled={busy} onClick={()=>transfer('import')}>重新选择布局文件</button><button aria-label="关闭导入提示" onClick={()=>setImportError('')}>×</button></div>}{error&&<div role="alert" className="workspace-error"><span>{error.replace(/^Error invoking remote method '[^']+': Error: /,'')}</span>
      {!manager&&error.includes('存储空间不足')&&failedLayout&&failedLayout.id===w?.id&&failedLayout.revision===w.revision&&<button disabled={busy} onClick={()=>beforeLeaving(()=>saveLayout(failedLayout),'layout-change')}>重试保存布局</button>}
      {error.includes('工作区已更新')&&<button disabled={busy} onClick={()=>beforeLeaving(reloadWorkspaces)}>载入最新工作区</button>}</div>}{manager==='jobs'&&<JobCenter plugins={plugins} returnButton={returnButton}/>}{manager===true&&<PluginManager returnButton={returnButton} plugins={plugins} safeMode={safeMode} busy={busy} toggle={toggle}/>}
{!manager&&!w&&!busy&&!error&&items.length>0&&<section className="welcome imported-workspace"><h1>选择工作区</h1>{items.map(item=><button key={item.id} className="view-choice" onClick={()=>{setActive(item.id);setNotice('');}}>{item.name}</button>)}</section>}
{!manager&&!w&&!busy&&!error&&items.length===0&&<section className="welcome"><div className="layout-icon" aria-hidden="true"><i/><i/><i/></div><h1>建立你的工作区</h1><p>把常用视图放在一起。布局和配置会保存在这台 Mac 上。</p><div className="welcome-actions"><button className="plugin" onClick={()=>setDialog('create')}>＋ 新建工作区</button><button onClick={()=>transfer('import')}>导入布局</button></div></section>}{!manager&&w&&<><div className="heading"><div><h1 title={w.name}>{w.name}</h1></div><div className="workspace-tools"><span className="status">{error?'保存状态待检查':busy?'正在保存…':'已保存到本机'}</span><details><summary aria-label="工作区操作">•••</summary><div className="workspace-menu"><button ref={saveButton} aria-keyshortcuts="Meta+S" disabled={busy} onClick={event=>{
      event.currentTarget.closest('details').open=false;
      saveImmediately();
    }}>立即保存 <kbd>⌘S</kbd></button>{[['rename','重命名'],['duplicate','复制工作区'],['import','导入布局'],['export','导出布局和视图配置'],['exportStructure','仅导出布局'],['remove','删除工作区']].map(([mode,label])=><button key={mode} disabled={busy} onClick={event=>{event.currentTarget.closest('details').open=false;if(mode==='import'||mode==='export'||mode==='exportStructure')transfer(mode);else setDialog(mode);}}>{label}</button>)}</div></details></div></div><div className="canvas">{tree(w.layout)}</div></>}</main>

  {options&&w&&<PaneOptions paneId={options.paneId} views={w.views} layout={w.layout} catalog={available} close={()=>setOptions(null)}
    split={axis=>{modify(options.paneId,{kind:'split',axis,leaf:{type:'leaf',paneId:uuid()}});setOptions(null);}}
    remove={()=>{modify(options.paneId,{kind:'close'});setOptions(null);}}
    maximized={zoom===options.paneId} zoom={()=>{setZoom(zoom===options.paneId?null:options.paneId);setOptions(null);}} swap={other=>{modify(options.paneId,{kind:'swap',other});setOptions(null);}} replace={plugin=>{mount(options,plugin);setOptions(null);}}/>}
  {draftRequest&&<DraftDialog request={draftRequest} close={()=>setDraftRequest(null)}/>}
  {dialog&&<WorkspaceDialog mode={dialog} workspace={w} busy={busy} close={()=>setDialog(false)} submit={submitWorkspace} guard={beforeLeaving}/>}</div>;
}
createRoot(document.querySelector('#root')).render(<App/>);
