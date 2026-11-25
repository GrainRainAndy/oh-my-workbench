import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openPreferences} from '../../apps/desktop/preferences.cjs';

test('desktop targets persist across restarts and are scoped to the selecting plugin',t=>{
  const dir=mkdtempSync(join(tmpdir(),'launcher-test-'));
  const open=()=>openPreferences(join(dir,'desktop.sqlite'),{setTray(){},shortcuts:{}});
  let prefs=open();
  t.after(()=>{prefs.close();rmSync(dir,{recursive:true,force:true});});
  const owner='workbench.launcher',path='/example/Folder',stat={dev:1n,ino:22n};
  const id=prefs.rememberTarget(owner,path,'folder',stat);
  assert.equal(prefs.rememberTarget(owner,path,'folder',stat),id);
  prefs.close();prefs=open();
  assert.equal(prefs.target(owner,id).path,path);
  assert.equal(prefs.target(owner,id).inode,'22');
  assert.equal(prefs.target('another.plugin',id),undefined);
  assert.equal(prefs.target(owner,path),undefined);
});

test('launcher only resolves views the user has pinned',async()=>{
  const {pinnedViews}=await import('../../plugins/launcher/pins.mjs');
  const catalog=[{pluginId:'notes',type:'list',title:'笔记'},{pluginId:'notes',type:'board',title:'笔记'}];
  assert.deepEqual(pinnedViews({},catalog),[]);
  assert.deepEqual(pinnedViews({pinnedViews:[]},catalog),[]);
  const config={pinnedViews:[{pluginId:'paused',type:'main'},{pluginId:'notes',type:'board'}]};
  assert.deepEqual(pinnedViews(config,catalog),[catalog[1]]);
  const restored={pluginId:'paused',type:'main',title:'暂停的视图'};
  assert.deepEqual(pinnedViews(config,[restored,...catalog]),[restored,catalog[1]]);
});

test('the local library survives reopening and removed entries stay removed after old layouts are opened',async t=>{
  const {call,dispose}=await import('../../plugins/launcher/backend.mjs');
  const dataDirectory=mkdtempSync(join(tmpdir(),'launcher-library-'));
  t.after(()=>{dispose();rmSync(dataDirectory,{recursive:true,force:true});});
  const service='workbench.launcher.library';
  const request=(method,input='')=>call(service,method,input,{dataDirectory});
  const read=()=>JSON.parse(request('read'));
  const target={id:'folder-1',kind:'folder',label:'资料'};
  const view={pluginId:'workbench.calendar',type:'agenda'};
  const stored={targets:[target],pinnedViews:[view]};
  assert.deepEqual(read(),{targets:[],pinnedViews:[]});
  request('importLegacy',JSON.stringify(stored));
  dispose();
  assert.deepEqual(read(),stored);
  request('change',JSON.stringify({remove:stored}));
  request('importLegacy',JSON.stringify(stored));
  assert.deepEqual(read(),{targets:[],pinnedViews:[]});
  request('change',JSON.stringify({add:stored}));
  assert.deepEqual(read(),stored);
  assert.throws(()=>request('change',JSON.stringify({add:{targets:[{...target,path:'/private'}]}})));
  assert.deepEqual(read(),stored);
});
