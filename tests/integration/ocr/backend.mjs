import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export async function call(service,method,input,context){
  if(service!=='fixture.ocr'||method!=='recognize'||input!=='png')throw Error('不支持此识别请求');
  const bytes=await context.readSelectedFile();
  const executable=fileURLToPath(new URL('./vision',import.meta.url));
  try{return execFileSync(executable,[],{input:bytes,encoding:'utf8',timeout:20000});}
  catch(error){console.error('Vision test process failed',error.code,error.status,error.signal);throw error;}
}
