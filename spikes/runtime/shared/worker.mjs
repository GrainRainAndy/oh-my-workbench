import { pathToFileURL } from 'node:url';
const plugin=await import(pathToFileURL(process.argv[2]).href);
process.on('message',async ({id,method,params})=>{
  try { const result=await plugin.call(method,params);if(process.connected)process.send({type:'response',id,result}); }
  catch { if(process.connected)process.send({type:'response',id,error:'PLUGIN_ERROR'}); }
});
process.on('disconnect',()=>process.exit(0));
process.send({type:'ready'});
