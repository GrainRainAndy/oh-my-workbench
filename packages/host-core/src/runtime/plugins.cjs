const {providersFor}=require('./providers.cjs');
const {DatabaseSync}=require('node:sqlite');
const {readdirSync,readFileSync,realpathSync,statSync}=require('node:fs');
const {join,dirname}=require('node:path');

function openPlugins(root, database){
  const manifests=new Map();
  const backends=new Map();
  const migrations=new Map();
  const issues=[];
  const candidates=new Map();
  for(const entry of readdirSync(root,{withFileTypes:true})){
    if(!entry.isDirectory())continue;
    try{
      const manifest=JSON.parse(readFileSync(join(root,entry.name,'manifest.json'),'utf8'));
      if(typeof manifest.id!=='string'||!/^[a-z][a-z0-9.-]*$/.test(manifest.id))throw Error('插件标识无效或重复');
      if(typeof manifest.name!=='string'||!manifest.name.trim()||!Array.isArray(manifest.views))throw Error('插件清单无效');
      if(manifest.description!==undefined&&typeof manifest.description!=='string')throw Error('插件说明无效');
      if(manifest.backgroundMode!==undefined&&!['resident','on-demand'].includes(manifest.backgroundMode))throw Error('插件后台模式无效');
      if(manifest.activationEvents!==undefined&&(!Array.isArray(manifest.activationEvents)||manifest.activationEvents.some(event=>typeof event!=='string')))throw Error('插件激活事件无效');
      if(manifest.backgroundMode==='resident'&&(!manifest.description?.trim()||!manifest.activationEvents?.includes('onAppStart')))throw Error('常驻后台需要说明用途并声明启动事件');
      const types=new Set();
      for(const view of manifest.views){
        if(typeof view.type!=='string'||!view.type||types.has(view.type)||typeof view.title!=='string'||!view.title)throw Error('插件视图无效');
        if(view.description!==undefined&&typeof view.description!=='string')throw Error('视图说明无效');
        for(const key of ['configVersion','stateVersion']){
          if(Object.hasOwn(view,key)&&(!Number.isSafeInteger(view[key])||view[key]<1))throw Error('插件视图版本无效');
        }
        types.add(view.type);
      }
      for(const key of ['usesServices','services']){
        if(manifest[key]===undefined)continue;
        if(!Array.isArray(manifest[key])||manifest[key].some(s=>!s||typeof s.id!=='string'||!s.id||
          typeof s.version!=='string'||!s.version||(s.optional!==undefined&&typeof s.optional!=='boolean')))throw Error('服务声明无效');
      }
      const dependencies=new Set();
      for(const dependency of manifest.usesServices??[]){
        const identity=JSON.stringify([dependency.id,dependency.version]);
        if(dependencies.has(identity))throw Error('服务依赖重复');
        dependencies.add(identity);
        if(dependency.provider!==undefined&&(typeof dependency.provider!=='string'||!/^[a-z][a-z0-9.-]*$/.test(dependency.provider)))throw Error('绑定提供者无效');
      }
      let migration;
      if(manifest.databaseVersion!==undefined){
        if(!Number.isSafeInteger(manifest.databaseVersion)||manifest.databaseVersion<1||manifest.databaseVersion>2147483647||
          typeof manifest.backupDatabase!=='string'||!/^[a-zA-Z0-9_-]+\.sqlite$/.test(manifest.backupDatabase))throw Error('插件迁移声明无效');
        const directory=realpathSync(join(root,entry.name));
        migration=realpathSync(join(directory,'migrate.mjs'));
        if(dirname(migration)!==directory||!statSync(migration).isFile())throw Error('插件迁移入口无效');
      }
      let backend;
      if(manifest.services?.length||manifest.activationEvents?.includes('onAppStart')){
        const directory=realpathSync(join(root,entry.name));
        backend=realpathSync(join(directory,'backend.mjs'));
        if(dirname(backend)!==directory)throw Error('插件后台路径无效');
      }
      const group=candidates.get(manifest.id)??[];
      group.push({manifest,backend,migration,folder:entry.name});
      candidates.set(manifest.id,group);
    }catch{
      issues.push({folder:entry.name,reason:'插件清单或入口无效'});
    }
  }
  for(const [id,group] of candidates){
    if(group.length>1){
      for(const item of group)issues.push({folder:item.folder,reason:'插件标识重复：'+id});
      continue;
    }
    const [{manifest,backend,migration,folder}]=group;
    manifests.set(id,{...manifest,folder});
    if(migration)migrations.set(id,migration);
    if(backend)backends.set(id,backend);
  }
  const db=new DatabaseSync(database);
  db.exec('CREATE TABLE IF NOT EXISTS plugin_settings (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL)');
  function list(){
    const disabled=new Set(db.prepare('SELECT id FROM plugin_settings WHERE enabled=0').all().map(row=>row.id));
    const active=[...manifests.values()].filter(plugin=>!disabled.has(plugin.id));
    const reasons=new Map();
    const visiting=new Set();
    function issue(plugin){
      if(reasons.has(plugin.id))return reasons.get(plugin.id);
      if(visiting.has(plugin.id))return '必需服务循环依赖：'+plugin.id;
      visiting.add(plugin.id);
      let reason=null;
      for(const dep of plugin.usesServices??[]){
        if(dep.optional)continue;
        const providers=providersFor(active,dep);
        if(providers.length!==1){
          reason=(providers.length?'多个提供者：':'缺少必需服务：')+dep.id+' @ '+dep.version;
          if(!providers.length&&dep.provider){
            const preferred=manifests.get(dep.provider);
            if(preferred&&disabled.has(preferred.id))reason+='（指定提供者「'+preferred.name+'」已停用）';
          }
          break;
        }
        if(providers[0]!==plugin)reason=issue(providers[0]);
        if(reason)break;
      }
      visiting.delete(plugin.id);
      reasons.set(plugin.id,reason);
      return reason;
    }
    return Array.from(manifests.values(),plugin=>{
      const enabled=!disabled.has(plugin.id);
      const dependencyIssue=enabled?issue(plugin):null;
      return {...plugin,enabled,available:enabled&&!dependencyIssue,dependencyIssue};
    });
  }
  return {list,migration:id=>migrations.get(id),issues:()=>issues.map(issue=>({...issue})),backend:id=>backends.get(id),setEnabled({id,enabled}){
    if(!manifests.has(id)||typeof enabled!=='boolean')throw Error('无效的插件设置');
    db.prepare('INSERT INTO plugin_settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled').run(id,Number(enabled));
    return list();
  },close:()=>db.close()};
}
module.exports={openPlugins};
