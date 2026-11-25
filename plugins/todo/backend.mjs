import {detailColumns,listSchema,listOrderSchema,archiveSchema} from './migrate.mjs';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';

let db;
function open(directory){
  if(db)return db;
  const candidate=new DatabaseSync(join(directory,'todo.sqlite'));
  try{
    const version=candidate.prepare('PRAGMA user_version').get().user_version;
    if(version===0&&!candidate.prepare("SELECT name FROM sqlite_schema WHERE type='table'").get()){
      candidate.exec(`BEGIN IMMEDIATE; CREATE TABLE items(id TEXT PRIMARY KEY,title TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN(0,1))); ${detailColumns} ${listSchema} ${listOrderSchema} ${archiveSchema} PRAGMA user_version=5; COMMIT`);
    }else if([1,2,3,4].includes(version))throw Error('请在插件管理中升级待办数据库');
    else if(version!==5)throw Error('待办数据库版本不兼容');
    db=candidate;
    return db;
  }catch(error){candidate.close();throw error;}
}

function validateDetails(notes,due,priority){
  if(typeof notes!=='string'||notes.length>4000||typeof due!=='string'||!['none','low','medium','high'].includes(priority))throw Error('事项详情无效');
  if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||Temporal.PlainDate.from(due).toString()!==due))throw Error('到期日期无效');
}

export function call(service,method,input,{dataDirectory}){
  if(service!=='workbench.todo.items')throw Error('未知待办服务');
  const store=open(dataDirectory);
  if(method==='lists')return store.prepare('SELECT id,name FROM lists WHERE archived=? ORDER BY position').all(Number(input==='archived')).map(row=>JSON.stringify(row));
  if(method==='setArchived'){
    if(!Array.isArray(input)||input.length!==2||input[0]==='inbox'||!['0','1'].includes(input[1]))throw Error('清单归档参数无效');
    const [id,value]=input;
    if(!store.prepare('UPDATE lists SET archived=? WHERE id=? AND archived<>?').run(Number(value),id,Number(value)).changes)throw Error('清单归档状态已更改');
    return id;
  }
  if(method==='removeList'){
    if(!Array.isArray(input)||input.length!==2||input[0]==='inbox')throw Error('无法删除此清单');
    const [id,name]=input;
    const result=store.prepare('DELETE FROM lists WHERE id=? AND name=? AND NOT EXISTS(SELECT 1 FROM items WHERE listId=?)').run(id,name,id);
    if(!result.changes)throw Error('清单含有事项或名称已更改');
    return id;
  }
  if(method==='renameList'){
    if(!Array.isArray(input)||input.length!==3)throw Error('清单改名参数无效');
    const [id,original,name]=input;
    if(typeof name!=='string'||!name.trim()||name.length>80)throw Error('清单名称无效');
    if(!store.prepare('UPDATE lists SET name=? WHERE id=? AND name=?').run(name.trim(),id,original).changes)throw Error('清单名称已更改');
    return id;
  }
  if(method==='swapLists'){
    if(!Array.isArray(input)||input.length!==2)throw Error('清单排序参数无效');
    store.exec('BEGIN IMMEDIATE');
    try{
      const rows=store.prepare('SELECT id,position FROM lists WHERE archived=0 ORDER BY position').all();
      const index=rows.findIndex(row=>row.id===input[0]);
      if(index<0||!rows[index+1]||rows[index+1].id!==input[1])throw Error('清单顺序已变更');
      const update=store.prepare('UPDATE lists SET position=? WHERE id=?');
      update.run(rows[index+1].position,input[0]);
      update.run(rows[index].position,input[1]);
      store.exec('COMMIT');
      return input[0];
    }catch(error){store.exec('ROLLBACK');throw error;}
  }
  if(method==='listItems'||method==='list'){
    const scoped=method==='listItems';
    if(scoped&&(!Array.isArray(input)||input.length!==2||typeof input[0]!=='string'))throw Error('清单筛选无效');
    const filter=scoped?input[1]:input;
    if(!['open','completed','today','planned'].includes(filter))throw Error('待办视图无效');
    const conditions=['completed=?','listId IN(SELECT id FROM lists WHERE archived=0)'],params=[Number(filter==='completed')];
    if(scoped){conditions.push('listId=?');params.push(input[0]);}
    if(filter==='today'){conditions.push('due=?');params.push(Temporal.Now.plainDateISO().toString());}
    if(filter==='planned')conditions.push("due<>''");
    const order=filter==='planned'?'due,rowid DESC':'rowid DESC';
    return store.prepare('SELECT id,title,notes,due,priority,detailRevision,listId FROM items WHERE '+conditions.join(' AND ')+' ORDER BY '+order)
      .all(...params).map(row=>JSON.stringify(row));
  }
  if(!Array.isArray(input)||typeof input[0]!=='string'||!/^[a-f0-9-]{36}$/.test(input[0]))throw Error('事项标识无效');
  const [id,value,next]=input;
  if(method==='createList'&&input.length===2){
    if(typeof value!=='string'||!value.trim()||value.length>80)throw Error('清单名称无效');
    store.prepare('INSERT INTO lists(id,name,position) VALUES(?,?,(SELECT COALESCE(MAX(position),0)+1 FROM lists)) ON CONFLICT(id) DO NOTHING').run(id,value.trim());
    if(store.prepare('SELECT name FROM lists WHERE id=?').get(id).name!==value.trim())throw Error('清单标识冲突');
  }else if(method==='moveItem'&&input.length===3){
    if(!store.prepare('UPDATE items SET listId=? WHERE id=? AND listId=? AND EXISTS(SELECT 1 FROM lists WHERE id=? AND archived=0)').run(next,id,value,next).changes)throw Error('事项归属已变更或目标清单不存在');
  }else if(method==='create'&&input.length===2||method==='createInList'&&input.length===3||
    method==='createWithDetails'&&input.length===6){
    if(typeof value!=='string'||!value.trim()||value.length>160)throw Error('事项名称无效');
    const target=method==='create'?'inbox':next;
    const [notes,due,priority]=method==='createWithDetails'?input.slice(3):['','','none'];
    validateDetails(notes,due,priority);
    store.prepare(`INSERT INTO items(id,title,listId,notes,due,priority)
      SELECT ?,?,id,?,?,? FROM lists WHERE id=? AND archived=0 ON CONFLICT(id) DO NOTHING`)
      .run(id,value.trim(),notes,due,priority,target);
    const saved=store.prepare('SELECT title,listId,notes,due,priority FROM items WHERE id=?').get(id);
    if(!saved||saved.title!==value.trim()||saved.listId!==target||
      method==='createWithDetails'&&(saved.notes!==notes||saved.due!==due||saved.priority!==priority))throw Error('事项标识冲突');
  }else if(method==='setDetails'&&input.length===5){
    const [,expected,notes,due,priority]=input;
    validateDetails(notes,due,priority);
    if(!/^\d+$/.test(expected)||!store.prepare('UPDATE items SET notes=?,due=?,priority=?,detailRevision=detailRevision+1 WHERE id=? AND detailRevision=?').run(notes,due,priority,id,Number(expected)).changes)throw Error('事项详情已更改');
  }else if(method==='rename'&&input.length===4&&['0','1'].includes(next)){
    const title=input[3];
    if(typeof title!=='string'||!title.trim()||title.length>160)throw Error('事项名称无效');
    if(!store.prepare('UPDATE items SET title=? WHERE id=? AND title=? AND completed=?').run(title.trim(),id,value,Number(next)).changes)throw Error('事项已更改');
  }else if(method==='remove'&&input.length===3&&['0','1'].includes(next)){
    if(!store.prepare('DELETE FROM items WHERE id=? AND title=? AND completed=?').run(id,value,Number(next)).changes)throw Error('事项已更改');
  }else if(method==='setCompleted'&&input.length===3&&['0','1'].includes(value)&&['0','1'].includes(next)){
    if(!store.prepare('UPDATE items SET completed=? WHERE id=? AND completed=?').run(Number(next),id,Number(value)).changes)throw Error('事项状态已更改');
  }else throw Error('待办请求无效');
  return id;
}

export function dispose(){db?.close();db=undefined;}
