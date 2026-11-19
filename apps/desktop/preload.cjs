const {contextBridge,ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('workspaces',{
  exportLayout:(id,includeConfig=true)=>ipcRenderer.invoke('workspace:exportLayout',{id,includeConfig}),
  importLayout:()=>ipcRenderer.invoke('workspace:importLayout'),
  remove:identity=>ipcRenderer.invoke('workspace:remove',identity),
  list:()=>ipcRenderer.invoke('workspace:list'),
  save:snapshot=>ipcRenderer.invoke('workspace:save',snapshot)
});
contextBridge.exposeInMainWorld('plugins',{
  upgrade:id=>ipcRenderer.invoke('plugins:upgrade',id),
  reloadWindow:()=>ipcRenderer.invoke('plugins:reloadWindow'),
  list:()=>ipcRenderer.invoke('plugins:list'),
  watchIssues:callback=>{
    const listener=()=>callback();
    ipcRenderer.on('plugins:issuesChanged',listener);
    return ()=>ipcRenderer.removeListener('plugins:issuesChanged',listener);
  },
  issues:()=>ipcRenderer.invoke('plugins:issues'),
  safeMode:()=>ipcRenderer.invoke('plugins:safeMode'),
  setEnabled:(id,enabled)=>ipcRenderer.invoke('plugins:setEnabled',{id,enabled})
});
contextBridge.exposeInMainWorld('viewServices',{
  selectFile:request=>ipcRenderer.invoke('services:selectFile',request),
  call:request=>ipcRenderer.invoke('services:call',request),
  watch:(service,version,callback,provider)=>{
    const listener=(_event,notice)=>{
      if(notice.service===service&&notice.version===version&&(provider===undefined||provider===notice.provider))callback();
    };
    ipcRenderer.on('services:invalidated',listener);
    return ()=>ipcRenderer.removeListener('services:invalidated',listener);
  }
});
contextBridge.exposeInMainWorld('jobs',{
  list:()=>ipcRenderer.invoke('jobs:list'),
  cancel:id=>ipcRenderer.invoke('jobs:cancel',id),
  submit:request=>ipcRenderer.invoke('jobs:submit',request),
  watch:callback=>{
    const listener=()=>callback();
    ipcRenderer.on('jobs:changed',listener);
    return ()=>ipcRenderer.removeListener('jobs:changed',listener);
  }
});
contextBridge.exposeInMainWorld('backups',{
  create:()=>ipcRenderer.invoke('backup:create'),
  list:()=>ipcRenderer.invoke('backup:list'),
  restore:id=>ipcRenderer.invoke('backup:restore',id),
  reveal:id=>ipcRenderer.invoke('backup:reveal',id)
});
contextBridge.exposeInMainWorld('desktopPreferences',{
  read:()=>ipcRenderer.invoke('desktop:read'),
  loginStatus:()=>ipcRenderer.invoke('desktop:loginStatus'),
  setLogin:value=>ipcRenderer.invoke('desktop:login',value),
  setTray:value=>ipcRenderer.invoke('desktop:tray',value),
  setShortcut:value=>ipcRenderer.invoke('desktop:shortcut',value)
});
