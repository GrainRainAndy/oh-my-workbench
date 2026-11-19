import React,{useState,useEffect,useRef} from 'react';
import DesktopSettings from './DesktopSettings.jsx';
export default function PluginManager({returnButton,plugins,safeMode,busy,toggle}){
  const [operation,setOperation]=useState(null);
  const copying=operation!==null;
  const [last,setLast]=useState(null);
  const [error,setError]=useState('');
  const [upgradeNotice,setUpgradeNotice]=useState(null);
  const [issues,setIssues]=useState([]);
  useEffect(()=>{
    let revision=0;
    async function refresh(){
      const ticket=++revision;
      try{const latest=await window.plugins.issues();if(ticket===revision)setIssues(latest);}
      catch{if(ticket===revision)setError('无法读取插件诊断。');}
    }
    const unsubscribe=window.plugins.watchIssues(refresh);
    refresh();
    return ()=>{revision++;unsubscribe();};
  },[]);
  const [history,setHistory]=useState([]);
  const [confirm,setConfirm]=useState(null);
  useEffect(()=>{window.backups.list().then(setHistory).catch(()=>setError('无法读取备份列表。'));},[]);
  const confirmation=useRef(null);
  const restoreTrigger=useRef(null);
  useEffect(()=>{
    if(!confirm)return;
    const dialog=confirmation.current;
    dialog.showModal();
    return ()=>{dialog.close();restoreTrigger.current?.focus();};
  },[confirm]);
  function cancelRestore(){
    if(copying)return;
    setConfirm(null);
    setError('');
  }
  async function restore(){
    setOperation('restore');setError('');
    try{await window.backups.restore(confirm.id);}
    catch(e){
      const reason=['请等待运行中的任务结束后再恢复','插件正在处理请求，请稍后恢复','备份文件校验失败','数据库完整性校验失败'].find(message=>e.message.endsWith(message));
      setError(reason??'恢复未完成，请检查备份文件和可用磁盘空间。');
      setOperation(null);
    }
  }
  async function backup(){
    setOperation('backup');setError('');setLast(null);
    try{setLast(await window.backups.create());
      await window.backups.list().then(setHistory).catch(()=>setError('备份已创建，暂时无法刷新备份记录。'));}
    catch(error){
      const reason=['磁盘空间不足，未创建新备份。已有备份已保留，请释放空间后重试。','请等待运行中的任务结束后再备份','插件正在处理请求，请稍后备份'].find(reason=>error.message.endsWith(reason));
      setError(reason??'备份未完成，请检查可用磁盘空间和数据库状态。');
    }
    finally{setOperation(null);}
  }
  return <section className="manager"><div className="heading"><div><small>工作台设置</small><h1>插件管理</h1></div>{returnButton}</div>
    <div className="manager-list">{plugins.map(plugin=><article key={plugin.id}>
      <div className="plugin-symbol" aria-hidden="true">▦</div><div className="plugin-info"><h2>{plugin.name}</h2><p id={'purpose-'+plugin.id}>{plugin.description}</p>
        {plugin.backgroundMode==='resident'&&<p className="background-policy" id={'background-'+plugin.id}><strong>常驻后台</strong>启用后随工作台启动，关闭窗口后仍可运行。</p>}
        {plugin.dependencyIssue&&<p className="dependency-issue" id={'dependency-'+plugin.id}><strong>已启用，暂不可用</strong><br/>{plugin.dependencyIssue}</p>}</div>
      <button className="toggle" role="switch" aria-label={plugin.name} aria-describedby={[plugin.description&&'purpose-'+plugin.id,plugin.backgroundMode==='resident'&&'background-'+plugin.id,safeMode&&'safe-mode-explanation',plugin.dependencyIssue&&'dependency-'+plugin.id].filter(Boolean).join(' ')||undefined} aria-checked={plugin.enabled} disabled={busy} onClick={()=>toggle(plugin.id,!plugin.enabled)}><i/></button>
      {plugin.databaseVersion&&plugin.available&&!safeMode&&<div className="plugin-upgrade"><button disabled={busy||copying} onClick={async()=>{
        setOperation('upgrade');setUpgradeNotice(null);
        try{
          const result=await window.plugins.upgrade(plugin.id);
          if(result?.failed){
            setUpgradeNotice({id:plugin.id,message:'升级失败，原数据已保留。',backupId:result.backupId});
            await window.backups.list().then(setHistory).catch(()=>setError('无法刷新备份记录。'));
          }else setUpgradeNotice({id:plugin.id,message:result});
        }
        catch{setUpgradeNotice({id:plugin.id,message:'升级未完成，请检查运行中的任务、可用空间及备份记录。'});}
        finally{setOperation(null);}
      }}>检查数据升级</button>{upgradeNotice?.id===plugin.id&&<div><p role="status">{upgradeNotice.message}</p>{upgradeNotice.backupId&&<button onClick={()=>window.backups.reveal(upgradeNotice.backupId).catch(()=>setError('无法定位升级前备份。'))}>在访达中显示升级前备份</button>}</div>}</div>}
    </article>)}</div>
    {issues.length>0&&<section className="manager-issues"><h2>插件诊断</h2>{issues.map(issue=><p key={issue.folder}>{issue.folder} · {issue.reason}</p>)}</section>}
    <DesktopSettings/>
    <section className="backup-card"><div><h2>工作台备份</h2><p>保存工作区、插件设置、任务记录及插件声明的数据库。</p></div>
      <button disabled={copying} onClick={backup}>{operation==='backup'?'正在备份…':'创建本机备份'}</button>
      {last&&<div className="backup-receipt" role="status">已备份 · {new Date(last.createdAt).toLocaleTimeString('zh-CN')}
        <button onClick={()=>window.backups.reveal(last.id).catch(()=>setError('无法定位已验证的备份。'))}>在访达中显示</button></div>}
      {history.length>0&&<details className="backup-history"><summary>备份记录（{history.length}）</summary>
        {history.map(item=><div key={item.id}><time>{new Date(item.createdAt).toLocaleString('zh-CN')}</time><button disabled={copying} onClick={event=>{restoreTrigger.current=event.currentTarget;setError('');setConfirm(item);}}>恢复此备份</button></div>)}</details>}
      {confirm&&<dialog ref={confirmation} className="restore-confirm" aria-labelledby="restore-title" aria-describedby="restore-scope restore-credentials" onCancel={event=>{event.preventDefault();cancelRestore();}}><h2 id="restore-title">恢复到 {new Date(confirm.createdAt).toLocaleString('zh-CN')}？</h2><p id="restore-scope">工作区、插件设置和任务记录将恢复到此时间。恢复前会先备份当前数据。</p>
        {confirm.plugins.length?<><h3>此备份中的插件数据</h3><ul>{confirm.plugins.map(entry=><li key={entry.owner}>
          {plugins.find(p=>p.id===entry.owner)?.name??entry.owner} · {entry.hasDatabase?'恢复数据库':'恢复为空（备份时尚未创建数据库）'}</li>)}</ul></>
          :<p>此备份仅包含工作台数据。插件业务数据将继续使用当前版本。</p>}
        <p id="restore-credentials">本机凭据单独保存。恢复后使用当前凭据，已撤销的凭据仍然失效。</p>
        {error&&<p role="alert">{error}</p>}
        <div className="restore-actions"><button autoFocus disabled={copying} onClick={cancelRestore}>取消</button><button className="danger" disabled={copying} onClick={restore}>{operation==='restore'?'正在恢复…':'确认恢复'}</button></div></dialog>}
      {error&&!confirm&&<p role="alert">{error}</p>}
    </section></section>;
}
