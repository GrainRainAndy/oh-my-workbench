import React,{useCallback,useEffect,useRef,useState} from 'react';
const labels={running:'执行中',succeeded:'已完成',unknown:'结果待确认',failed:'未派发',cancel_requested:'正在请求取消',cancelled:'已取消'};
const date=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
function CancelJob({id,title,refresh}){
  const inFlight=useRef(false);
  const [confirming,setConfirming]=useState(false);
  const trigger=useRef(null);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');
  async function cancel(){
    if(inFlight.current)return;
    inFlight.current=true;
    setConfirming(false);setSending(true);setError('');
    try{await window.jobs.cancel(id);}
    catch{
      setError('未收到取消确认，请核对任务状态。');
      await refresh();
    }finally{inFlight.current=false;setSending(false);}
  }
  function dismiss(){
    setConfirming(false);
    requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}));
  }
  if(confirming)return <div className="job-cancel-confirm" role="group" aria-label={'取消任务「'+title+'」'} onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();dismiss();}
  }}>
    <p>请求取消「{title}」？</p>
    <button autoFocus onClick={dismiss}>继续运行</button>
    <button className="confirm-cancel" onClick={cancel}>确认请求取消</button>
  </div>;
  return <><button ref={trigger} className="cancel-job" disabled={sending} onClick={()=>{setError('');setConfirming(true);}}>{sending?'正在发送…':'请求取消'}</button>
    {error&&<p role="alert">{error}</p>}</>;
}
const terminalStatuses=['succeeded','failed','cancelled'];
const groups=[
  {title:'进行中',statuses:['running','cancel_requested']},
  {title:'需要核对',statuses:['unknown']},
  {title:'已结束',statuses:terminalStatuses}
];
function JobCard({job,ownerName,refresh}){
  const [exportState,setExportState]=useState('');
  async function exportResult(){
    setExportState('saving');
    try{setExportState(await window.jobs.exportResult(job.id)?'saved':'');}
    catch{setExportState('error');}
  }
  const ended=terminalStatuses.includes(job.status);
  const timestamp=ended?job.updatedAt:job.createdAt;
  return <article className="job-card"><div className="job-heading"><div><h3>{job.title}</h3><small>{ended?'结束于':'提交于'} <time dateTime={new Date(timestamp).toISOString()}>{date.format(timestamp)}</time> · <span className="job-owner" title={job.owner}>{ownerName}</span></small></div><span data-status={job.status}>{labels[job.status]}</span></div>
      {['running','cancel_requested'].includes(job.status)&&job.progress!=null&&<div className="job-progress">
        <progress aria-label="任务进度" value={job.progress} max={100}/><span>{job.progress}%</span></div>}
      {job.status==='running'&&(job.canCancel?<CancelJob id={job.id} title={job.title} refresh={refresh}/>:<p>此任务不支持取消。</p>)}
      {job.status==='cancel_requested'&&<p>等待处理器确认，任务仍可能正常完成。</p>}
      {job.status==='unknown'&&<div className="job-uncertain">
        {job.progress!=null&&<p className="last-progress">最后上报进度 <strong>{job.progress}%</strong></p>}
        <p>请先到对应插件核对结果，再决定是否重新提交。</p>
        <details><summary>核对任务信息</summary><dl>
          <dt>任务编号</dt><dd><code>{job.id}</code></dd>
          <dt>最后更新</dt><dd><time dateTime={new Date(job.updatedAt).toISOString()}>{date.format(job.updatedAt)}</time></dd>
        </dl></details></div>}
      {job.status==='failed'&&<p className="job-reason">{job.result}</p>}
      {job.status==='succeeded'&&job.result!==null&&<details><summary>查看结果</summary><pre>{job.result}</pre>
        <button className="export-job-result" disabled={exportState==='saving'} onClick={exportResult}>导出文本</button>
        {exportState==='saved'&&<span role="status">已导出</span>}
        {exportState==='error'&&<p role="alert">导出失败，请检查目标位置后重试。</p>}</details>}</article>;
}
export default function JobCenter({returnButton,plugins}){
  const names=React.useMemo(()=>new Map(plugins.map(plugin=>[plugin.id,plugin.name])),[plugins]);
  const [records,setRecords]=useState(null);
  const [error,setError]=useState('');
  const generation=useRef(0);
  const [loading,setLoading]=useState(true);
  const refresh=useCallback(async()=>{
    const ticket=++generation.current;
    setLoading(true);
    try{
      const list=await window.jobs.list();
      if(ticket===generation.current){setRecords(list);setError('');}
    }catch{
      if(ticket===generation.current)setError('无法读取任务记录');
    }finally{
      if(ticket===generation.current)setLoading(false);
    }
  },[]);
  useEffect(()=>{
    const unsubscribe=window.jobs.watch(refresh);
    refresh();
    return ()=>{generation.current++;unsubscribe();};
  },[refresh]);
  return <section className="job-center"><div className="heading"><h1>任务中心</h1>{returnButton}</div>
    {error&&<div className="workspace-error" role="alert"><span>{error}</span><button disabled={loading} onClick={refresh}>{loading?'正在读取…':'重新读取'}</button></div>}
    {loading&&records===null&&!error&&<p role="status">正在读取任务记录…</p>}
    {!error&&records?.length===0&&<div className="job-empty"><h2>暂无后台任务</h2></div>}
    {groups.map(({title,statuses})=>{
      const jobs=records?.filter(job=>statuses.includes(job.status));
      if(!jobs?.length)return null;
      if(statuses===terminalStatuses)jobs.sort((a,b)=>b.updatedAt-a.updatedAt);
      return <section className="job-group" key={title} aria-label={title}><h2>{title}<span>{jobs.length}</span></h2>
        {jobs.map(job=><JobCard key={job.id} job={job} ownerName={names.get(job.owner)??job.owner} refresh={refresh}/>)}
      </section>;
    })}
  </section>;
}
