export function newWorkspace(name){
  const paneId=crypto.randomUUID();
  return {
    schemaVersion:1,id:crypto.randomUUID(),name,revision:0,
    layout:{type:'leaf',paneId},activePaneId:paneId,views:{}
  };
}
