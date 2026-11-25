import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('local todo survives restart, retries, completion and restoration',async t=>{
  const backend=await import('../../plugins/todo/backend.mjs');
  const dataDirectory=await mkdtemp(join(tmpdir(),'workbench-todo-'));
  t.after(async()=>{backend.dispose();await rm(dataDirectory,{recursive:true,force:true});});
  const call=(method,input)=>backend.call('workbench.todo.items',method,input,{dataDirectory});
  const id=crypto.randomUUID();
  call('create',[id,'整理资料']);
  backend.dispose();
  call('create',[id,'整理资料']);
  assert.throws(()=>call('create',[id,'冲突']));
  call('setCompleted',[id,'0','1']);
  assert.deepEqual(call('list','open'),[]);
  assert.equal(JSON.parse(call('list','completed')[0]).title,'整理资料');
  assert.throws(()=>call('setCompleted',[id,'0','1']));
  call('setCompleted',[id,'1','0']);
  assert.equal(call('list','open').length,1);
  call('setDetails',[id,'0','附原始附件','2032-02-29','high']);
  assert.throws(()=>call('setDetails',[id,'0','','','none']));
  assert.throws(()=>call('setDetails',[id,'1','','2031-02-29','none']));
  backend.dispose();
  const detail=JSON.parse(call('list','open')[0]);
  assert.deepEqual([detail.notes,detail.due,detail.priority],['附原始附件','2032-02-29','high']);
  const list=crypto.randomUUID();
  call('createList',[list,'工作']);
  call('renameList',[list,'工作','项目']);
  assert.throws(()=>call('renameList',[list,'工作','过期名称']));
  assert.throws(()=>call('renameList',[list,'项目',' ']));
  call('swapLists',['inbox',list]);
  assert.throws(()=>call('swapLists',['inbox',list]));
  backend.dispose();
  assert.deepEqual(call('lists','').map(row=>JSON.parse(row).id),[list,'inbox']);
  call('moveItem',[id,'inbox',list]);
  assert.throws(()=>call('moveItem',[id,'inbox',list]));
  assert.deepEqual(call('listItems',['inbox','open']),[]);
  backend.dispose();
  assert.deepEqual(JSON.parse(call('listItems',[list,'open'])[0]),{...detail,listId:list});
  assert.equal(call('list','open').length,1);
  call('rename',[id,'整理资料','0','归档资料']);
  assert.throws(()=>call('rename',[id,'整理资料','0','过期编辑']));
  assert.throws(()=>call('remove',[id,'整理资料','0']));
  assert.throws(()=>call('remove',[id,'归档资料','1']));
  call('remove',[id,'归档资料','0']);
  backend.dispose();
  assert.deepEqual(call('list','open'),[]);
});

test('upgraded v1 tasks retain title and completion with empty detail fields',async t=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {migrate}=await import('../../plugins/todo/migrate.mjs');
  const backend=await import('../../plugins/todo/backend.mjs');
  const dataDirectory=await mkdtemp(join(tmpdir(),'todo-v1-'));
  t.after(async()=>{backend.dispose();await rm(dataDirectory,{recursive:true,force:true});});
  const db=new DatabaseSync(join(dataDirectory,'todo.sqlite'));
  db.exec("CREATE TABLE items(id TEXT PRIMARY KEY,title TEXT NOT NULL,completed INTEGER NOT NULL);INSERT INTO items VALUES('old','原有事项',1);PRAGMA user_version=1");
  db.close();
  migrate({dataDirectory});
  assert.deepEqual(JSON.parse(backend.call('workbench.todo.items','listItems',['inbox','completed'],{dataDirectory})[0]),{
    listId:'inbox',id:'old',title:'原有事项',notes:'',due:'',priority:'none',detailRevision:0
  });
});

test('today and planned filters use local dates, exclude completed and sort by due date',async t=>{
  const backend=await import('../../plugins/todo/backend.mjs');
  const dataDirectory=await mkdtemp(join(tmpdir(),'todo-filter-'));
  t.after(async()=>{backend.dispose();await rm(dataDirectory,{recursive:true,force:true});});
  const call=(method,input)=>backend.call('workbench.todo.items',method,input,{dataDirectory});
  const today=Temporal.Now.plainDateISO();
  const titles=filter=>call('list',filter).map(row=>JSON.parse(row).title);
  for(const [title,due] of [['明天',today.add({days:1}).toString()],['无日期',''],['今天',today.toString()],['逾期',today.subtract({days:1}).toString()],['完成',today.toString()]]){
    const id=crypto.randomUUID();call('create',[id,title]);call('setDetails',[id,'0','',due,'none']);
    if(title==='完成')call('setCompleted',[id,'0','1']);
  }
  for(const filter of ['today','planned']){
    assert.deepEqual(call('listItems',['inbox',filter]),call('list',filter));
    assert.deepEqual(call('listItems',[crypto.randomUUID(),filter]),[]);
  }
  assert.deepEqual(titles('today'),['今天']);
  assert.deepEqual(titles('planned'),['逾期','今天','明天']);
});


test('removing a list requires the same name and no remaining items',async t=>{
  const backend=await import('../../plugins/todo/backend.mjs');
  const dataDirectory=await mkdtemp(join(tmpdir(),'todo-remove-list-'));
  t.after(async()=>{backend.dispose();await rm(dataDirectory,{recursive:true,force:true});});
  const call=(method,input)=>backend.call('workbench.todo.items',method,input,{dataDirectory});
  const list=crypto.randomUUID(),item=crypto.randomUUID();
  call('createList',[list,'临时']);
  call('createInList',[item,'保留',list]);
  call('setArchived',[list,'1']);
  backend.dispose();
  assert.deepEqual(call('list','open'),[]);
  assert.deepEqual(call('lists','archived').map(row=>JSON.parse(row).id),[list]);
  assert.throws(()=>call('createInList',[crypto.randomUUID(),'不可添加',list]));
  assert.throws(()=>call('setArchived',['inbox','1']));
  call('setArchived',[list,'0']);
  assert.equal(JSON.parse(call('list','open')[0]).id,item);
  assert.throws(()=>call('removeList',[list,'临时']));
  call('moveItem',[item,list,'inbox']);
  assert.throws(()=>call('removeList',[list,'旧名']));
  assert.throws(()=>call('removeList',['inbox','收件箱']));
  call('removeList',[list,'临时']);
  backend.dispose();
  assert.deepEqual(call('lists','').map(row=>JSON.parse(row).id),['inbox']);
  assert.equal(JSON.parse(call('list','open')[0]).title,'保留');
});

test('quick entry creates the reminder and its details in one retryable write',async t=>{
  const backend=await import('../../plugins/todo/backend.mjs');
  const dataDirectory=await mkdtemp(join(tmpdir(),'todo-quick-entry-'));
  t.after(async()=>{backend.dispose();await rm(dataDirectory,{recursive:true,force:true});});
  const call=(method,input)=>backend.call('workbench.todo.items',method,input,{dataDirectory});
  const id=crypto.randomUUID();
  const draft=[id,'提交材料','inbox','核对第二页','2032-02-29','high'];
  assert.throws(()=>call('createWithDetails',[id,'提交材料','inbox','核对第二页','2031-02-29','high']));
  assert.deepEqual(call('list','open'),[]);
  assert.equal(call('createWithDetails',draft),id);
  backend.dispose();
  assert.equal(call('createWithDetails',draft),id);
  assert.throws(()=>call('createWithDetails',[...draft.slice(0,-1),'low']));
  assert.deepEqual(call('list','open').map(JSON.parse),[{
    id,title:'提交材料',listId:'inbox',notes:'核对第二页',due:'2032-02-29',priority:'high',detailRevision:0
  }]);
});
