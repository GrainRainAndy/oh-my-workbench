const {DatabaseSync}=require('node:sqlite');
const {randomUUID}=require('node:crypto');

// Open once in the main process. Callers receive only the scope for their plugin.
function openCredentials(file,encryption){
  const db=new DatabaseSync(file);
  db.exec('CREATE TABLE IF NOT EXISTS credentials (owner TEXT NOT NULL, handle TEXT PRIMARY KEY, ciphertext BLOB NOT NULL)');
  const insert=db.prepare('INSERT INTO credentials VALUES(?,?,?)');
  const lookup=db.prepare('SELECT ciphertext FROM credentials WHERE owner=? AND handle=?');
  const remove=db.prepare('DELETE FROM credentials WHERE owner=? AND handle=?');
  async function encrypted(operation){
    try{
      if(!await encryption.isEncryptionAvailable())throw Error();
      return await operation();
    }catch{throw Error('系统凭据存储不可用');}
  }
  return {close:()=>db.close(),forPlugin(owner){
    if(typeof owner!=='string'||!/^[a-z][a-z0-9.-]*$/.test(owner))throw Error('凭据所有者无效');
    return {
      async store(value){
        if(typeof value!=='string'||!value.length||Buffer.byteLength(value)>65536)throw Error('凭据格式无效');
        const bytes=await encrypted(()=>encryption.encryptString(value));
        const handle=randomUUID();
        insert.run(owner,handle,bytes);
        return handle;
      },
      // Only a trusted host-side adapter supplies the consumer function.
      async use(handle,consume){
        const row=lookup.get(owner,handle);
        if(!row)throw Error('凭据不可用');
        const value=await encrypted(()=>encryption.decryptString(Buffer.from(row.ciphertext)));
        if(!lookup.get(owner,handle))throw Error('凭据不可用');
        try{return await consume(value);}
        catch{throw Error('凭据使用失败');}
      },
      revoke(handle){return remove.run(owner,handle).changes===1;}
    };
  }};
}
module.exports={openCredentials};
