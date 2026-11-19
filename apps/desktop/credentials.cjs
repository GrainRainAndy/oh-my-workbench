const {app,safeStorage}=require('electron');
const {join}=require('node:path');
const {openCredentials}=require('../../packages/host-core/src/platform/credentials.cjs');

function openDesktopCredentials(){
  if(process.platform!=='darwin'||!app.isReady())throw Error('系统凭据存储不可用');
  return openCredentials(join(app.getPath('userData'),'credentials.sqlite'),{
    isEncryptionAvailable:()=>safeStorage.isAsyncEncryptionAvailable(),
    encryptString:value=>safeStorage.encryptStringAsync(value),
    decryptString:async bytes=>(await safeStorage.decryptStringAsync(bytes)).result
  });
}
module.exports={openDesktopCredentials};
