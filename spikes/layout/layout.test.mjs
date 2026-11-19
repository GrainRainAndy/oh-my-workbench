import test from 'node:test';
import assert from 'node:assert/strict';
import { edit } from './operations.ts';
import { validateLayout } from '../../packages/contracts/src/layout.ts';

const leaf = i => ({type:'leaf', paneId:'p'+i, viewInstanceId:'v'+i});
test('12 panes round-trip and 1000 reversible edits preserve ownership', () => {
  let root = leaf(0);
  for (let i=1; i<12; i++) root = edit(root,'p'+(i-1),{kind:'split',axis:i%2?'horizontal':'vertical',leaf:leaf(i)});
  const original = JSON.stringify(root);
  for (let i=0; i<500; i++) {
    root = edit(root,'p0',{kind:'swap',other:'p11'});
    root = edit(root,'p11',{kind:'swap',other:'p0'});
  }
  assert.equal(JSON.stringify(root),original);
  assert.equal(validateLayout(JSON.parse(original)).viewIds.size,12);
  const resized = edit(root,'p0',{kind:'resize',ratio:0.3});
  assert.equal(resized.ratio,0.3);
  assert.equal(root.ratio,0.5);
  assert.equal(validateLayout(edit(root,'p0',{kind:'close'})).paneIds.size,11);
});
test('reject invalid commands and preserve last empty pane', () => {
  const root=leaf(0);
  assert.throws(()=>edit(root,'missing',{kind:'close'}));
  assert.throws(()=>edit(root,'p0',{kind:'split',axis:'vertical',leaf:leaf(0)}));
  assert.throws(()=>edit(root,'p0',{kind:'swap',other:'absent'}));
  assert.deepEqual(edit(root,'p0',{kind:'close'}),{type:'leaf',paneId:'p0'});
});
