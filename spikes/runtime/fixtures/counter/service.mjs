let executions=0,completed=0;
export async function call(method,params) {
  if(method==='stats')return {executions,completed};
  if(method!=='work' || !Number.isInteger(params?.delay) || params.delay<0 || params.delay>30000)throw Error('INVALID_ARGUMENT');
  executions++;
  await new Promise(resolve=>setTimeout(resolve,params.delay));
  completed++;
  return {completed:true,completedAt:Date.now()};
}
