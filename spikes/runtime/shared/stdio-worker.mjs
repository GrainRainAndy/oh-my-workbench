// Trusted fixture process for the Tauri probe. Stdout is reserved for JSONL RPC.
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { discover } from './package.mjs';
const {entries}=await discover(process.argv[2]);
const plugin=await import(pathToFileURL(entries.service).href);
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const input=createInterface({input:process.stdin});
input.on('line',async line=>{
  let message;
  try {
    message=JSON.parse(line);
    if(!Number.isSafeInteger(message.id)||!['work','stats'].includes(message.method))throw Error('INVALID_ARGUMENT');
    send({type:'response',id:message.id,result:await plugin.call(message.method,message.params)});
  } catch {send({type:'response',id:message?.id,error:'PLUGIN_ERROR'});}
});
input.on('close',()=>process.exit(0));
send({type:'ready',nodeVersion:process.version,pid:process.pid});
