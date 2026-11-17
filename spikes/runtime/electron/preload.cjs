const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('fixture',{call:(method,params)=>ipcRenderer.invoke('fixture:call',method,params)});
