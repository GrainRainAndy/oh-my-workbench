const {DatabaseSync}=require('node:sqlite');
const {randomUUID,createHash}=require('node:crypto');

const {NotDispatched,ConfirmedCancellation}=require('../runtime/dispatch-error.cjs');

function openJobs(file,{execute,changed=()=>{}}){
  const db=new DatabaseSync(file);
  db.exec(`CREATE TABLE IF NOT EXISTS jobs(
    id TEXT PRIMARY KEY,owner TEXT NOT NULL,jobType TEXT NOT NULL,title TEXT NOT NULL,
    requestKey TEXT NOT NULL,digest TEXT NOT NULL,input TEXT NOT NULL,status TEXT NOT NULL,
    result TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,revision INTEGER NOT NULL,
    UNIQUE(owner,jobType,requestKey))`);
  db.prepare("UPDATE jobs SET status='unknown',updatedAt=?,revision=revision+1 WHERE status IN ('running','cancel_requested')").run(Date.now());
  db.exec('CREATE TABLE IF NOT EXISTS job_progress(jobId TEXT PRIMARY KEY, percent INTEGER NOT NULL)');
  const fields='id,owner,jobType,title,status,result,createdAt,updatedAt,revision,(SELECT percent FROM job_progress WHERE jobId=jobs.id) AS progress';
  const progress=db.prepare('INSERT INTO job_progress VALUES(?,?) ON CONFLICT(jobId) DO UPDATE SET percent=excluded.percent WHERE excluded.percent>percent');
  const byId=db.prepare('SELECT '+fields+' FROM jobs WHERE id=?');
  const controllers=new Map();
  let closed=false;
  function finish(id,status,result=null){
    controllers.delete(id);
    if(closed)return;
    db.prepare("UPDATE jobs SET status=?,result=?,updatedAt=?,revision=revision+1 WHERE id=? AND status IN ('running','cancel_requested')").run(status,result,Date.now(),id);
    changed();
  }
  return {
    list:()=>db.prepare('SELECT '+fields+' FROM jobs ORDER BY createdAt DESC,rowid DESC').all().map(job=>({...job,canCancel:job.status==='running'&&controllers.has(job.id)})),
    cancel(id){
      const job=byId.get(id);
      if(!job)throw Error('任务不存在');
      if(job.status!=='running')return job;
      const controller=controllers.get(id);
      if(!controller)throw Error('处理器不支持取消');
      db.prepare("UPDATE jobs SET status='cancel_requested',updatedAt=?,revision=revision+1 WHERE id=?").run(Date.now(),id);
      controller.abort();changed();
      return byId.get(id);
    },
    submit(owner,job,key,input){
      if(typeof key!=='string'||!key.trim()||key.length>128)throw Error('任务提交标识无效');
      if(!Array.isArray(input)||input.length>256)throw Error('任务输入格式无效');
      const submittedInput=Array.from(input);
      if(!submittedInput.every(x=>typeof x==='string'&&x.length<=65536))throw Error('任务输入格式无效');
      const payload=JSON.stringify(submittedInput);
      if(Buffer.byteLength(payload)>65536)throw Error('任务输入过大');
      const digest=createHash('sha256').update(payload).digest('hex');
      const existing=db.prepare('SELECT id,digest FROM jobs WHERE owner=? AND jobType=? AND requestKey=?').get(owner,job.type,key);
      if(existing){
        if(existing.digest!==digest)throw Error('任务提交标识冲突');
        return byId.get(existing.id);
      }
      const id=randomUUID(),now=Date.now();
      db.prepare("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,'running',NULL,?,?,1)").run(id,owner,job.type,job.title,key,digest,payload,now,now);
      const controller=job.cancellable===true?new AbortController():null;
      if(controller)controllers.set(id,controller);
      changed();
      let lastPercent=-1,finished=false;
      function reportProgress(percent){
        if(closed||finished||!Number.isInteger(percent)||percent<=lastPercent||percent<0||percent>100)return;
        db.exec('BEGIN IMMEDIATE');
        try{
          progress.run(id,percent);
          db.prepare('UPDATE jobs SET updatedAt=?,revision=revision+1 WHERE id=?').run(Date.now(),id);
          db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}
        lastPercent=percent;
        changed();
      }
      Promise.resolve().then(()=>execute(owner,job,submittedInput,controller?.signal,reportProgress)).then(
        result=>typeof result==='string'&&Buffer.byteLength(result)<=65536?finish(id,'succeeded',result):finish(id,'unknown'),
        error=>error instanceof ConfirmedCancellation&&controller?.signal.aborted?finish(id,'cancelled'):error instanceof NotDispatched?finish(id,'failed',error.message):finish(id,'unknown')
      ).finally(()=>{finished=true;});
      return byId.get(id);
    },
    close(){closed=true;db.close();}
  };
}
module.exports={openJobs};
