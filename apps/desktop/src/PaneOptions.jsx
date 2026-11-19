import React,{useEffect,useRef} from 'react';

export function PaneOptions({paneId,views,layout,catalog,swap,replace,split,remove,zoom,maximized,close}){
  const ref=useRef(null);
  useEffect(()=>{
    const dialog=ref.current;
    dialog.showModal();
    return ()=>dialog.close();
  },[]);
  const leaves=[];
  function visit(node){
    if(node.type==='leaf')leaves.push(node);
    else{visit(node.first);visit(node.second);}
  }
  visit(layout);
  const ordinal=leaves.findIndex(p=>p.paneId===paneId)+1;
  function target(node){
    if(node.type==='split'){
      const track=node.axis==='horizontal'?'gridTemplateColumns':'gridTemplateRows';
      return <div className="swap-branch" style={{[track]:node.ratio+'fr '+(1-node.ratio)+'fr'}}>{target(node.first)}{target(node.second)}</div>;
    }
    const number=leaves.indexOf(node)+1;
    const instance=views[node.viewInstanceId];
    const title=catalog.find(view=>view.type===instance?.viewType&&view.pluginId===instance?.pluginId)?.title??(instance?'插件不可用':'空窗格');
    const current=node.paneId===paneId;
    return <button key={node.paneId} className={current?'swap-origin':'swap-pane'} disabled={current}
      aria-label={current?'当前位置，窗格 '+number:'与窗格 '+number+' 的'+title+'交换位置'}
      onClick={()=>swap(node.paneId)}><b>{number}</b><span>{current?'当前位置':title}</span></button>;
  }
  return <dialog ref={ref} className="pane-options" aria-labelledby="pane-dialog-title" onCancel={event=>{event.preventDefault();close();}}>
    <div className="option-header"><h2 id="pane-dialog-title">窗格 {ordinal}</h2><button aria-label="关闭操作菜单" onClick={close}>×</button></div>
    <div className="layout-tools" aria-label="布局操作">
      <button onClick={()=>split('horizontal')}>左右切分</button><button onClick={()=>split('vertical')}>上下切分</button>
      {leaves.length>1&&<button onClick={zoom}>{maximized?'还原窗格':'放大窗格'}</button>}
      <button onClick={remove}>关闭窗格</button>
    </div>
    <h3>替换视图</h3>{catalog.length?catalog.map(view=><button className="option-row" key={view.pluginId+view.type} onClick={()=>replace(view)}>{view.title}</button>):<p>暂无已启用的视图。</p>}
    {leaves.length>1&&<><h3>交换到</h3><div className="swap-scroll"><div className="swap-map">{target(layout)}</div></div></>}
  </dialog>;
}
