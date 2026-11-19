import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import registry from '../../packages/host-core/src/runtime/plugins.cjs';

test('discovers trusted manifests without loading code and restores only confirmed toggles',()=>{
  const temp=mkdtempSync(join(tmpdir(),'workbench-registry-'));
  const root=join(temp,'plugins'),dir=join(root,'example');
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'manifest.json'),JSON.stringify({id:'test.example',name:'Example',views:[{type:'card',title:'Card'}]}));
  writeFileSync(join(dir,'view.jsx'),'throw Error("discovery executed view")');
  const file=join(temp,'preferences.sqlite');
  let db=registry.openPlugins(root,file);
  try{
    assert.equal(db.list()[0].enabled,true);
    assert.throws(()=>db.setEnabled({id:'test.example',enabled:'false'}));
    assert.throws(()=>db.setEnabled({id:'missing',enabled:false}));
    db.setEnabled({id:'test.example',enabled:false});
    db.close();db=registry.openPlugins(root,file);
    assert.equal(db.list()[0].enabled,false);
  }finally{db.close();rmSync(temp,{recursive:true});}
});

test('one damaged manifest and conflicting identities leave healthy plugins available',()=>{
  const root=mkdtempSync(join(tmpdir(),'workbench-manifests-'));
  try{
    for(const [folder,id] of [['a','duplicate'],['b','duplicate'],['c','okay'],['d',null]]){
      mkdirSync(join(root,folder));
      writeFileSync(join(root,folder,'manifest.json'),id?JSON.stringify({id,name:folder,views:[]}):'{broken');
    }
    const plugins=registry.openPlugins(root,':memory:');
    try{
      assert.deepEqual(plugins.list().map(p=>p.id),['okay']);
      assert.deepEqual(plugins.issues().map(p=>p.folder).sort(),['a','b','d']);
      assert.throws(()=>plugins.setEnabled({id:'duplicate',enabled:true}));
    }finally{plugins.close();}
  }finally{rmSync(root,{recursive:true});}
});

test('required dependencies propagate unavailability while optional and self services remain usable',t=>{
  const root=mkdtempSync(join(tmpdir(),'workbench-service-graph-'));
  t.after(()=>rmSync(root,{recursive:true}));
  for(const [id,dependency,optional] of [['a','b'],['b','a'],['c','a'],['d','missing',true],['e','e'],['f','e']]){
    const dir=join(root,id);
    mkdirSync(dir);
    writeFileSync(join(dir,'backend.mjs'),'throw Error("unexpected activation")');
    writeFileSync(join(dir,'manifest.json'),JSON.stringify({id,name:id,views:[],
      services:[{id,version:'1',methods:{}}],usesServices:[{id:dependency,version:'1',optional}]}));
  }
  const plugins=registry.openPlugins(root,':memory:');
  t.after(()=>plugins.close());
  const state=id=>plugins.list().find(p=>p.id===id);
  for(const id of ['a','b','c'])assert.match(state(id).dependencyIssue,/循环/);
  for(const id of ['d','e','f'])assert.equal(state(id).available,true);
  plugins.setEnabled({id:'e',enabled:false});
  assert.equal(state('f').enabled,true);
  assert.equal(state('f').available,false);
  assert.match(state('f').dependencyIssue,/e/);
  plugins.setEnabled({id:'e',enabled:true});
  assert.equal(state('f').available,true);
});

test('a required provider binding resolves ambiguity and never falls back silently',t=>{
  const root=mkdtempSync(join(tmpdir(),'workbench-binding-'));
  t.after(()=>rmSync(root,{recursive:true}));
  const service={id:'shared',version:'1'};
  for(const [id,extensions] of [['a',{services:[service]}],['b',{services:[service]}],
    ['bound',{usesServices:[{...service,provider:'a'}]}],['ambiguous',{usesServices:[service]}]]){
    const dir=join(root,id);
    mkdirSync(dir);
    writeFileSync(join(dir,'manifest.json'),JSON.stringify({id,name:id,views:[],...extensions}));
    writeFileSync(join(dir,'backend.mjs'),'');
  }
  const plugins=registry.openPlugins(root,':memory:');
  t.after(()=>plugins.close());
  const state=id=>plugins.list().find(p=>p.id===id);
  assert.equal(state('bound').available,true);
  assert.match(state('ambiguous').dependencyIssue,/多个提供者/);
  plugins.setEnabled({id:'a',enabled:false});
  assert.equal(state('bound').available,false);
  assert.equal(state('ambiguous').available,true);
});

test('discovers a versioned migration only for a declared private database and a local entry',async t=>{
  const {symlinkSync,realpathSync}=await import('node:fs');
  const root=mkdtempSync(join(tmpdir(),'workbench-migration-manifests-'));
  t.after(()=>rmSync(root,{recursive:true}));
  const outside=join(root,'outside.mjs');
  writeFileSync(outside,'throw Error("discovery executed migration")');
  for(const [id,version,file] of [['valid',1,'data.sqlite'],['outside',1,'data.sqlite'],['missing',1,'data.sqlite'],['unbounded',2147483648,'data.sqlite'],['invalid',1,'../data.sqlite']]){
    const dir=join(root,id);
    mkdirSync(dir);
    writeFileSync(join(dir,'manifest.json'),JSON.stringify({id,name:id,views:[],databaseVersion:version,backupDatabase:file}));
    if(id==='outside')symlinkSync(outside,join(dir,'migrate.mjs'));
    else if(id!=='missing')writeFileSync(join(dir,'migrate.mjs'),'throw Error("unexpected migration execution")');
  }
  const registryState=registry.openPlugins(root,':memory:');
  t.after(()=>registryState.close());
  assert.deepEqual(registryState.list().map(plugin=>plugin.id),['valid']);
  assert.equal(registryState.migration('valid'),realpathSync(join(root,'valid','migrate.mjs')));
  assert.equal(registryState.issues().length,4);
});
