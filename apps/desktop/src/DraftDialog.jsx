import React,{useEffect,useRef,useState} from 'react';

export default function DraftDialog({request,close}){
  const ref=useRef(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const [pending,setPending]=useState(request.entries);
  useEffect(()=>{
    const dialog=ref.current;
    dialog.showModal();
    return ()=>dialog.close();
  },[]);
  async function finish(method){
    setWorking(true);setError('');
    try{
      for(const entry of pending){
        await entry.controller[method]();
        setPending(items=>items.filter(item=>item.id!==entry.id));
      }
      close();request.proceed();
    }catch{
      setError(method==='saveDraft'?'保存失败。可以重试上方列出的更改，或继续编辑。':'放弃更改失败。请继续编辑，检查剩余更改。');
      setWorking(false);
    }
  }
  return <dialog ref={ref} className="draft-dialog" aria-labelledby="draft-heading" onCancel={e=>{e.preventDefault();if(!working)close();}}>
    <h2 id="draft-heading">有尚未保存的更改</h2>
    {pending.map(entry=><p key={entry.id}>{entry.message}</p>)}
    {error&&<p role="alert">{error}</p>}
    <div><button disabled={working} autoFocus onClick={close}>继续编辑</button>
      <button disabled={working} onClick={()=>finish('discardDraft')}>放弃并继续</button>
      {pending.every(entry=>entry.canSave)&&<button className="plugin" disabled={working} onClick={()=>finish('saveDraft')}>保存并继续</button>}</div>
  </dialog>;
}
