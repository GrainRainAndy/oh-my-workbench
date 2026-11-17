// Independent ESM fixture, not a production SDK or business plugin.
export function mount(container,context) {
  const label=document.createElement('p');
  const button=document.createElement('button');
  const status=document.createElement('output');
  label.textContent=`Instance ${context.instanceId}`;
  button.textContent='Run 3-second background job';
  let alive=true;
  button.onclick=async()=>{
    button.disabled=true;status.textContent='Running';
    try {await context.call('work',{delay:3000});if(alive)status.textContent='Completed';}
    catch(e){if(alive)status.textContent=e.message;}
    finally{if(alive)button.disabled=false;}
  };
  container.append(label,button,status);
  return {dispose(){alive=false;button.onclick=null;container.replaceChildren();}};
}
