import React,{useEffect,useRef,useState} from 'react';
const titles={create:'新建工作区',duplicate:'复制工作区',rename:'重命名工作区',remove:'删除工作区'};
const nameLimit=80;
function copyName(source){
  const suffix=' 副本';
  if(source.length+suffix.length<=nameLimit)return source+suffix;
  let prefix='';
  for(const {segment} of new Intl.Segmenter().segment(source)){
    if(prefix.length+segment.length+suffix.length>nameLimit)break;
    prefix+=segment;
  }
  return prefix.trimEnd()+suffix;
}
export default function WorkspaceDialog({mode,workspace,available,submit,guard,close,busy}){
  const dialog=useRef(null);
  const [name,setName]=useState(()=>mode==='duplicate'?copyName(workspace.name):mode==='rename'?workspace.name:'');
  const [selected,setSelected]=useState('');
  const key=view=>JSON.stringify([view.pluginId,view.type]);
  const [error,setError]=useState('');
  const initialName=useRef(name);
  useEffect(()=>{
    if((name===initialName.current&&!selected)||busy)return;
    function keepDraft(event){
      event.preventDefault();
      event.returnValue=false;
      setError('名称尚未保存。请提交更改，或点取消放弃草稿后关闭窗口。');
    }
    window.addEventListener('beforeunload',keepDraft);
    return ()=>window.removeEventListener('beforeunload',keepDraft);
  },[name,selected,busy]);
  useEffect(()=>{
    const element=dialog.current;
    element.showModal();
    element.querySelector('input')?.select();
    return ()=>element.close();
  },[]);
  const deleting=mode==='remove';
  return <dialog ref={dialog} aria-labelledby="dialog-title" aria-busy={busy} onCancel={event=>{event.preventDefault();if(!busy)close();}}>
    <form onSubmit={event=>{
      event.preventDefault();
      async function commit(){
        setError('');
        try{await submit(name.trim(),available.find(view=>key(view)===selected));close();}
        catch(e){
          const message=e.message.replace(/^Error invoking remote method '[^']+': Error: /,'');
          setError(message);
        }
      }
      if(mode==='rename')commit();
      else guard(commit,mode==='remove'?'delete-workspace':'workspace-switch');
    }}>
      <h2 id="dialog-title">{titles[mode]}</h2>
      {deleting?<p>删除「{workspace.name}」的布局和视图配置？插件数据和后台任务会保留。</p>:
        <label>工作区名称<input aria-describedby={[mode==='duplicate'&&'duplicate-details',error&&'workspace-form-error'].filter(Boolean).join(' ')||undefined} value={name} onChange={e=>setName(e.target.value)} autoFocus maxLength={nameLimit} required/></label>}
      {mode==='create'&&available.length>0&&<label>起始视图<select className="starting-view" disabled={busy} value={selected} onChange={e=>setSelected(e.target.value)}>
        <option value="">空白窗格</option>{available.map(view=><option key={key(view)} value={key(view)}>{view.title}</option>)}
      </select></label>}
      {mode==='duplicate'&&<p id="duplicate-details">副本沿用窗格布局与视图配置。两个工作区共用插件数据，已有后台任务继续运行。</p>}
      {error&&<p id="workspace-form-error" role="alert">{error}</p>}
      <div><button type="button" autoFocus={deleting} disabled={busy} onClick={close}>取消</button>
        <button className={deleting?'danger':'plugin'} disabled={busy||(!deleting&&!name.trim())}>{deleting?'确认删除':mode==='rename'?'保存':mode==='duplicate'?'创建副本':'创建'}</button></div>
    </form>
  </dialog>;
}
