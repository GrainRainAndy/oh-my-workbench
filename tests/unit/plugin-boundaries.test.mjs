import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
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
