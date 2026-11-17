const {pathToFileURL}=require('node:url');
(async()=>{
  const plugin=await import(pathToFileURL(process.argv[2]).href);
  process.parentPort.on('message',async ({data:{id,method,params}})=>{
    try{process.parentPort.postMessage({type:'response',id,result:await plugin.call(method,params)});}
    catch{process.parentPort.postMessage({type:'response',id,error:'PLUGIN_ERROR'});}
  });
  process.parentPort.postMessage({type:'ready'});
})();
