// Shared by the desktop probe, independent of Electron for failure-path testing.
export function waitUntilReady(child,timeoutMs=5000) {
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);child.off('message',onMessage);child.off('exit',onExit);child.off('error',onError);};
    const onMessage=m=>{if(m.type==='ready'){cleanup();resolve();}};
    const onExit=()=>{cleanup();reject(Error('ACTIVATION_EXIT'));};
    const onError=e=>{cleanup();reject(e);};
    const timer=setTimeout(()=>{cleanup();reject(Error('ACTIVATION_TIMEOUT'));},timeoutMs);
    child.on('message',onMessage);child.once('exit',onExit);child.once('error',onError);
  });
}
