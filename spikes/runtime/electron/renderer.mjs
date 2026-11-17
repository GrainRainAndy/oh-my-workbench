const plugin=await import('/fixture-ui.mjs');
const controllers=['one','two'].map(id=>plugin.mount(document.getElementById(id),{instanceId:id,call:window.fixture.call}));
document.getElementById('stats').onclick=async()=>{
  try {document.getElementById('status').textContent=JSON.stringify(await window.fixture.call('stats',{}));}
  catch(e){document.getElementById('status').textContent=e.message;}
};
window.addEventListener('unload',()=>controllers.forEach(c=>c.dispose()));
