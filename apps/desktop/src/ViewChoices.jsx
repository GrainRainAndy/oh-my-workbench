import React from 'react';
import {ViewIcon} from '../../../packages/ui-kit/src/index.jsx';

export default function ViewChoices({available,busy,choose,manage}){
  return <div className="empty pane-chooser">
    <h2>选择视图</h2>
    <div className="view-choices">
      {available.map(view=><button type="button" disabled={busy} className="plugin view-choice"
        key={view.pluginId+'/'+view.type} aria-label={view.title} aria-description={view.description}
        title={view.description} onClick={()=>choose(view)}>
        <span className="choice-icon" aria-hidden="true"><ViewIcon kind={view.icon}/></span>
        <span className="choice-content"><strong>{view.title}</strong>{view.description&&<small>{view.description}</small>}</span>
      </button>)}
      {!available.length&&<div><p>暂无可用视图。</p><button className="plugin" disabled={busy} onClick={manage}>打开插件管理</button></div>}
    </div>
  </div>;
}
