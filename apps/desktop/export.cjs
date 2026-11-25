const {open,rename,unlink}=require('node:fs/promises');
const {randomUUID}=require('node:crypto');

async function writeExport(filePath,text){
  const temporary=filePath+'.'+randomUUID()+'.tmp';
  let ownsTemporary=false;
  try{
    const file=await open(temporary,'wx',0o600);
    ownsTemporary=true;
    try{await file.writeFile(text);await file.sync();}finally{await file.close();}
    await rename(temporary,filePath);
    ownsTemporary=false;
  }finally{
    if(ownsTemporary)await unlink(temporary).catch(()=>console.warn('无法清理导出临时文件'));
  }
}
async function exportJobResult(jobs,id,selectDestination){
  if(typeof id!=='string')throw Error('任务编号无效');
  const job=jobs.list().find(record=>record.id===id);
  if(job?.status!=='succeeded'||typeof job.result!=='string')throw Error('任务结果不可用');
  const {canceled,filePath}=await selectDestination();
  if(canceled||!filePath)return false;
  await writeExport(filePath,job.result);
  return true;
}
module.exports={writeExport,exportJobResult};
