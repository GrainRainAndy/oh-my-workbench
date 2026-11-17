const plugin=await import('./fixture-ui.mjs');
const call=(method,params)=>window.__TAURI__.core.invoke('fixture_call',{method,params});
for(const id of ['one','two'])plugin.mount(document.getElementById(id),{instanceId:id,call});
const stats=await call('stats',{});
await window.__TAURI__.core.invoke('probe_ready',{instances:document.querySelectorAll('section button').length,stats,nodeAbsent:typeof process==='undefined'});
