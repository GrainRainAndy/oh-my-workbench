import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { discover } from './package.mjs';
export class Supervisor {
  generation=0; child=null; starting=null; pending=new Map(); sequence=0;
  async start(directory) {
    if(this.starting)return this.starting;
    this.starting=this.activate(directory);
    try { await this.starting; } finally { this.starting=null; }
  }
  async activate(directory) {
    if(this.child) throw Error('ALREADY_RUNNING');
    const {entries}=await discover(directory);
    const generation=++this.generation;
    const child=fork(fileURLToPath(new URL('./worker.mjs',import.meta.url)),[entries.service],{stdio:['ignore','ignore','pipe','ipc'],execArgv:[]});
    this.child=child;
    const ready=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{reject(Error('ACTIVATION_TIMEOUT'));child.kill();},5000);
      child.once('error',e=>{clearTimeout(timer);reject(e);});
      child.once('exit',()=>{clearTimeout(timer);reject(Error('ACTIVATION_EXIT'));});
      child.on('message',m=>{if(m.type==='ready'){clearTimeout(timer);resolve();}});
    });
    child.on('message',m=>{
      if(m.type!=='response' || generation!==this.generation) return;
      const p=this.pending.get(m.id); if(!p)return;
      clearTimeout(p.timer);this.pending.delete(m.id);
      m.error?p.reject(Error(m.error)):p.resolve(m.result);
    });
    child.on('exit',()=>{
      if(this.child!==child)return;
      this.child=null;
      for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('PROCESS_EXITED'));}
      this.pending.clear();
    });
    await ready;
  }
  client() {
    const generation=this.generation; let disposed=false;
    return {
      call: async (method,params,timeout=3000)=>{
        if(disposed)throw Error('CLIENT_DISPOSED');
        if(generation!==this.generation)throw Error('STALE_GENERATION');
        if(!this.child?.connected)throw Error('PROCESS_EXITED');
        const id=++this.sequence;
        return new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('TIMEOUT'));},timeout);
          this.pending.set(id,{resolve,reject,timer});
          this.child.send({id,method,params},e=>{if(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});
        });
      },
      dispose:()=>{disposed=true;}
    };
  }
  async crash() { if(!this.child)return; const c=this.child; const ended=once(c,'exit');c.kill('SIGKILL');await ended; }
  async stop() { if(!this.child)return; const c=this.child; const ended=once(c,'exit'); c.kill('SIGTERM'); await ended; }
}
