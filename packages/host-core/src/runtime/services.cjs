const {providersFor}=require('./providers.cjs');
const {randomUUID}=require('node:crypto');

const {NotDispatched,ConfirmedCancellation}=require('./dispatch-error.cjs');

function matches(type,value){
  if(type==='string')return typeof value==='string'&&Buffer.byteLength(value)<=65536;
  return type==='string[]'&&Array.isArray(value)&&value.length<=256&&value.every(item=>matches('string',item))&&Buffer.byteLength(JSON.stringify(value))<=65536;
}
function createServices({plugins,fork,notify=()=>{},idleMs=60_000}){
  const generations=new Map();
  const failures=new Map();
  const failureWindowMs=10_000;
  function recentFailures(provider){
    return (failures.get(provider)??[]).filter(at=>performance.now()-at<failureWindowMs);
  }
  function recordFailure(provider){
    failures.set(provider,[...recentFailures(provider),performance.now()]);
  }
  let inFlight=0;
  const outstanding=new Set();
  let windowless=false,idleTimer;
  const disposing=new Set();
  function scheduleIdle(){
    clearTimeout(idleTimer);
    if(!windowless||inFlight||outstanding.size||!generations.size)return;
    idleTimer=setTimeout(()=>{
      const resident=new Set(plugins.list().filter(plugin=>plugin.backgroundMode==='resident').map(plugin=>plugin.id));
      for(const [id,generation] of generations)if(!resident.has(id))generation.disposeIdle();
    },idleMs);
    idleTimer.unref();
  }
  function start(provider){
    const existing=generations.get(provider);
    if(existing&&disposing.has(existing))throw new NotDispatched('服务正在释放资源，请稍后重试');
    if(existing)return existing;
    if(recentFailures(provider).length>=3)throw new NotDispatched('服务进程反复退出，请稍后重试');
    let child;
    try{child=fork(provider);}catch{recordFailure(provider);throw new NotDispatched('服务进程未能启动');}
    const pending=new Map();
    const dispatched=new Set();
    let ready,fail,disposeTimeout;
    const started=new Promise((resolve,reject)=>{ready=resolve;fail=reject;});
    function stop(){
      if(generations.get(provider)!==generation)return;
      generations.delete(provider);
      clearTimeout(timer);
      fail(new NotDispatched('服务未就绪'));
      for(const request of pending.values())request.reject(Error('服务已停止'));
      pending.clear();
      child.kill();
    }
    function failed(){
      if(generations.get(provider)!==generation)return;
      recordFailure(provider);
      stop();
    }
    const timer=setTimeout(failed,5000);
    const generation={started,stop,disposeIdle(){
      if(disposing.has(generation))return;
      disposing.add(generation);
      disposeTimeout=setTimeout(()=>child.kill(),5000);
      child.postMessage({type:'dispose'});
    },async invoke(message,signal,onProgress,fileDelegate){
      await started;
      if(generations.get(provider)!==generation)throw new NotDispatched('服务已停止');
      if(dispatched.size>=64)throw new NotDispatched('服务繁忙');
      const id=randomUUID();
      if(signal?.aborted)throw new ConfirmedCancellation('任务派发前已取消');
      const requestCancel=()=>child.postMessage({type:'cancel',id});
      let timeout;
      try{
        return await new Promise((resolve,reject)=>{
          timeout=setTimeout(()=>reject(Error('服务响应超时')),10000);
          pending.set(id,{resolve,reject,signal,onProgress,fileDelegate});
          signal?.addEventListener('abort',requestCancel,{once:true});
          child.postMessage({...message,id,hasSelectedFile:Boolean(fileDelegate)});
          dispatched.add(id);
          outstanding.add(id);
        });
      }finally{signal?.removeEventListener('abort',requestCancel);clearTimeout(timeout);pending.delete(id);}
    }};
    generations.set(provider,generation);
    child.on('message',message=>{
      if(message?.ready){clearTimeout(timer);ready();return;}
      const request=pending.get(message?.id);
      if(message?.type==='read-selected-file'){
        if(!request||request.readStarted||!request.fileDelegate)return;
        request.readStarted=true;
        const deliver=reply=>{
          if(pending.get(message.id)===request&&!request.signal?.aborted)
            child.postMessage({type:'selected-file',id:message.id,...reply});
        };
        request.fileDelegate.read().then(bytes=>deliver({bytes}),error=>{
          if(error.code==='EACCES'||error.code==='EPERM')request.fileDenied=true;
          deliver({error:true});
        }).catch(()=>{});
        return;
      }
      if(message?.type==='progress'){request?.onProgress?.(message.percent);return;}
      if(!dispatched.delete(message?.id))return;
      outstanding.delete(message.id);
      scheduleIdle();
      if(message?.cancelled&&request?.signal?.aborted){request.reject(new ConfirmedCancellation('处理器已确认取消'));return;}
      if(request)message.error?request.reject(Error(request.fileDenied?'FILE_ACCESS_DENIED':message.error==='DATA_VERSION_UNSUPPORTED'?'DATA_VERSION_UNSUPPORTED':'服务调用失败')):request.resolve(message.result);
    });
    child.once('exit',()=>{
      clearTimeout(disposeTimeout);
      for(const id of dispatched)outstanding.delete(id);
      dispatched.clear();
      if(disposing.delete(generation)){
        if(generations.get(provider)===generation)generations.delete(provider);
      }else failed();
      scheduleIdle();
    });
    return generation;
  }
  function resolveProvider(caller,{service,version,method,input}){
    const available=plugins.list().filter(plugin=>plugin.enabled&&plugin.available!==false);
    const dependency=available.find(plugin=>plugin.id===caller)?.usesServices?.find(s=>s.id===service&&s.version===version);
    if(!dependency)throw new NotDispatched('视图未声明此服务');
    const providers=providersFor(available,dependency);
    if(providers.length!==1)throw new NotDispatched(providers.length?'服务提供者不唯一':'服务未启用');
    const provider=providers[0];
    const spec=provider.services.find(s=>s.id===service&&s.version===version);
    if(!Object.hasOwn(spec.methods,method)||!matches(spec.methods[method].input,input))throw new NotDispatched('服务参数无效');
    return provider;
  }
  return {resolveProvider,async activate(id){
    clearTimeout(idleTimer);
    inFlight++;
    try{await start(id).started;}finally{inFlight--;scheduleIdle();}
  },async call(caller,{service,version,method,input},signal,onProgress,fileDelegate){
    const provider=resolveProvider(caller,{service,version,method,input});
    const spec=provider.services.find(s=>s.id===service&&s.version===version);
    inFlight++;
    clearTimeout(idleTimer);
    let result,generation;
    try{
      generation=start(provider.id);
      result=await generation.invoke({service,method,input},signal,onProgress,fileDelegate);
    }finally{inFlight--;scheduleIdle();}
    if(!matches(spec.methods[method].output,result))throw Error('服务结果无效');
    if(spec.methods[method].invalidates===true&&generations.get(provider.id)===generation)notify({service,version,provider:provider.id});
    return result;
  },setWindowless(value){windowless=value;scheduleIdle();},busy:()=>inFlight>0||outstanding.size>0||disposing.size>0,stop:id=>generations.get(id)?.stop(),close(){windowless=false;clearTimeout(idleTimer);for(const g of generations.values())g.stop();}};
}
module.exports={createServices};
