import React from 'react';
import './view.css';
const sets={
  '山间晨雾':['#273f39','#557467','#9aaf91','#d7d8ae','#efe9d4'],
  '暮色海岸':['#293748','#486b80','#92afa9','#ddc49e','#f1debf'],
  '砖红花园':['#573e42','#a6594b','#c48c65','#dcbb93','#ede2cd']
};
function CssResult({css}){
  const [feedback,setFeedback]=React.useState('');
  async function copy(){
    try{
      await navigator.clipboard.writeText(css);
      setFeedback('已复制');
    }catch{
      setFeedback('复制失败，请选中下方代码后复制。');
    }
  }
  return <section className="palette-result" aria-label="CSS 变量">
    <div className="palette-result-tools"><strong>CSS 变量</strong><button type="button" onClick={copy}>复制 CSS</button></div>
    <pre className="css-result">{css}</pre>
    {feedback&&<span role="status">{feedback}</span>}
  </section>;
}
export default function Palette({config,updateConfig,state,updateState,services,jobs,registerController}) {
  const [draft,setDraft]=React.useState(null);
  async function saveChoice(choice){
    try{await updateConfig({...config,name:choice});setDraft(null);}
    catch(error){setDraft(choice);throw error;}
  }
  const controller={
    prepareClose:()=>draft===null?{status:'ready'}:{status:'dirty',message:`配色方案「${draft}」尚未保存。`,canSave:true},
    saveDraft:async()=>{if(draft!==null)await saveChoice(draft);},
    discardDraft:()=>setDraft(null)
  };
  React.useLayoutEffect(()=>registerController(controller));
  const [selectionError,setSelectionError]=React.useState(false);
  const [output,setOutput]=React.useState(null);
  const [receipt,setReceipt]=React.useState('');
  const submission=React.useRef(null);
  const name=Object.hasOwn(sets,config.name)?config.name:Object.keys(sets)[0];
  const colors=sets[name];
  return <div className="palette"><div className="swatches">{colors.map((color,index)=><button type="button" key={color} style={{background:color}} aria-label={'查看颜色 '+color} aria-pressed={state.selectedIndex===index} onClick={async()=>{
      try{await updateState({...state,selectedIndex:index});setSelectionError(false);}
      catch{setSelectionError(true);}
    }}><code>{color}</code></button>)}</div>
    {colors[state.selectedIndex]&&<div className="selected-color"><i style={{background:colors[state.selectedIndex]}}/>当前色值 <code>{colors[state.selectedIndex]}</code></div>}
    {selectionError&&<p role="alert">当前颜色选择保存失败。</p>}
    <div className="palette-footer"><label>配色方案<select value={name} onChange={e=>{saveChoice(e.target.value).catch(()=>{});}}>{Object.keys(sets).map(n=><option key={n}>{n}</option>)}</select></label><button className="css-export" onClick={async()=>{
      try{setOutput({name,css:await services.call('workbench.palette.css','1.0.0','format',colors)});}
      catch{setOutput({name,error:'无法生成 CSS。请检查「CSS 配色导出」插件是否启用。'});}
    }}>生成 CSS</button><button title="读取文本中以空白分隔的 #RRGGBB 色值" onClick={async()=>{
      try{
        const css=await services.selectFile('workbench.palette.css','1.0.0','fromFile','');
        if(css!==null)setOutput({name,css});
      }catch(error){setOutput({name,error:error.message.endsWith('FILE_ACCESS_DENIED')?'没有权限读取所选文件。请检查文件的读取权限，或重新选择其他配色文件。':'无法读取配色文件。请选择 1 MiB 以内、含 1 至 32 个以空白分隔的 #RRGGBB 色值的文本，并确认 CSS 配色导出插件已启用。'});}
    }}>从文件生成 CSS</button><button className="job-export" onClick={async()=>{
      if(!submission.current||submission.current.name!==name)submission.current={name,key:crypto.randomUUID()};
      try{
        const job=await jobs.submit('export-css',submission.current.key,colors);
        setReceipt(job.status==='failed'
          ? `「${job.title}」未派发：${job.result||'请在任务中心查看详情'}`
          : `已提交「${job.title}」，可在任务中心查看`);
        submission.current=null;
      }
      catch{setReceipt('提交未确认，可再次提交查询');}
    }}>后台导出</button></div>{draft!==null&&<div role="alert">「{draft}」保存失败，当前显示上次保存的方案。
      <button onClick={()=>controller.saveDraft().catch(()=>{})}>重试保存</button><button onClick={controller.discardDraft}>放弃更改</button></div>}{receipt&&<p role="status">{receipt}</p>}{output?.name===name&&(output.error?<p role="alert">{output.error}</p>:<CssResult key={output.css} css={output.css}/>)}</div>;
}
