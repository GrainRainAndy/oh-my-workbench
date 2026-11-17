import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const terminal=new Set(['succeeded','failed','cancelled']);
const allowed={queued:['running'],running:['cancel_requested','succeeded','failed','cancelled','unknown','interrupted'],unknown:['cancel_requested','succeeded','failed','cancelled','running'],cancel_requested:['cancelled','succeeded','failed','unknown'],interrupted:[]};
// Single writer, small JSON fixture. Atomic rename is NOT a power-loss durability guarantee.
export class Journal {
  records=[]; ready=false; queue=Promise.resolve();
  constructor(file){this.file=file;}
  async load() {
    this.ready=false;
    try {this.records=JSON.parse(await readFile(this.file,'utf8'));}
    catch(e){if(e.code!=='ENOENT')throw e;}
    if(!Array.isArray(this.records))throw Error('INVALID_JOURNAL');
    this.records=this.records.map(r=>['queued','running','cancel_requested'].includes(r.status)?{...r,status:'unknown'}:r);
    this.ready=true;
  }
  get(id){return structuredClone(this.records.find(r=>r.id===id));}
  change(fn){
    const result=this.queue.then(async()=>{
      if(!this.ready)throw Error('JOURNAL_NOT_READY');
      const next=structuredClone(this.records); const value=fn(next);
      const temporary=this.file+'.tmp';
      await writeFile(temporary,JSON.stringify(next));await rename(temporary,this.file);
      this.records=next;return structuredClone(value);
    });
    this.queue=result.catch(()=>{});return result;
  }
  submit(key,input){return this.change(records=>{
    // Fixture inputs use deterministic field order; production requires canonical encoding.
    const digest=JSON.stringify(input);const old=records.find(r=>r.key===key);
    if(old){if(old.digest!==digest)throw Error('IDEMPOTENCY_CONFLICT');return old;}
    const r={id:randomUUID(),key,digest,status:'queued'};records.push(r);return r;
  });}
  update(id,status){return this.change(records=>{
    const r=records.find(r=>r.id===id);if(!r)throw Error('NOT_FOUND');
    if(terminal.has(r.status))throw Error('TERMINAL_STATE');
    if(!allowed[r.status]?.includes(status))throw Error('INVALID_TRANSITION');
    r.status=status;return r;
  });}
}
