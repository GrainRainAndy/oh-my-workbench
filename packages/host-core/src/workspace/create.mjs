export function createViewInstance(plugin){
  return {id:crypto.randomUUID(),pluginId:plugin.pluginId,viewType:plugin.type,
    configVersion:plugin.configVersion??1,stateVersion:plugin.stateVersion??1,config:{},state:{}};
}

export function newWorkspace(name,initialPlugin){
  const view=initialPlugin&&createViewInstance(initialPlugin);
  const paneId=crypto.randomUUID();
  return {
    schemaVersion:1,id:crypto.randomUUID(),name,revision:0,
    layout:view?{type:'leaf',paneId,viewInstanceId:view.id}:{type:'leaf',paneId},
    activePaneId:paneId,views:view?{[view.id]:view}:{}
  };
}
