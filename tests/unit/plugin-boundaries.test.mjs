import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectPlugins} from '../../scripts/check-plugin-boundaries.mjs';

test('plugin imports may use own files, dependencies and SDK, but not host or sibling modules',()=>{
  const root=mkdtempSync(join(tmpdir(),'plugin-boundaries-'));
  try{
    mkdirSync(join(root,'plugins/a'),{recursive:true});
    writeFileSync(join(root,'package.json'),JSON.stringify({dependencies:{react:'19'}}));
    const path=join(root,'plugins/a/view.ts');
    writeFileSync(path,`import type {ViewProps} from '../../packages/sdk/src/index.ts';
      import './view.css'; import React from 'react';`);
    assert.deepEqual(inspectPlugins(root),[]);
    writeFileSync(path,`export {store} from '../b/private.ts';
      import('../../apps/desktop/main.cjs');
      require('../../packages/host-core/private');
      import('node:fs');
      import(variable);
      type Private=import('../b/store').Private;`);
    assert.equal(inspectPlugins(root).length,5);
  }finally{rmSync(root,{recursive:true});}
});

test('a plugin entry and an imported directory must resolve inside its own plugin',()=>{
  const root=mkdtempSync(join(tmpdir(),'plugin-linked-source-'));
  try{
    const plugin=join(root,'plugins/a');
    const sibling=join(root,'plugins/b');
    mkdirSync(plugin,{recursive:true});
    mkdirSync(sibling);
    writeFileSync(join(root,'package.json'),'{}');
    writeFileSync(join(sibling,'private.jsx'),'export default 1;');
    symlinkSync(join(sibling,'private.jsx'),join(plugin,'view.jsx'));
    symlinkSync(sibling,join(plugin,'shared'));
    const issues=inspectPlugins(root);
    assert.ok(issues.some(issue=>issue.includes('plugins/a/view.jsx')));
    assert.ok(issues.some(issue=>issue.includes('plugins/a/shared')));
  }finally{rmSync(root,{recursive:true});}
});
