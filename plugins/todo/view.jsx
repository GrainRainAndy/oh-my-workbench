import React,{useEffect,useRef,useState} from 'react';
import './view.css';
import {AddButton,ActionMenu,menuPosition,ViewIcon,RecordDialog} from '../../packages/ui-kit/src/index.jsx';

const emptyDetails={notes:'',due:'',priority:'none'};
const priorities={none:'无',low:'低',medium:'中',high:'高'};
const service='workbench.todo.items',version='1.0.0';
function ItemRow({item,rowDrafts,lists,completed,busy,submit,services,detached,resolveDetached}){
  const [edit,setEdit]=useState(null);
  const [menu,setMenu]=useState(null);
  const titleButton=useRef(null);
  function showMenu(e){if(!busy)setMenu({...menuPosition(e),trigger:e.target.closest('button')??titleButton.current});}
  function details(){setEdit({...item,original:item,mode:'details'});}
  const staleDetails=edit?.mode==='details'&&edit.detailRevision!==item.detailRevision;
  React.useLayoutEffect(()=>{
    if(detached&&!edit){resolveDetached();return;}
    const dirty=edit?.mode==='rename'&&edit.title!==edit.original ||
      edit?.mode==='details'&&['notes','due','priority'].some(key=>edit[key]!==edit.original[key]);
    if(!dirty)return;
    rowDrafts.current.set(item.id,{item,save:commitEdit,discard:()=>setEdit(null),valid:!staleDetails&&(edit.mode!=='rename'||Boolean(edit.title.trim()))});
    return ()=>{rowDrafts.current.delete(item.id);};
  },[edit,item,rowDrafts,services,staleDetails,detached,resolveDetached]);
  const flag=completed?'1':'0';
  function open(mode){setEdit({mode,title:item.title,original:item.title,flag});}
  async function commitEdit(){
    if(edit.mode==='details'){
      await services.call(service,version,'setDetails',[item.id,String(edit.detailRevision),edit.notes,edit.due,edit.priority]);
    }else{
      const input=[item.id,edit.original,edit.flag];
      if(edit.mode==='rename')input.push(edit.title);
      await services.call(service,version,edit.mode,input);
    }
    rowDrafts.current.delete(item.id);
    setEdit(null);
  }
  if(edit?.mode==='move')return <li><form className="todo-move" onSubmit={e=>{e.preventDefault();submit(async()=>{
    await services.call(service,version,'moveItem',[item.id,edit.source,edit.target]);
    setEdit(null);
  });}}>
    <strong>{item.title}</strong>
    <label>移至清单<select autoFocus disabled={busy} value={edit.target} onChange={e=>setEdit({...edit,target:e.target.value})}>
      {lists.filter(list=>list.id!==edit.source).map(list=><option key={list.id} value={list.id}>{list.name}</option>)}
    </select></label>
    <button className="plugin" disabled={busy}>确认移动</button>
    <button type="button" disabled={busy} onClick={()=>setEdit(null)}>取消</button>
  </form></li>;
  if(edit?.mode==='details')return <li className="todo-editing"><RecordDialog title="待办详情" onCancel={()=>{if(!busy)setEdit(null);}}><form className="todo-details" onSubmit={e=>{e.preventDefault();if(!staleDetails&&!detached)submit(commitEdit);}}>
    <strong>{item.title}</strong>
    {detached&&<p role="status">此事项已离开当前清单或筛选，取消后可查看最新状态。</p>}
    <label>备注<textarea autoFocus disabled={busy} maxLength={4000} value={edit.notes} onChange={e=>setEdit({...edit,notes:e.target.value})}/></label>
    <label>到期日期<input disabled={busy} type="date" value={edit.due} onChange={e=>setEdit({...edit,due:e.target.value})}/></label>
    <label>优先级<select disabled={busy} value={edit.priority} onChange={e=>setEdit({...edit,priority:e.target.value})}>{Object.entries(priorities).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    {staleDetails&&<section className="todo-conflict" aria-label="已保存的详情">
      <strong>已保存的版本</strong>
      <dl><dt>备注</dt><dd>{item.notes||'无'}</dd><dt>到期日期</dt><dd>{item.due||'无'}</dd><dt>优先级</dt><dd>{priorities[item.priority]}</dd></dl>
      <button type="button" disabled={busy} onClick={()=>setEdit({...item,original:item,mode:'details'})}>采用已保存版本</button>
      <button type="button" disabled={busy} onClick={()=>{
        const merged={...item,original:item,mode:'details'};
        for(const key of ['notes','due','priority'])if(edit[key]!==edit.original[key])merged[key]=edit[key];
        setEdit(merged);
      }}>保留我的修改</button>
    </section>}
    <div><button className="plugin" disabled={busy||staleDetails||detached}>保存详情</button><button type="button" disabled={busy} onClick={()=>setEdit(null)}>取消</button></div>
  </form></RecordDialog></li>;
  if(edit)return <li><form onSubmit={e=>{e.preventDefault();if(!detached)submit(commitEdit);}}>
    {detached&&<p role="status">此事项已离开当前清单或筛选，取消后可查看最新状态。</p>}
    {edit.mode==='rename'?<input aria-label="修改事项名称" autoFocus disabled={busy} maxLength={160} value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})}/>:<strong>删除「{edit.original}」？</strong>}
    <button className="plugin" disabled={busy||detached||!edit.title.trim()}>{edit.mode==='rename'?'保存':'确认删除'}</button>
    <button type="button" disabled={busy} onClick={()=>setEdit(null)}>取消</button>
  </form></li>;
  const listName=lists.find(list=>list.id===item.listId)?.name;
  const due=item.due&&(item.due===Temporal.Now.plainDateISO().toString()?'今天':item.due.slice(5).replace('-','月')+'日');
  return <li className="todo-row" data-completed={completed||undefined} onContextMenu={showMenu}>
    <label className="todo-check"><input type="checkbox" aria-label={item.title} checked={completed} disabled={busy} onChange={()=>submit(()=>services.call(service,version,'setCompleted',[item.id,flag,completed?'0':'1']))}/><ViewIcon kind="check"/></label>
    <button type="button" className="todo-title" aria-haspopup="dialog" ref={titleButton} title={item.title} disabled={busy} onClick={details}><strong>{item.title}</strong>{(listName||due)&&<small>{[listName,due].filter(Boolean).join(' · ')}</small>}</button>
    <button className="todo-more" aria-label={item.title+'的操作'} aria-haspopup="menu" aria-expanded={!!menu} disabled={busy} onClick={showMenu}>
      {item.priority==='none'?<ViewIcon kind="more"/>:<span aria-label={priorities[item.priority]+'优先级'}>{'!'.repeat(['low','medium','high'].indexOf(item.priority)+1)}</span>}</button>
    {menu&&<ActionMenu label={item.title} position={menu} close={()=>setMenu(null)} actions={[
      ['详情',details],['改名',()=>open('rename')],
      ...lists.filter(list=>list.id!==item.listId).slice(0,1).map(list=>['移动',()=>setEdit({mode:'move',source:item.listId,target:list.id})]),
      ['删除',()=>open('remove')]
    ]}/>}
  </li>;
}
export default function Todo({services,state,updateState,registerController,navigateView}){
  const filters={open:'待完成',today:'今天',planned:'计划内',completed:'已完成'};
  const activeFilter=Object.hasOwn(filters,state.filter)?state.filter:'open';
  const listId=state.listId||'';
  const [lists,setLists]=useState([]),[listName,setListName]=useState(null);
  const [removing,setRemoving]=useState(null);
  const [archived,setArchived]=useState([]);
  const archivedSelection=archived.find(list=>list.id===listId);
  const missingList=Boolean(listId&&lists.length&&!lists.some(list=>list.id===listId));
  const [rename,setRename]=useState(null);
  const [sorting,setSorting]=useState(false);
  const listRequest=useRef(null);
  const completed=activeFilter==='completed';
  const [items,setItems]=useState(null),[title,setTitle]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [composing,setComposing]=useState(false);
  const [newDetails,setNewDetails]=useState(emptyDetails);
  const [dateOpen,setDateOpen]=useState(false);
  const hasComposerDraft=Boolean(title.trim()||newDetails.notes||newDetails.due||newDetails.priority!=='none');
  const [composerError,setComposerError]=useState('');
  const [committing,setCommitting]=useState(false);
  const composerErrorId=React.useId();
  const root=useRef(null),input=useRef(null),composingText=useRef(false),saving=useRef(false);
  const api=useRef(services),request=useRef(null),savingComposer=useRef(false),dateInput=useRef(null);
  function focusTitle(){input.current?.focus({preventScroll:true});}
  React.useLayoutEffect(()=>{if(composing)focusTitle();},[composing]);
  React.useLayoutEffect(()=>{if(dateOpen)dateInput.current?.focus({preventScroll:true});},[dateOpen]);
  function clearComposer(){
    setTitle('');setNewDetails(emptyDetails);setDateOpen(false);setComposerError('');
    request.current=null;composingText.current=false;
  }
  function cancelComposer(){
    clearComposer();setComposing(false);
    requestAnimationFrame(()=>root.current?.querySelector('.wb-add')?.focus({preventScroll:true}));
  }
  const animateComposer=useRef(false);
  React.useLayoutEffect(()=>{
    if(!composing||!animateComposer.current)return;
    animateComposer.current=false;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const row=input.current?.closest('.todo-composer');
    const animation=row?.animate([{opacity:.25},{opacity:1}],{duration:140,easing:'cubic-bezier(.23,1,.32,1)'});
    return ()=>animation?.cancel();
  },[composing]);
  function openComposer(event){
    if(composing){
      if(title.trim())void finishComposer(true);
      else focusTitle();
      return;
    }
    animateComposer.current=event.detail>0;
    if(activeFilter==='open'){setComposing(true);return;}
    navigateView(()=>submit(async()=>{
      await updateState({...state,filter:'open'});
      setComposing(true);
    }));
  }
  const rowDrafts=useRef(new Map());
  const [,resolveDetached]=React.useReducer(value=>value+1,0);
  const detachedItems=[...rowDrafts.current.values()].map(draft=>draft.item)
    .filter(item=>missingList||!items?.some(row=>row.id===item.id));
  const visibleItems=[...(missingList?[]:items??[]),...detachedItems];
  async function saveNewItem(){
    const fields=[title,listId||'inbox',newDetails.notes,newDetails.due,newDetails.priority];
    const key=JSON.stringify(fields);
    if(request.current?.key!==key)request.current={id:crypto.randomUUID(),key};
    await services.call(service,version,'createWithDetails',[request.current.id,...fields]);
    clearComposer();
  }
  React.useLayoutEffect(()=>registerController({
    prepareClose(){
      if(busy||saving.current||savingComposer.current)return {status:'blocked',message:'正在保存待办更改，请稍候。'};
      const otherDraft=Boolean(listName?.trim()||(rename&&rename.name!==rename.original));
      if(!hasComposerDraft&&!otherDraft&&!rowDrafts.current.size)return {status:'ready'};
      return {status:'dirty',message:'待办窗格有尚未保存的输入。',canSave:(!hasComposerDraft||Boolean(title.trim()))&&!otherDraft&&!missingList&&!detachedItems.length&&[...rowDrafts.current.values()].every(draft=>draft.valid)};
    },
    async saveDraft(){
      for(const draft of [...rowDrafts.current.values()])await draft.save();
      if(title.trim())await saveNewItem();
      setComposing(false);
    },
    discardDraft(){
      clearComposer();setComposing(false);setListName(null);setRename(null);
      for(const draft of rowDrafts.current.values())draft.discard();
    }
  }));
  const retryRead=useRef(null);
  const [readStatus,setReadStatus]=useState('ready');
  api.current=services;
  useEffect(()=>{
    let ticket=0;
    setReadStatus('ready');
    async function refresh(){
      const current=++ticket;
      try{
        const [available,inactive,rows]=await Promise.all([
          api.current.call(service,version,'lists',''),
          api.current.call(service,version,'lists','archived'),
          listId?api.current.call(service,version,'listItems',[listId,activeFilter]):api.current.call(service,version,'list',activeFilter)
        ]);
        if(ticket===current){setLists(available.map(JSON.parse));setArchived(inactive.map(JSON.parse));setItems(rows.map(JSON.parse));setReadStatus('ready');}
      }catch{if(ticket===current)setReadStatus('failed');}
    }
    setItems(null);
    retryRead.current=refresh;
    const stop=api.current.watch(service,version,refresh);
    refresh();
    let timer;
    function refreshAtMidnight(){
      const now=Temporal.Now.zonedDateTimeISO();
      const next=now.add({days:1}).startOfDay();
      timer=setTimeout(()=>{refresh();refreshAtMidnight();},next.epochMilliseconds-now.epochMilliseconds);
    }
    if(activeFilter==='today'){refreshAtMidnight();window.addEventListener('focus',refresh);}
    return ()=>{ticket++;retryRead.current=null;stop();clearTimeout(timer);window.removeEventListener('focus',refresh);};
  },[activeFilter,listId]);
  async function submit(action,onError=()=>setError('更改未确认，请核对后重试。')){
    if(saving.current)return;
    saving.current=true;
    setBusy(true);setError('');
    try{await action();}catch{onError();}finally{saving.current=false;setBusy(false);}
  }
  function changeView(patch){
    navigateView(()=>submit(async()=>{await updateState({...state,...patch});clearComposer();setComposing(false);}));
  }
  async function finishComposer(keepOpen,implicit=false){
    if(savingComposer.current||composingText.current||(implicit&&composerError))return;
    if(!title.trim()){
      if(!keepOpen&&!hasComposerDraft)setComposing(false);
      return;
    }
    savingComposer.current=true;
    setCommitting(true);setComposerError('');
    try{
      await saveNewItem();
      if(!keepOpen)setComposing(false);
    }catch{
      setComposerError('待办保存失败，请按回车重试。');
    }finally{
      savingComposer.current=false;
      setCommitting(false);
      if(keepOpen)focusTitle();
    }
  }
  function commitComposer(event){
    event.preventDefault();
    if(!busy)void finishComposer(true);
  }
  function returnedToList(target){
    return target instanceof Element&&root.current?.contains(target)&&
      !target.closest('.todo-composer,.todo-heading,.todo-controls,[role=dialog]');
  }
  const localDay=Temporal.Now.plainDateISO();
  const today=localDay.toString();
  function changeDetails(patch){setNewDetails(old=>({...old,...patch}));}
  function chooseDate(due){
    changeDetails({due});setDateOpen(false);focusTitle();
  }
  const composerBusy=busy||committing;
  const groups=new Map([['今天',[]],['已计划',[]],['未安排',[]],['已完成',[]]]);
  for(const item of visibleItems){
    const group=completed?'已完成':!item.due?'未安排':item.due<=today?'今天':'已计划';
    groups.get(group).push(item);
  }
  return <section className="todo-view" ref={root} onClick={event=>{
    if(composing&&returnedToList(event.target))void finishComposer(false,true);
  }}>
    <header className="todo-heading"><h2>待办</h2>
      {activeFilter==='open'&&items&&!missingList&&<small>{items.length} 项</small>}
      <AddButton tone="todo" label="新建待办" disabled={composerBusy||missingList||!items} onClick={openComposer}/>
    </header>
    {readStatus!=='ready'&&<div className="plugin-read-error" role="alert"><span>待办读取失败。</span>
      <button disabled={readStatus==='retrying'} onClick={()=>{setReadStatus('retrying');retryRead.current?.();}}>{readStatus==='retrying'?'正在重试…':'重新读取'}</button></div>}
    <div className="todo-controls"><div className="todo-filters">{Object.entries(filters).map(([filter,label])=>
      <button key={filter} disabled={busy} aria-pressed={activeFilter===filter} onClick={()=>{if(filter!==activeFilter)changeView({filter});}}>{label}</button>)}</div>
    <details className="todo-list-controls"><summary aria-label="待办清单">
      <span>{lists.find(list=>list.id===listId)?.name??'清单'}</span><ViewIcon kind="down"/></summary>
    <div className="todo-list-panel">
    <div className="todo-list-bar">
      <select aria-label="当前清单" disabled={busy} value={listId} onChange={e=>{const id=e.target.value;changeView({listId:id});}}>
        <option value="">全部清单</option>{missingList&&<option value={listId} disabled>{archivedSelection?archivedSelection.name+'（已归档）':'清单已删除'}</option>}{lists.map(list=><option key={list.id} value={list.id}>{list.name}</option>)}
      </select>
      <div><button disabled={busy} onClick={()=>navigateView(()=>setListName(''))}>新建清单</button>
      {lists.length>0&&<button aria-expanded={sorting} onClick={()=>{setSorting(!sorting);setRemoving(null);}}>管理清单</button>}</div>
    </div>
    {sorting&&rename&&!lists.some(list=>list.id===rename.id)&&<div role="alert">
      <p>此清单已不可用。保留的名称为「{rename.name}」。</p>
      <button type="button" onClick={()=>setRename(null)}>关闭改名</button>
    </div>}
    {sorting&&<ol className="todo-order" aria-label="清单顺序">{lists.map((list,i)=><li key={list.id}>
      {removing?.id===list.id?<form onSubmit={e=>{e.preventDefault();submit(async()=>{
        await services.call(service,version,'removeList',[list.id,removing.name]);
        setRemoving(null);
        if(listId===list.id)await updateState({...state,listId:''});
      });}}>
        <span>删除「{removing.name}」？仅可删除空清单。</span>
        <button disabled={busy}>确认删除</button>
        <button type="button" disabled={busy} onClick={()=>setRemoving(null)}>取消</button>
      </form>:rename?.id===list.id?<form onSubmit={e=>{e.preventDefault();if(busy||!rename.name.trim())return;submit(async()=>{
        await services.call(service,version,'renameList',[list.id,rename.original,rename.name]);
        setRename(null);
      });}}>
        <input aria-label="新的清单名称" maxLength={80} autoFocus disabled={busy} value={rename.name} onFocus={e=>e.target.select()} onChange={e=>setRename({...rename,name:e.target.value})}/>
        <button disabled={busy||!rename.name.trim()}>保存</button>
        <button type="button" disabled={busy} onClick={()=>setRename(null)}>取消</button>
      </form>:<><span>{list.name}</span>
      <button aria-label={'重命名'+list.name} disabled={busy||!!rename} onClick={()=>setRename({id:list.id,original:list.name,name:list.name})}>改名</button>
      {list.id!=='inbox'&&<button aria-label={'归档'+list.name} disabled={busy||!!rename} onClick={()=>submit(()=>services.call(service,version,'setArchived',[list.id,'1']))}>归档</button>}
      {list.id!=='inbox'&&<button aria-label={'删除清单'+list.name} disabled={busy||!!rename} onClick={()=>{setRemoving(list);setRename(null);}}>删除</button>}
      <button aria-label={'上移'+list.name} disabled={busy||i===0} onClick={()=>submit(()=>services.call(service,version,'swapLists',[lists[i-1].id,list.id]))}>↑</button>
      <button aria-label={'下移'+list.name} disabled={busy||i===lists.length-1} onClick={()=>submit(()=>services.call(service,version,'swapLists',[list.id,lists[i+1].id]))}>↓</button></>}
    </li>)}</ol>}
    {sorting&&archived.length>0&&<section aria-label="已归档清单"><strong>已归档</strong><ul className="todo-order">{archived.map(list=><li key={list.id}>
      <span>{list.name}</span><button aria-label={'恢复'+list.name} disabled={busy} onClick={()=>submit(()=>services.call(service,version,'setArchived',[list.id,'0']))}>恢复</button>
    </li>)}</ul></section>}
    {listName!==null&&<form onSubmit={e=>{e.preventDefault();if(busy||!listName.trim())return;submit(async()=>{
      if(listRequest.current?.name!==listName)listRequest.current={name:listName,id:crypto.randomUUID()};
      const {id}=listRequest.current;
      await services.call(service,version,'createList',[id,listName]);
      await updateState({...state,listId:id,filter:'open'});
      setListName(null);listRequest.current=null;
    });}}>
      <input aria-label="清单名称" placeholder="清单名称" autoFocus maxLength={80} disabled={busy} value={listName} onChange={e=>setListName(e.target.value)}/>
      <button disabled={busy||!listName.trim()}>创建</button><button type="button" disabled={busy} onClick={()=>setListName(null)}>取消</button>
    </form>}
    </div></details></div>
    {composing&&activeFilter==='open'&&!missingList&&<div className="todo-composer">
      <form aria-label="新建待办" aria-busy={composerBusy} onSubmit={commitComposer} onBlur={event=>{
        if(returnedToList(event.relatedTarget))void finishComposer(false,true);
      }} onCompositionStart={()=>{composingText.current=true;}} onCompositionEnd={()=>{composingText.current=false;}} onKeyDown={event=>{
        if(event.defaultPrevented||event.nativeEvent.isComposing||composingText.current)return;
        if(event.keyCode===229){if(event.key==='Enter')event.preventDefault();return;}
        if(event.key==='Enter'&&event.target===input.current)commitComposer(event);
        if(event.key==='Escape'&&!composerBusy){
          event.preventDefault();
          event.stopPropagation();
          if(dateOpen){setDateOpen(false);focusTitle();}
          else cancelComposer();
        }
      }}>
        <span aria-hidden="true" className="new-task-marker"/>
        <div className="todo-quick-fields">
          <input className="todo-draft-title" ref={input} aria-label="事项名称" placeholder="新待办事项"
            aria-invalid={!!composerError} aria-describedby={composerError?composerErrorId:undefined}
            readOnly={composerBusy} maxLength={160} value={title} onChange={event=>setTitle(event.target.value)}/>
          <textarea className="todo-inline-note" aria-label="新待办备注" placeholder="备注" maxLength={4000}
            readOnly={composerBusy} rows={1} value={newDetails.notes} onChange={event=>changeDetails({notes:event.target.value})}/>
          <div className="todo-quick-actions">
            <button type="button" className="todo-quick-chip" aria-label="设置到期日" aria-expanded={dateOpen}
              data-filled={Boolean(newDetails.due)||undefined} disabled={composerBusy} onClick={()=>setDateOpen(open=>!open)}>
              <ViewIcon kind="calendar"/>{newDetails.due||'日期'}
            </button>
            <label className="todo-quick-chip todo-quick-priority" data-filled={newDetails.priority!=='none'||undefined}>
              <ViewIcon kind="flag"/>
              <select aria-label="新待办优先级" disabled={composerBusy} value={newDetails.priority}
                onChange={event=>changeDetails({priority:event.target.value})}>
                <option value="none">优先级</option>
                {Object.entries(priorities).filter(([key])=>key!=='none').map(([key,label])=><option key={key} value={key}>{label}优先级</option>)}
              </select>
            </label>
          </div>
          {dateOpen&&<div className="todo-quick-date">
            <button type="button" disabled={composerBusy} onClick={()=>chooseDate(today)}>今天</button>
            <button type="button" disabled={composerBusy} onClick={()=>chooseDate(localDay.add({days:1}).toString())}>明天</button>
            <input type="date" ref={dateInput} aria-label="新待办到期日" disabled={composerBusy} value={newDetails.due} onChange={event=>changeDetails({due:event.target.value})}/>
            {newDetails.due&&<button type="button" disabled={composerBusy} onClick={()=>chooseDate('')}>清除日期</button>}
          </div>}
        </div>
      </form>
      {composerError&&<p id={composerErrorId} role="alert">{composerError}</p>}
    </div>}
    {missingList&&<p>{archivedSelection?'清单已归档，可在管理清单中恢复。':'此清单已删除，请选择其他清单。'}</p>}
    {visibleItems.length?<ul>{[...groups].flatMap(([name,rows])=>rows.length?[
      <li className="todo-group-title" key={name}>{name}<span>{rows.length}</span></li>,
      ...rows.map(item=><ItemRow key={item.id} item={item} rowDrafts={rowDrafts} lists={lists}
      completed={completed} busy={busy} submit={submit} services={services} detached={detachedItems.includes(item)} resolveDetached={resolveDetached}/>)] : [])}</ul>
      :!missingList&&readStatus==='ready'&&<p>{items?(completed?'尚无已完成事项。':activeFilter==='today'?'今天没有到期事项。':activeFilter==='planned'?'暂无设置到期日期的事项。':'暂无待完成事项。'):'正在读取待办…'}</p>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
