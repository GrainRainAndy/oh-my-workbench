import React,{useEffect,useRef,useState} from 'react';
import './view.css';

export default function Tally({services,viewType}){
  const api=useRef(services);
  api.current=services;
  const latest=useRef(0);
  const [value,setValue]=useState(null);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  async function read(){
    const request=++latest.current;
    try{
      const count=await api.current.call('workbench.tally','1.0.0','read','total');
      if(request===latest.current){setValue(count);setError('');}
    }catch(cause){
      if(request!==latest.current)return;
      setValue(null);
      setError(cause.message.endsWith('DATA_VERSION_UNSUPPORTED')
        ?'计数器数据来自较新的版本。请使用兼容版本打开，原数据已保留。'
        :'读取失败，请刷新。');
    }
  }
  useEffect(()=>{
    const dispose=api.current.watch('workbench.tally','1.0.0',read);
    read();
    window.addEventListener('focus',read);
    return ()=>{dispose();latest.current++;window.removeEventListener('focus',read);};
  },[]);
  async function increment(){
    setSaving(true);
    try{
      await api.current.call('workbench.tally','1.0.0','increment','total');
    }catch{setError('未收到保存确认，刷新可查当前次数。');}
    finally{setSaving(false);}
  }
  const atLimit=value===String(Number.MAX_SAFE_INTEGER);
  return <div className="tally-view">
    <span>累计次数</span><output aria-label="累计次数">{value??'—'}</output>
    <div>{viewType!=='counter-summary'&&<button className="plugin" disabled={saving||value===null||atLimit} onClick={increment}>记一次</button>}
    <button disabled={saving} onClick={read}>刷新</button></div>
    {atLimit&&<p role="status">已达计数上限。</p>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
