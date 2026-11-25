import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import './view.css';
import {AddButton,ActionMenu,menuPosition,ViewIcon as Icon} from '../../packages/ui-kit/src/index.jsx';
import {localTargets,pinReferences,pinnedViews,service,version,viewKey,viewReference} from './pins.mjs';

function AppIcon({id,load}){
  const [image,setImage]=useState(null);
  const loader=useRef(load);
  loader.current=load;
  useEffect(()=>{
    let mounted=true;
    loader.current(id).then(value=>{if(mounted)setImage(value);}).catch(()=>{});
    return ()=>{mounted=false;};
  },[id]);
  return image?<img src={image} alt="" width="26" height="26"/>:<Icon kind="app"/>;
}

function AddEntries({views,initial,pending,error,close,save,choose}){
  const dialog=useRef(null);
  const [kind,setKind]=useState('plugin');
  const [baseline]=useState(initial);
  const [draft,setDraft]=useState(baseline);
  useLayoutEffect(()=>{
    const element=dialog.current;
    element.showModal();
    return ()=>element.close();
  },[]);
  return <dialog ref={dialog} className="launch-add-dialog" aria-label="添加入口" aria-busy={pending}
    onCancel={event=>{event.preventDefault();if(!pending)close();}}>
    <h2>添加入口</h2>
    <fieldset><legend>入口类别</legend><div className="launch-kinds">
      {[['plugin','插件'],['app','应用'],['folder','文件夹']].map(([value,label])=>
        <label key={value}><input type="radio" name="launcher-kind" checked={kind===value}
          disabled={pending} onChange={()=>setKind(value)}/><span>{label}</span></label>)}
    </div></fieldset>
    {kind==='plugin'&&<div className="launch-options">{views.map(view=>{
      const key=viewKey(view);
      return <label key={key}><input type="checkbox" checked={draft.some(pin=>viewKey(pin)===key)} disabled={pending}
        onChange={event=>setDraft(event.target.checked?[...draft,viewReference(view)]:draft.filter(pin=>viewKey(pin)!==key))}/>
        <Icon kind={view.icon}/><span title={view.title}>{view.title}</span></label>;
    })}{!views.length&&<p>暂无可用插件</p>}</div>}
    {error&&<p role="alert">{error}</p>}
    <div className="launch-footer"><button type="button" onClick={close} disabled={pending}>取消</button>
      <button type="button" className="plugin" disabled={pending} onClick={()=>kind==='plugin'?save(draft,baseline):choose(kind)}>
        {pending?'正在处理…':kind==='plugin'?'完成':kind==='app'?'选择应用…':'选择文件夹…'}
      </button>
    </div>
  </dialog>;
}

export default function Launcher({launcher,config,services,registerController}){
  const [menu,setMenu]=useState(null),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const [adding,setAdding]=useState(false);
  const running=useRef(false),root=useRef(null);
  const [library,setLibrary]=useState(null),[readFailed,setReadFailed]=useState(false);
  const api=useRef(services),refresh=useRef(null);
  api.current=services;
  const pins=localTargets(library);
  const references=pinReferences(library);
  const visibleViews=pinnedViews(library,launcher.views);
  const legacy=JSON.stringify({targets:localTargets(config),pinnedViews:pinReferences(config)});
  useEffect(()=>{
    let ticket=0,mounted=true,imported=false;
    const old=JSON.parse(legacy);
    async function read(){
      const current=++ticket;
      try{
        if(!imported&&(old.targets.length||old.pinnedViews.length)){
          await api.current.call(service,version,'importLegacy',legacy);
          imported=true;
        }
        if(!mounted||current!==ticket)return;
        const value=JSON.parse(await api.current.call(service,version,'read',''));
        if(mounted&&current===ticket){setLibrary(value);setReadFailed(false);}
      }catch{if(mounted&&current===ticket)setReadFailed(true);}
    }
    refresh.current=read;
    const stop=api.current.watch(service,version,()=>{
      if(imported||!old.targets.length&&!old.pinnedViews.length)void read();
    });
    void read();
    return ()=>{mounted=false;refresh.current=null;stop();};
  },[legacy]);
  useLayoutEffect(()=>registerController({prepareClose:()=>running.current
    ?{status:'blocked',message:'快捷入口正在保存或选择目标，请稍候。'}
    :{status:'ready'}}),[registerController]);
  async function change(patch){
    await services.call(service,version,'change',JSON.stringify(patch));
    void refresh.current?.();
  }
  async function run(action,message){
    if(running.current)return;
    const previous=document.activeElement;
    running.current=true;
    setPending(true);setError('');
    try{await action();}catch{setError(message);}finally{
      running.current=false;
      setPending(false);
      requestAnimationFrame(()=>{
        if(!root.current||document.activeElement!==document.body)return;
        (previous?.isConnected?previous:root.current.querySelector('.wb-add'))?.focus({preventScroll:true});
      });
    }
  }
  function close(){
    setAdding(false);setError('');
    requestAnimationFrame(()=>root.current?.querySelector('.wb-add')?.focus({preventScroll:true}));
  }
  function save(draft,baseline){
    run(async()=>{
      const added=draft.filter(view=>!baseline.some(old=>viewKey(old)===viewKey(view)));
      const removed=baseline.filter(view=>!draft.some(next=>viewKey(next)===viewKey(view)));
      if(added.length||removed.length)await change({add:{pinnedViews:added},remove:{pinnedViews:removed}});
      close();
    },'入口配置未保存，请重试。');
  }
  function choose(kind){
    run(async()=>{
      const target=await launcher.choose(kind);
      if(!target)return;
      await change({add:{targets:[target]}});
      close();
    },kind==='app'?'未能添加应用，请重新选择。':'未能添加文件夹，请重新选择。');
  }
  function tile(key,kind,label,action,icon,appId,actions){
    const show=event=>{if(!pending)setMenu({position:menuPosition(event),actions,label});};
    return <button key={key} className="launch-tile" title={label} data-kind={kind} data-icon={icon} disabled={pending}
      aria-haspopup="menu" onContextMenu={show} onKeyDown={event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')show(event);}} onClick={action}>
      <span className="launch-icon">{appId?<AppIcon id={appId} load={launcher.icon}/>:<Icon kind={icon}/>}</span><span className="launch-label">{label}</span>
    </button>;
  }
  return <section className="launcher" ref={root}>
    <header className="launch-heading"><h2>快捷入口</h2><AddButton tone="launcher" label="添加入口"
      onClick={()=>{setError('');setAdding(true);}} disabled={pending||!library} expanded={adding} hasPopup="dialog"/></header>
    {readFailed&&<div className="plugin-read-error" role="alert"><span>快捷入口读取失败。</span>
      <button onClick={()=>refresh.current?.()}>重新读取</button></div>}
    {!library&&!readFailed&&<p role="status">正在读取入口…</p>}
    {library&&!readFailed&&!pins.length&&!visibleViews.length&&<p className="launch-empty" role="status">用加号添加入口</p>}
    {pins.length>0&&<><h3>常用位置</h3>
    <div className="launch-grid">{pins.map(p=>{
      const open=()=>run(()=>launcher.open(p.id),'入口不可用，请从添加入口重新选择目标。');
      const remove=()=>run(()=>change({remove:{targets:[p]}}),'移除失败，请重试。');
      return tile(p.id,p.kind,p.label,open,p.kind,p.kind==='app'?p.id:undefined,[['打开',open],['从快捷入口移除',remove]]);
    })}</div></>}
    {visibleViews.length>0&&<><h3>插件</h3><div className="launch-grid">{visibleViews.map(view=>{
      const key=viewKey(view);
      const open=()=>launcher.openView(view.pluginId,view.type);
      const remove=()=>run(()=>change({remove:{pinnedViews:[viewReference(view)]}}),'移除失败，请重试。');
      return tile(key,'view',view.title,open,view.icon,undefined,[
        ['打开',open],['在旁边打开',()=>launcher.openView(view.pluginId,view.type,'beside')],['从快捷入口移除',remove]
      ]);
    })}</div></>}
    {menu&&<ActionMenu {...menu} close={()=>setMenu(null)}/>}
    {adding&&<AddEntries views={launcher.views} initial={references} {...{pending,error,close,save,choose}}/>}
    {!adding&&error&&<p role="alert">{error}</p>}
  </section>;
}
