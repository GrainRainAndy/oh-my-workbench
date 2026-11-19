const {DatabaseSync}=require('node:sqlite');
const {createHash,randomUUID}=require('node:crypto');
const {openSync,readSync,closeSync,mkdirSync,readFileSync,writeFileSync,renameSync,rmSync,existsSync,copyFileSync,readdirSync,realpathSync}=require('node:fs');
const {join,dirname}=require('node:path');

const databases=['workspaces.sqlite','plugins.sqlite','jobs.sqlite'];
function digest(path){
  const hash=createHash('sha256');
  const buffer=Buffer.allocUnsafe(256*1024);
  const file=openSync(path,'r');
  try{
    let size;
    while((size=readSync(file,buffer,0,buffer.length,null))>0)
      hash.update(buffer.subarray(0,size));
    return hash.digest('hex');
  }finally{closeSync(file);}
}

function privatePath(entry){
  if(!entry||typeof entry.owner!=='string'||!/^[a-z][a-z0-9.-]*$/.test(entry.owner)||
     typeof entry.name!=='string'||!/^[a-zA-Z0-9_-]+\.sqlite$/.test(entry.name))throw Error('插件备份声明无效');
  return join('plugin-data',entry.owner,entry.name);
}
function pluginMap(directory){
  const file=join(directory,'plugin-locations.json');
  return existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
}
function pluginDirectory(profile,owner){
  const locations=pluginMap(activeDirectory(profile));
  if(!Object.hasOwn(locations,owner))return join(profile,'plugin-data',owner);
  const id=locations[owner];
  if(!isId(id))throw Error('插件数据指针损坏');
  return join(profile,'stores',id,'plugin-data',owner);
}
function checkIntegrity(path,expectedVersion){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    if(expectedVersion!==undefined&&db.prepare('PRAGMA user_version').get().user_version!==expectedVersion)throw Error('迁移后的数据库版本与插件声明不符');
    if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('数据库完整性校验失败');
  }finally{db.close();}
}
function checkDatabase(path,sha256){
  if(digest(path)!==sha256)throw Error('备份文件校验失败');
  checkIntegrity(path);
}
function verifySnapshot(directory){
  const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
  if(![1,2].includes(manifest.version)||manifest.files?.length!==databases.length)throw Error('备份格式无效');
  databases.forEach((name,index)=>{
    const file=manifest.files[index];
    if(file.name!==name)throw Error('备份文件名无效');
    checkDatabase(join(directory,name),file.sha256);
  });
  if(manifest.version===2){
    if(!Array.isArray(manifest.plugins))throw Error('插件备份清单无效');
    const owners=new Set();
    for(const entry of manifest.plugins){
      const path=privatePath(entry);
      if(owners.has(entry.owner))throw Error('插件备份重复');
      owners.add(entry.owner);
      if(entry.sha256!==null)checkDatabase(join(directory,path),entry.sha256);
    }
  }
  return manifest;
}

// All three host stores have a single writer in the main process. Keep this
// section synchronous so no job completion or workspace save can interleave.
function createSnapshot(profile,source=activeDirectory(profile),declarations=[]){
  const root=join(profile,'backups');
  mkdirSync(root,{recursive:true,mode:0o700});
  const manifest={version:1,id:randomUUID(),createdAt:new Date().toISOString(),files:[]};
  const staging=join(root,'.partial-'+manifest.id);
  mkdirSync(staging,{mode:0o700});
  try{
    writeFileSync(join(staging,'.preparing'),manifest.id,{flag:'wx',mode:0o600});
    for(const name of databases){
      const db=new DatabaseSync(join(source,name),{readOnly:true});
      const dest=join(staging,name);
      try{db.prepare('VACUUM INTO ?').run(dest);}finally{db.close();}
      manifest.files.push({name,sha256:digest(dest)});
    }
    if(declarations.length){
      manifest.version=2;
      manifest.plugins=declarations.map(entry=>{
        const relative=privatePath(entry);
        const original=join(pluginDirectory(profile,entry.owner),entry.name);
        if(!existsSync(original))return {...entry,sha256:null};
        if(realpathSync(original)!==join(realpathSync(profile),original.slice(profile.length+1)))throw Error('插件备份路径无效');
        const destination=join(staging,relative);
        mkdirSync(dirname(destination),{recursive:true,mode:0o700});
        const db=new DatabaseSync(original,{readOnly:true});
        try{db.prepare('VACUUM INTO ?').run(destination);}finally{db.close();}
        return {...entry,sha256:digest(destination)};
      });
    }
    writeFileSync(join(staging,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
    verifySnapshot(staging);
    renameSync(staging,join(root,manifest.id));
    return {id:manifest.id,createdAt:manifest.createdAt};
  }finally{rmSync(staging,{force:true,recursive:true});}
}
const isId=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
function activeDirectory(profile){
  const pointer=join(profile,'active-store.json');
  if(!existsSync(pointer))return profile;
  const {id}=JSON.parse(readFileSync(pointer,'utf8'));
  if(!isId(id))throw Error('活动存储指针损坏');
  const path=join(profile,'stores',id);
  if(!databases.every(name=>existsSync(join(path,name))))throw Error('活动数据库不完整');
  return path;
}
function listSnapshots(profile){
  const root=join(profile,'backups');
  if(!existsSync(root))return [];
  return readdirSync(root).filter(isId).flatMap(id=>{
    try{
      const m=JSON.parse(readFileSync(join(root,id,'manifest.json'),'utf8'));
      if(m.id!==id||typeof m.createdAt!=='string'||![1,2].includes(m.version))return [];
      const plugins=(m.version===1?[]:m.plugins).map(entry=>{
        privatePath(entry);
        return {owner:entry.owner,hasDatabase:entry.sha256!==null};
      });
      return [{id,createdAt:m.createdAt,plugins}];
    }catch{return [];}
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
// Called only after acquiring the desktop single-instance lock.
function discardInterruptedCopies(profile){
  const backups=join(profile,'backups');
  if(existsSync(backups)){
    for(const entry of readdirSync(backups,{withFileTypes:true})){
      if(!entry.isDirectory()||!entry.name.startsWith('.partial-'))continue;
      const id=entry.name.slice('.partial-'.length);
      const directory=join(backups,entry.name);
      const marker=join(directory,'.preparing');
      if(isId(id)&&existsSync(marker)&&readFileSync(marker,'utf8')===id)
        rmSync(directory,{recursive:true,force:true});
    }
  }
  const root=join(profile,'stores');
  if(!existsSync(root))return;
  const active=activeDirectory(profile);
  const retained=new Set(Object.values(pluginMap(active)));
  for(const item of readdirSync(root,{withFileTypes:true})){
    if(!item.isDirectory()||!isId(item.name)||retained.has(item.name))continue;
    const directory=join(root,item.name);
    if(directory===active)continue;
    const marker=join(directory,'.preparing');
    if(existsSync(marker)&&readFileSync(marker,'utf8')===item.name)
      rmSync(directory,{recursive:true,force:true});
  }
}
function prepareRestore(profile,id,upgrade){
  if(!isId(id))throw Error('备份标识无效');
  const source=join(profile,'backups',id);
  const manifest=verifySnapshot(source);
  if(manifest.id!==id)throw Error('备份标识不符');
  let target;
  if(upgrade!==undefined){
    const relative=privatePath(upgrade);
    if(!Number.isInteger(upgrade.version)||upgrade.version<1||upgrade.version>2147483647)throw Error('迁移目标版本无效');
    if(!manifest.plugins?.some(entry=>entry.owner===upgrade.owner&&entry.name===upgrade.name&&entry.sha256!==null))throw Error('备份未包含待迁移数据库');
    target={relative,version:upgrade.version};
  }
  const next=randomUUID();
  const directory=join(profile,'stores',next);
  mkdirSync(directory,{recursive:true,mode:0o700});
  try{
    const marker=join(directory,'.preparing');
    writeFileSync(marker,next,{flag:'wx',mode:0o600});
    for(const name of [...databases,'manifest.json'])copyFileSync(join(source,name),join(directory,name));
    const locations=pluginMap(activeDirectory(profile));
    for(const entry of manifest.version===2?manifest.plugins:[]){
      const relative=privatePath(entry);
      const destination=join(directory,relative);
      mkdirSync(dirname(destination),{recursive:true,mode:0o700});
      if(entry.sha256!==null)copyFileSync(join(source,relative),destination);
      locations[entry.owner]=next;
    }
    writeFileSync(join(directory,'plugin-locations.json'),JSON.stringify(locations),{mode:0o600});
    verifySnapshot(directory);
    rmSync(join(directory,'manifest.json'));
    let committed=false;
    return {directory,discard(){
      if(!committed)rmSync(directory,{recursive:true,force:true});
    },commit(){
      if(!existsSync(directory))throw Error('恢复副本已释放');
      if(target)checkIntegrity(join(directory,target.relative),target.version);
      const pointer=join(profile,'.active-'+next);
      try{
        writeFileSync(pointer,JSON.stringify({id:next}),{flag:'wx',mode:0o600});
        // From here on, retain the complete copy even if activation is interrupted.
        rmSync(marker);
        renameSync(pointer,join(profile,'active-store.json'));
        committed=true;
      }finally{rmSync(pointer,{force:true});}
    }};
  }catch(error){rmSync(directory,{recursive:true,force:true});throw error;}
}
module.exports={discardInterruptedCopies,pluginDirectory,createSnapshot,verifySnapshot,activeDirectory,listSnapshots,prepareRestore};
