const {pathToFileURL}=require('node:url');
(async()=>{
  const plugin=await import(pathToFileURL(process.argv[2]).href);
  if(typeof plugin.call!=='function'&&typeof plugin.activate!=='function')throw Error('Invalid backend');
  const cleanup=await plugin.activate?.({dataDirectory:process.argv[3],showNotification(body){process.parentPort.postMessage({type:'notification',body});}});
  if(cleanup!==undefined&&typeof cleanup!=='function')throw Error('Invalid backend disposer');
  const dispose=cleanup??plugin.dispose;
  const active=new Map();
  const reads=new Map();
  process.parentPort.on('message',async({data})=>{
    if(data.type==='dispose'){
      try{await dispose?.();process.exit(0);}catch{process.exit(1);}
    }
    if(data.type==='selected-file'){
      const pending=reads.get(data.id);
      if(pending){
        reads.delete(data.id);
        data.error?pending.reject(Error('文件授权不可用')):pending.resolve(data.bytes);
      }
      return;
    }
    if(data.type==='cancel'){
      active.get(data.id)?.abort();
      reads.get(data.id)?.reject(Error('读取已取消'));
      reads.delete(data.id);
      return;
    }
    const controller=new AbortController();
    active.set(data.id,controller);
    const confirmed=Symbol('cancelled');
    let readStarted=false;
    try{
      const result=await plugin.call(data.service,data.method,data.input,{dataDirectory:process.argv[3],signal:controller.signal,
        ...(data.hasSelectedFile?{async readSelectedFile(){
          if(readStarted||controller.signal.aborted||!active.has(data.id))throw Error('文件授权不可用');
          readStarted=true;
          return new Promise((resolve,reject)=>{
            reads.set(data.id,{resolve,reject});
            process.parentPort.postMessage({type:'read-selected-file',id:data.id});
          });
        }}:{}),
        reportProgress(percent){
          if(!Number.isInteger(percent)||percent<0||percent>100)throw Error('任务进度无效');
          if(active.has(data.id))process.parentPort.postMessage({id:data.id,type:'progress',percent});
        },confirmCancelled(){if(!controller.signal.aborted)throw Error();throw confirmed;}});
      process.parentPort.postMessage({id:data.id,result});
    }catch(error){process.parentPort.postMessage(error===confirmed?{id:data.id,cancelled:true}:{id:data.id,error:error?.code==='DATA_VERSION_UNSUPPORTED'?'DATA_VERSION_UNSUPPORTED':'服务调用失败'});}
    finally{active.delete(data.id);reads.get(data.id)?.reject(Error('调用已结束'));reads.delete(data.id);}
  });
  process.parentPort.postMessage({ready:true});
})().catch(()=>process.exit(1));
