import {openLibrary} from './migrate.mjs';
import {localTargets,pinReferences,service as libraryService,viewKey} from './pins.mjs';

let db;

function entries(payload={}){
  const categories={targets:localTargets(payload),pinnedViews:pinReferences(payload)};
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!(
    Object.hasOwn(categories,key)&&Array.isArray(payload[key])&&payload[key].length===categories[key].length
  )))throw Error('入口参数无效');
  return Object.entries(categories).flatMap(([key,records])=>records.map((record,index)=>{
    if(Object.keys(payload[key][index]).some(field=>!Object.hasOwn(record,field)))throw Error('入口包含未声明字段');
    const identity=key==='targets'?record.id:viewKey(record);
    return [JSON.stringify([key,identity]),key,JSON.stringify(record)];
  }));
}

function read(){
  const library={targets:[],pinnedViews:[]};
  for(const row of db.prepare('SELECT category,value FROM entries WHERE removed=0 ORDER BY rowid').all())
    library[row.category].push(JSON.parse(row.value));
  return JSON.stringify(library);
}

export function call(service,method,input,{dataDirectory}){
  if(service!==libraryService)throw Error('未知快捷入口服务');
  db??=openLibrary(dataDirectory);
  if(method==='read')return read();
  const payload=JSON.parse(input);
  const legacy=method==='importLegacy';
  if(!legacy&&(method!=='change'||!payload||typeof payload!=='object'||Array.isArray(payload)||
    Object.keys(payload).some(key=>key!=='add'&&key!=='remove')))throw Error('未知快捷入口操作');
  const add=entries(legacy?payload:payload.add);
  const remove=legacy?[]:entries(payload.remove);

  db.exec('BEGIN IMMEDIATE');
  try{
    const forget=db.prepare('INSERT INTO entries VALUES(?,?,?,1) ON CONFLICT(key) DO UPDATE SET removed=1');
    const remember=db.prepare(legacy?'INSERT OR IGNORE INTO entries VALUES(?,?,?,0)':
      'INSERT INTO entries VALUES(?,?,?,0) ON CONFLICT(key) DO UPDATE SET value=excluded.value,removed=0');
    for(const entry of remove)forget.run(...entry);
    for(const entry of add)remember.run(...entry);
    if(Buffer.byteLength(read())>65536)throw Error('快捷入口库已满');
    db.exec('COMMIT');
    return 'saved';
  }catch(error){db.exec('ROLLBACK');throw error;}
}

export function dispose(){
  db?.close();
  db=undefined;
}
