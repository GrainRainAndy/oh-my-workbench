const {app,BrowserWindow,ipcMain,utilityProcess,Tray,Menu,nativeImage,dialog,shell,globalShortcut,powerMonitor}=require('electron');
const {join}=require('node:path');
const {mkdirSync,existsSync}=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {spawnSync}=require('node:child_process');
const {open,rename,unlink}=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const {createReadScope}=require('../../packages/host-core/src/platform/selected-file.cjs');
const {pathToFileURL}=require('node:url');
const {openRepository}=require('../../packages/host-core/src/workspace/repository.cjs');
const page=join(__dirname,'dist/index.html');
const {openPlugins}=require('../../packages/host-core/src/runtime/plugins.cjs');
const {createServices}=require('../../packages/host-core/src/runtime/services.cjs');
const {openJobs}=require('../../packages/host-core/src/jobs/registry.cjs');
const {discardInterruptedCopies,pluginDirectory,createSnapshot,verifySnapshot,activeDirectory,listSnapshots,prepareRestore}=require('../../packages/host-core/src/persistence/backup.cjs');
const {openPreferences}=require('./preferences.cjs');
let desktopPreferences;
let win, repository, plugins, services, jobs, tray;
function expose(channel, handler){
  ipcMain.handle(channel,(event,input)=>{
    if(!win || event.sender!==win.webContents || event.senderFrame!==event.sender.mainFrame || event.senderFrame.url!==pathToFileURL(page).href) throw Error('来源无效');
    return handler(input);
  });
}
function show(){
  services?.setWindowless(false);
  if(win){if(win.isMinimized())win.restore();win.show();win.focus();return;}
  win=new BrowserWindow({width:1200,height:790,minWidth:660,minHeight:460,titleBarStyle:'hiddenInset',backgroundColor:'#f7f7f2',webPreferences:{preload:join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  const current=win;
  current.webContents.on('render-process-gone',async (_event,details)=>{
    if(details.reason==='clean-exit'||current.isDestroyed())return;
    const {response}=await dialog.showMessageBox(current,{
      type:'warning',message:'工作台窗口意外停止',
      detail:'重新打开后将恢复已保存的布局和视图配置。后台任务可在任务中心查看。',
      buttons:['恢复窗口','关闭窗口'],defaultId:0,cancelId:1
    });
    if(current.isDestroyed())return;
    if(response===0)current.reload();
    else current.close();
  });
  win.on('closed',()=>{win=null;services?.setWindowless(true);});
  win.loadFile(page);
}
function startDesktop(pluginRoot=join(__dirname,'../../plugins')){
  const safeMode=process.argv.includes('--safe-mode');
  let relaunchArgs=null;
  function requirePluginExecution(){
    if(safeMode)throw Error('安全模式已暂停插件执行');
  }
  function refreshJobViews(){
    if(win&&!win.webContents.isDestroyed())win.webContents.send('jobs:changed');
  }
  if(!app.requestSingleInstanceLock()) app.quit();
  else {
    app.whenReady().then(async()=>{
      const {validateWorkspace,exportLayout,importLayout,layoutFileLimit}=await import('./dist-main/workspace.mjs');
      const profile=app.getPath('userData');
      function openStores(directory){
        let workspaceStore,pluginStore,jobStore;
        try{
          workspaceStore=openRepository(join(directory,'workspaces.sqlite'),validateWorkspace);
          workspaceStore.list();
          pluginStore=openPlugins(pluginRoot,join(directory,'plugins.sqlite'));
          pluginStore.list();
          jobStore=openJobs(join(directory,'jobs.sqlite'),{
            execute:(owner,definition,input,signal,onProgress)=>services.call(owner,{...definition,input},signal,onProgress),
            changed:refreshJobViews
          });
          jobStore.list();
          return [workspaceStore,pluginStore,jobStore];
        }catch(error){workspaceStore?.close();pluginStore?.close();jobStore?.close();throw error;}
      }
      try{
        [repository,plugins,jobs]=openStores(activeDirectory(profile));
      }catch{
        let skipped=0;
        const latest=listSnapshots(profile).find(backup=>{
          try{
            if(verifySnapshot(join(profile,'backups',backup.id)).id===backup.id)return true;
          }catch{/* Try the next backup without changing the damaged files. */}
          skipped++;return false;
        });
        const buttons=['退出工作台','在访达中查看数据'];
        if(latest)buttons.push('从已校验备份恢复');
        const {response}=await dialog.showMessageBox({type:'warning',buttons,defaultId:0,cancelId:0,
          message:'无法打开本机工作区',
          detail:'当前数据将保留在原目录。'+(skipped?'已跳过 '+skipped+' 个未通过校验的备份。':'')+(latest?'可从 '+new Date(latest.createdAt).toLocaleString('zh-CN')+' 的备份恢复到独立目录。':'请检查数据目录或从外部备份恢复。')});
        if(response!==2||!latest){
          if(response===1)await shell.openPath(profile);
          app.quit();return;
        }
        let next,candidate;
        try{
          candidate=prepareRestore(profile,latest.id);
          next=openStores(candidate.directory);
          candidate.commit();
          [repository,plugins,jobs]=next;
        }catch{
          for(const store of next??[])store.close();
          candidate?.discard();
          await dialog.showMessageBox({type:'error',message:'无法恢复此备份',detail:'已保留原始数据与备份。请检查数据目录。'});
          app.quit();return;
        }
      }
      try{discardInterruptedCopies(profile);}catch{console.warn('未能清理未完成的恢复副本');}
      for(const method of ['list','save','remove']) expose('workspace:'+method,input=>repository[method](input));
      expose('workspace:exportLayout',async ({id,includeConfig})=>{
        if(typeof id!=='string'||typeof includeConfig!=='boolean')throw Error('导出选项无效');
        const workspace=repository.list().find(item=>item.id===id);
        if(!workspace)throw Error('工作区不存在');
        const text=exportLayout(workspace,includeConfig);
        const {canceled,filePath}=await dialog.showSaveDialog(win,{title:'导出布局',message:includeConfig?'包含窗格布局和视图配置。':'仅包含窗格布局和视图类型。',defaultPath:'工作区布局.json',filters:[{name:'工作台布局',extensions:['json']}]});
        if(canceled||!filePath)return false;
        const temporary=filePath+'.'+randomUUID()+'.tmp';
        let ownsTemporary=false;
        try{
          const file=await open(temporary,'wx',0o600);
          ownsTemporary=true;
          try{await file.writeFile(text);await file.sync();}finally{await file.close();}
          await rename(temporary,filePath);
          ownsTemporary=false;
        }catch(error){
          if(error.code==='ENOSPC')throw Error('磁盘空间不足，布局未导出。请释放空间后重试。');
          if(error.code==='EACCES'||error.code==='EPERM')throw Error('无法写入此位置，请选择其他文件夹。');
          throw Error('布局未导出，请检查目标位置后重试。');
        }finally{
          if(ownsTemporary)await unlink(temporary).catch(()=>console.warn('无法清理布局导出临时文件'));
        }
        return true;
      });
      expose('workspace:importLayout',async()=>{
        const {canceled,filePaths}=await dialog.showOpenDialog(win,{title:'导入布局',message:'选择 5 MiB 以内的布局 JSON 文件。',properties:['openFile'],filters:[{name:'工作台布局',extensions:['json']}]});
        if(canceled||!filePaths.length)return null;
        let bytes;
        const scope=createReadScope(layoutFileLimit);
        try{bytes=await scope.read(await scope.grant(filePaths[0]));}
        catch(error){
          if(error.code==='EFBIG')throw Error('布局文件超过 5 MiB，请选择较小的布局文件。');
          if(error.code==='ENOENT')throw Error('所选布局文件已移动或删除。');
          if(error.code==='EACCES'||error.code==='EPERM')throw Error('没有权限读取所选布局文件。');
          throw error;
        }finally{scope.close();}
        return repository.save(importLayout(bytes.toString('utf8')));
      });
      services=createServices({plugins:{list:()=>safeMode?[]:plugins.list()},notify:notice=>{
        if(win&&!win.webContents.isDestroyed())win.webContents.send('services:invalidated',notice);
      },fork:id=>{
        requirePluginExecution();
        const dataDirectory=pluginDirectory(profile,id);
        mkdirSync(dataDirectory,{recursive:true,mode:0o700});
        return utilityProcess.fork(join(__dirname,'service-worker.cjs'),[plugins.backend(id),dataDirectory],{serviceName:'Workbench '+id});
      }});
      const startupAttempts=new Map();
      const startupIssues=new Map();
      function notifyPluginIssues(){
        if(win&&!win.webContents.isDestroyed())win.webContents.send('plugins:issuesChanged');
      }
      function clearStartupIssue(id){
        startupAttempts.delete(id);
        if(startupIssues.delete(id))notifyPluginIssues();
      }
      function activateStartupPlugins(previouslyAvailable=new Set()){
        if(safeMode)return;
        for(const plugin of plugins.list()){
          if(plugin.available&&!previouslyAvailable.has(plugin.id)&&plugin.activationEvents?.includes('onAppStart')){
            clearStartupIssue(plugin.id);
            const attempt=Symbol();
            startupAttempts.set(plugin.id,attempt);
            services.activate(plugin.id).catch(()=>{
              if(startupAttempts.get(plugin.id)!==attempt)return;
              startupIssues.set(plugin.id,{folder:plugin.folder,reason:plugin.name+'后台启动失败。检查插件后，可停用再启用以重试。'});
              notifyPluginIssues();
            });
          }
        }
      }
      expose('plugins:issues',()=>[...plugins.issues(),...startupIssues.values()]);
      expose('plugins:safeMode',()=>safeMode);
      expose('plugins:reloadWindow',()=>win.reload());
      expose('plugins:list',()=>plugins.list());
      expose('plugins:setEnabled',input=>{
        const previouslyAvailable=new Set(plugins.list().filter(plugin=>plugin.available).map(plugin=>plugin.id));
        const updated=plugins.setEnabled(input);
        for(const plugin of updated)if(!plugin.available){clearStartupIssue(plugin.id);services.stop(plugin.id); }
        activateStartupPlugins(previouslyAvailable);
        return updated;
      });
      function ownerOf(request){
        const workspace=repository.list().find(w=>w.id===request.workspaceId);
        if(!workspace||!Object.hasOwn(workspace.views,request.viewId))throw Error('视图不可用');
        return workspace.views[request.viewId].pluginId;
      }
      expose('services:call',request=>{requirePluginExecution();return services.call(ownerOf(request),request);});
      expose('services:selectFile',async request=>{
        requirePluginExecution();
        const owner=ownerOf(request),broker=services;
        const provider=broker.resolveProvider(owner,request);
        const options={title:'选择要共享的文件',message:`允许 ${provider.name}（${provider.id}）在本次调用中读取一个文件，最大 1 MiB。`,properties:['openFile']};
        const {canceled,filePaths}=await dialog.showOpenDialog(win,options);
        if(canceled||!filePaths.length)return null;
        const scope=createReadScope(1024*1024);
        try{
          const token=await scope.grant(filePaths[0]);
          if(services!==broker||ownerOf(request)!==owner||broker.resolveProvider(owner,request).id!==provider.id)throw Error('服务或视图已变化');
          return await broker.call(owner,request,undefined,undefined,scope.delegate(token));
        }catch(error){
          if(error.code==='EACCES'||error.code==='EPERM')throw Error('FILE_ACCESS_DENIED');
          if(error.code==='ENOENT')throw Error('所选文件已移动或删除');
          throw error;
        }finally{scope.close();}
      });
      function requireIdleStores(action){
        if(jobs.list().some(job=>['running','cancel_requested'].includes(job.status)))throw Error('请等待运行中的任务结束后再'+action);
        if(services.busy())throw Error('插件正在处理请求，请稍后'+action);
      }
      function snapshot(){
        requireIdleStores('备份');
        const declarations=plugins.list().filter(p=>p.backupDatabase).map(p=>({owner:p.id,name:p.backupDatabase}));
        try{return createSnapshot(profile,activeDirectory(profile),declarations);}
        catch(error){
          if(error.code==='ENOSPC'||error.errcode===13)throw Error('磁盘空间不足，未创建新备份。已有备份已保留，请释放空间后重试。');
          throw error;
        }
      }
      expose('backup:create',snapshot);
      expose('backup:list',()=>listSnapshots(profile));
      expose('backup:restore',id=>{
        requireIdleStores('恢复');
        const candidate=prepareRestore(profile,id);
        let next;
        try{
          next=openStores(candidate.directory);
          snapshot();
          candidate.commit();
        }catch(error){
          for(const store of next??[])store.close();
          candidate.discard();
          throw error;
        }
        startupAttempts.clear();startupIssues.clear();
        services.close();
        for(const store of [repository,plugins,jobs])store.close();
        [repository,plugins,jobs]=next;
        activateStartupPlugins();
        win.reload();
      });
      expose('plugins:upgrade',id=>{
        requirePluginExecution();
        const plugin=plugins.list().find(item=>item.id===id&&item.available);
        const entry=plugins.migration(id);
        if(!plugin||!entry)throw Error('插件迁移入口不可用');
        requireIdleStores('升级');
        const file=join(pluginDirectory(profile,id),plugin.backupDatabase);
        if(!existsSync(file))return '尚未创建数据库';
        const db=new DatabaseSync(file,{readOnly:true});
        let version;
        try{version=db.prepare('PRAGMA user_version').get().user_version;}finally{db.close();}
        if(version===plugin.databaseVersion)return '数据库已是当前版本';
        if(version>plugin.databaseVersion)return '数据库由较新版本创建，请使用兼容版本打开';
        const response=dialog.showMessageBoxSync(win,{type:'question',message:'升级'+plugin.name+'数据库？',
          detail:`版本 ${version} → ${plugin.databaseVersion}。工作台将先创建本机备份，在副本上升级并校验，成功后重新打开工作区。`,
          buttons:['取消','备份并升级'],defaultId:0,cancelId:0});
        if(response!==1)return '已取消升级';
        const backup=snapshot();
        let candidate,next;
        try{
          candidate=prepareRestore(profile,backup.id,{owner:id,name:plugin.backupDatabase,version:plugin.databaseVersion});
          const result=spawnSync(process.execPath,[join(__dirname,'migration-worker.mjs'),entry,join(candidate.directory,'plugin-data',id)],{
            env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},timeout:15000,killSignal:'SIGKILL',stdio:'ignore'});
          if(result.error||result.status!==0)throw Error('升级失败，原数据已保留');
          next=openStores(candidate.directory);
          candidate.commit();
        }catch{
          for(const store of next??[])store.close();
          candidate?.discard();
          return {failed:true,backupId:backup.id};
        }
        startupAttempts.clear();startupIssues.clear();
        services.close();
        for(const store of [repository,plugins,jobs])store.close();
        [repository,plugins,jobs]=next;
        activateStartupPlugins();
        win.reload();
        return '已升级';
      });
      expose('backup:reveal',id=>{
        if(typeof id!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id))throw Error('备份标识无效');
        const folder=join(app.getPath('userData'),'backups',id);
        verifySnapshot(folder);
        shell.showItemInFolder(folder);
      });
      expose('jobs:cancel',id=>jobs.cancel(id));
      expose('jobs:list',()=>jobs.list());
      expose('jobs:submit',request=>{
        requirePluginExecution();
        const owner=ownerOf(request);
        const manifest=plugins.list().find(p=>p.id===owner&&p.available);
        const job=manifest?.jobs?.find(job=>job.type===request.type);
        if(!job)throw Error('任务类型不可用');
        return jobs.submit(owner,job,request.key,request.input);
      });
      const icon=nativeImage.createFromPath(join(__dirname,'assets/WorkbenchTemplate.png'));
      icon.setTemplateImage(true);
      function setTray(enabled){
        if(!enabled){tray?.destroy();tray=null;return;}
        if(tray)return;
        tray=new Tray(icon);
        tray.setToolTip('Oh My Workbench');
        tray.setContextMenu(Menu.buildFromTemplate([
          {label:'打开工作台',click:show},
          {type:'separator'},
          {label:safeMode?'重新正常启动':'以安全模式重新启动',click:()=>{
            relaunchArgs=process.argv.slice(1).filter(arg=>arg!=='--safe-mode');
            if(!safeMode)relaunchArgs.push('--safe-mode');
            app.quit();
          }},
          {label:'退出工作台',click:()=>app.quit()}
        ]));
      }
      desktopPreferences=openPreferences(join(profile,'desktop.sqlite'),{shortcuts:process.platform==='darwin'?require('./shortcuts.cjs'):globalShortcut,show,setTray});
      expose('desktop:login',value=>{
        if(typeof value!=='boolean')throw Error('登录启动设置无效');
        app.setLoginItemSettings({openAtLogin:value});
        const actual=app.getLoginItemSettings().openAtLogin;
        if(actual!==value)throw Error('系统未确认修改，请检查 macOS 登录项设置');
        return actual;
      });
      expose('desktop:loginStatus',()=>app.getLoginItemSettings().openAtLogin);
      expose('desktop:read',()=>desktopPreferences.read());
      expose('desktop:tray',value=>desktopPreferences.setTray(value));
      expose('desktop:shortcut',value=>desktopPreferences.setShortcut(value));
      if(!app.getLoginItemSettings().wasOpenedAtLogin)show();
      else services.setWindowless(true);
      activateStartupPlugins();
      powerMonitor.on('resume',refreshJobViews);
      app.on('activate',show);
      app.on('second-instance',show);
    });
    app.on('window-all-closed',()=>{});
    let quitConfirmed=false,asking=false;
    app.on('web-contents-created',(_event,contents)=>{
      contents.on('will-prevent-unload',()=>{
        if(contents!==win?.webContents)return;
        quitConfirmed=false;
        relaunchArgs=null;
      });
    });
    app.on('before-quit',event=>{
      if(quitConfirmed||!jobs?.list().some(job=>['running','cancel_requested'].includes(job.status)))return;
      event.preventDefault();
      if(asking)return;
      asking=true;
      dialog.showMessageBox({type:'question',buttons:['继续运行','退出工作台'],defaultId:0,cancelId:0,
        message:'仍有后台任务正在执行',detail:'现在退出会中断本机执行。下次打开后可在任务中心查看记录。'}).then(({response})=>{
        if(response===1){quitConfirmed=true;app.quit();}else{relaunchArgs=null;}
      }).finally(()=>{asking=false;});
    });
    app.on('will-quit',()=>{
      powerMonitor.removeListener('resume',refreshJobViews);
      if(relaunchArgs)app.relaunch({args:relaunchArgs});
      desktopPreferences?.close();tray?.destroy();jobs?.close();services?.close();repository?.close();plugins?.close();
    });
  }
}
module.exports={startDesktop};
if(require.main===module)startDesktop();
