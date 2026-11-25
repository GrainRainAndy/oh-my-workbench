import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,realpath,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {build} from 'vite';
import {inspectPlugins} from '../../scripts/check-plugin-boundaries.mjs';
import {openPlugins} from '../../packages/host-core/src/runtime/plugins.cjs';

test('a new bundled plugin is registered and built without editing the host',async t=>{
  const project=await realpath(await mkdtemp(join(tmpdir(),'workbench-extension-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  for(const path of ['apps/desktop/src','apps/desktop/public','apps/desktop/index.html','packages','package.json']){
    await cp(resolve(path),join(project,path),{recursive:true});
  }
  await symlink(resolve('node_modules'),join(project,'node_modules'),'dir');
  const folder=join(project,'plugins','sample-inbox');
  await mkdir(folder,{recursive:true});
  const id='example.inbox';
  await writeFile(join(folder,'manifest.json'),JSON.stringify({
    id,name:'收件箱验证',views:[{type:'inbox',title:'收件箱验证',configVersion:1,stateVersion:1}]
  }));
  await writeFile(join(folder,'view.jsx'),"import React from 'react'; export default function Inbox(){return <p>extension-render-check</p>;}");
  assert.deepEqual(inspectPlugins(project),[]);
  const registry=openPlugins(join(project,'plugins'),':memory:');
  t.after(()=>registry.close());
  const [plugin]=registry.list();
  assert.equal(plugin.id,id);
  assert.equal(plugin.available,true);
  await build({root:join(project,'apps/desktop'),configFile:false,logLevel:'error',base:'./',build:{manifest:true}});
  const dist=join(project,'apps/desktop/dist');
  const manifest=JSON.parse(await readFile(join(dist,'.vite/manifest.json'),'utf8'));
  const entry=Object.values(manifest).find(chunk=>chunk.isEntry);
  const key=entry.dynamicImports.find(source=>source.endsWith('/'+plugin.folder+'/view.jsx'));
  assert.ok(key,'Host entry must include the discovered view as a lazy import');
  assert.match(await readFile(join(dist,manifest[key].file),'utf8'),/extension-render-check/);
});
