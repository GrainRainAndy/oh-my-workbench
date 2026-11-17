const plugin=await import('./fixture-ui.mjs');
for(const id of ['one','two'])plugin.mount(document.getElementById(id),{instanceId:id,call:async()=>{throw Error('Tauri backend not implemented');}});
await window.__TAURI__.core.invoke('probe_ready',{instances:document.querySelectorAll('section button').length});
