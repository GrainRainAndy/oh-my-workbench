const {constants}=require('node:fs');
const {randomUUID}=require('node:crypto');
const {open,stat}=require('node:fs/promises');

function validateSelection(file,limit){
  if(!file.isFile())throw Error('请选择普通文件');
  if(file.size>BigInt(limit))throw Object.assign(Error('所选文件超过大小限制'),{code:'EFBIG'});
}

// Only the main process supplies paths selected in its native open dialog.
async function readSelectedFile(path,limit,expected=undefined){
  expected??=await stat(path,{bigint:true});
  validateSelection(expected,limit);
  const file=await open(path,constants.O_RDONLY|constants.O_NONBLOCK);
  function unchanged(actual){
    return actual.dev===expected.dev&&actual.ino===expected.ino&&actual.size===expected.size&&
      actual.mtimeNs===expected.mtimeNs&&actual.ctimeNs===expected.ctimeNs;
  }
  try{
    if(!unchanged(await file.stat({bigint:true})))throw Error('文件已变化，请重新选择');
    const size=Number(expected.size);
    const buffer=Buffer.alloc(size+1);
    let offset=0;
    while(offset<buffer.length){
      const {bytesRead}=await file.read(buffer,offset,buffer.length-offset,null);
      if(!bytesRead)break;
      offset+=bytesRead;
    }
    if(offset!==size||!unchanged(await file.stat({bigint:true}))||!unchanged(await stat(path,{bigint:true})))
      throw Error('文件已变化，请重新选择');
    return buffer.subarray(0,size);
  }finally{await file.close();}
}
// Each scope belongs to one trusted host-side caller, never to a renderer-supplied ID.
function createReadScope(limit){
  if(!Number.isSafeInteger(limit)||limit<0)throw Error('文件大小限制无效');
  const grants=new Map();
  let closed=false;
  async function read(token){
    const entry=grants.get(token);
    if(!entry)throw Error('文件授权已失效');
    const bytes=await readSelectedFile(entry.path,limit,entry.expected);
    if(!grants.has(token))throw Error('文件授权已失效');
    return bytes;
  }
  return {
    async grant(path){
      const expected=await stat(path,{bigint:true});
      if(closed)throw Error('文件授权已失效');
      validateSelection(expected,limit);
      const token=randomUUID();
      grants.set(token,{path,expected});
      return token;
    },
    read,
    delegate(token){
      if(!grants.has(token))throw Error('文件授权已失效');
      let active=true;
      // Host retains this lease for a single service invocation.
      return {
        async read(){
          if(!active)throw Error('文件委托已结束');
          const bytes=await read(token);
          if(!active)throw Error('文件委托已结束');
          return bytes;
        },
        close(){active=false;}
      };
    },
    revoke(token){grants.delete(token);},
    close(){closed=true;grants.clear();}
  };
}
module.exports={readSelectedFile,createReadScope};
