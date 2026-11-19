import test from 'node:test';
import assert from 'node:assert/strict';
import preferences from '../../apps/desktop/preferences.cjs';

test('a shortcut conflict preserves the existing binding and tray activation only shows the workspace',()=>{
  const bindings=new Map(),visible=[];
  let calls=0;
  const shortcuts={register(key,fn){if(bindings.has(key))return false;bindings.set(key,fn);return true;},unregister:key=>bindings.delete(key)};
  const api=preferences.openPreferences(':memory:',{shortcuts,show:()=>calls++,setTray:value=>visible.push(value)});
  try{
    assert.deepEqual(api.read(),{tray:true,shortcut:'',registered:false});
    api.setTray(false);assert.deepEqual(visible,[true,false]);
    api.setShortcut('Alt+Command+W');bindings.set('Control+Space',()=>{});
    assert.throws(()=>api.setShortcut('Control+Space'),/不可用/);
    assert.equal(api.read().shortcut,'Alt+Command+W');
    bindings.get('Alt+Command+W')();bindings.get('Alt+Command+W')();assert.equal(calls,2);
    api.setShortcut('');assert.equal(bindings.has('Alt+Command+W'),false);
  }finally{api.close();}
});
