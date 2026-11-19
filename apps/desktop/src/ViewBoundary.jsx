import React from 'react';

export default class ViewBoundary extends React.Component {
  state={failed:false,retried:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(this.state.failed)return <div className="empty" role="alert">
      <h2>{this.props.title}加载失败</h2><p>{this.state.retried?'视图仍无法打开。可以重新载入窗口，或在插件管理中停用此插件。':'此窗格的配置和恢复状态已保留。'}</p>
      <div className="view-recovery-actions">{this.state.retried
        ?<button onClick={()=>window.plugins.reloadWindow()}>重新载入窗口</button>
        :<button onClick={()=>this.setState({failed:false,retried:true})}>重新挂载视图</button>}
        <button onClick={this.props.manage}>插件管理</button></div>
    </div>;
    return this.props.children;
  }
}
