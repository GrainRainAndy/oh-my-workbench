import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateWorkspace} from '../../packages/contracts/src/workspace.ts';
import repository from '../../packages/host-core/src/workspace/repository.cjs';
test('SQLite restores missing-plugin configuration and rejects stale snapshots',()=>{
  const dir=mkdtempSync(join(tmpdir(),'workbench-test-'));
  const path=join(dir,'workspace.sqlite');
  const w={id:'w',name:'one',revision:0,schemaVersion:1,layout:{type:'leaf',paneId:'p',viewInstanceId:'v'},activePaneId:'p',views:{v:{id:'v',pluginId:'missing',viewType:'first',configVersion:1,stateVersion:1,config:{filter:'later'},state:{page:2}}}};
  let db=repository.openRepository(path,validateWorkspace);
  try{
    const saved=db.save(w);
    assert.throws(()=>db.save(w));
    assert.throws(()=>db.save({...saved,views:{}}));
    db.close();
    db=repository.openRepository(path,validateWorkspace);
    assert.deepEqual(db.list(),[saved]);
    assert.equal(db.save({...saved,name:'renamed'}).revision,2);
    assert.throws(()=>db.save(saved));
  } finally {db.close();rmSync(dir,{recursive:true});}
});
test('copies presentation and resource references with fresh IDs and leaves source intact on delete',async()=>{
  const {duplicateWorkspace}=await import('../../packages/host-core/src/workspace/duplicate.ts');
  const source={id:'w',name:'source',revision:0,schemaVersion:1,layout:{type:'leaf',paneId:'p',viewInstanceId:'v'},activePaneId:'p',views:{v:{id:'v',pluginId:'missing',viewType:'editor',configVersion:1,stateVersion:1,config:{zoom:2},state:{draft:'private'},resource:{id:'r'}}}};
  const dir=mkdtempSync(join(tmpdir(),'workbench-copy-'));
  const path=join(dir,'test.sqlite');
  let db=repository.openRepository(path,validateWorkspace);
  try{
    const original=db.save(source);
    const copy=db.save(duplicateWorkspace(original,'copy'));
    const v=copy.views[copy.layout.viewInstanceId];
    assert.notEqual(copy.id,original.id);
    assert.notEqual(copy.activePaneId,original.activePaneId);
    assert.notEqual(v.id,'v');
    assert.deepEqual(v.resource,{id:'r'});
    assert.deepEqual(v.config,{zoom:2});
    assert.deepEqual(v.state,{});
    assert.throws(()=>db.remove({id:copy.id,revision:2}));
    db.remove(copy);
    db.close();db=repository.openRepository(path,validateWorkspace);
    assert.deepEqual(db.list(),[original]);
  }finally{db.close();rmSync(dir,{recursive:true});}
});

test('workspace validation rejects lossy plugin payloads before persistence',()=>{
  const view={id:'v',pluginId:'fixture',viewType:'test',configVersion:1,stateVersion:1,config:{},state:{}};
  const snapshot={id:'w',name:'w',revision:0,schemaVersion:1,layout:{type:'leaf',paneId:'p',viewInstanceId:'v'},activePaneId:'p',views:{v:view}};
  const cyclic={};cyclic.self=cyclic;
  for(const value of [NaN,Infinity,undefined,1n,new Date(),new Map(),[,,1],cyclic]){
    assert.throws(()=>validateWorkspace({...snapshot,views:{v:{...view,config:{value}}}}));
  }
  const valid={...snapshot,views:{v:{...view,config:{values:[null,false,0,'中文']}}}};
  assert.deepEqual(validateWorkspace(valid),JSON.parse(JSON.stringify(valid)));
});

test('removing the final workspace atomically creates a fresh empty default',async()=>{
  const {newWorkspace}=await import('../../packages/host-core/src/workspace/create.mjs');
  const store=repository.openRepository(':memory:',validateWorkspace);
  try{
    const original=store.save(newWorkspace('原工作区'));
    assert.throws(()=>store.remove({...original,revision:99}));
    assert.deepEqual(store.list(),[original]);
    const [remaining]=store.remove(original);
    assert.equal(remaining.name,'我的工作台');
    assert.equal(remaining.revision,1);
    assert.notEqual(remaining.id,original.id);
    assert.deepEqual(remaining.views,{});
    assert.deepEqual(store.list(),[remaining]);
  }finally{store.close();}
});

test('a full SQLite database preserves the confirmed revision and permits retry',async()=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {newWorkspace}=await import('../../packages/host-core/src/workspace/create.mjs');
  const dir=mkdtempSync(join(tmpdir(),'workbench-full-'));
  const path=join(dir,'workspace.sqlite');
  const connection=new DatabaseSync(path);
  let store;
  try{
    store=repository.openRepository(connection,validateWorkspace);
    const confirmed=store.save(newWorkspace('原工作区'));
    const {page_count:pages}=connection.prepare('PRAGMA page_count').get();
    connection.exec('PRAGMA max_page_count='+pages);
    const edit={...confirmed,name:'大'.repeat(24000)};
    assert.throws(()=>store.save(edit),/存储空间不足/);
    assert.deepEqual(store.list(),[confirmed]);
    store.close();store=repository.openRepository(path,validateWorkspace);
    assert.deepEqual(store.list(),[confirmed]);
    assert.equal(store.save(edit).revision,confirmed.revision+1);
  }finally{if(store)store.close();else connection.close();rmSync(dir,{recursive:true});}
});
