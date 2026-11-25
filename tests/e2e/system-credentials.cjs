const assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto');
const {mkdtempSync,rmSync,readFileSync,readdirSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {app}=require('electron');
const {DatabaseSync}=require('node:sqlite');
const {createSnapshot,prepareRestore,activeDirectory}=require('../../packages/host-core/src/persistence/backup.cjs');
const {openDesktopCredentials}=require('../../apps/desktop/credentials.cjs');

const profile=mkdtempSync(join(tmpdir(),'workbench-system-credentials-'));
app.setPath('userData',profile);
async function verify(){
  let database=openDesktopCredentials();
  const sample=randomBytes(32).toString('hex');
  const digest=value=>createHash('sha256').update(value).digest('hex');
  try{
    const handle=await database.forPlugin('fixture.owner').store(sample);
    database.close();
    database=openDesktopCredentials();
    assert.equal(readFileSync(join(profile,'credentials.sqlite')).includes(Buffer.from(sample)),false);
    await assert.rejects(()=>database.forPlugin('fixture.other').use(handle,digest),/凭据不可用/);
    const owner=database.forPlugin('fixture.owner');
    assert.equal(await owner.use(handle,digest),digest(sample));
    await assert.rejects(owner.use(handle,async value=>{throw Error('adapter failed: '+value);}),
      error=>error.message==='凭据使用失败' && !String(error.stack).includes(sample));
    const databases=['workspaces.sqlite','plugins.sqlite','jobs.sqlite'];
    for(const name of databases){
      const db=new DatabaseSync(join(profile,name));
      try{db.exec('CREATE TABLE marker(value INTEGER)');}finally{db.close();}
    }
    const backup=createSnapshot(profile);
    const folder=join(profile,'backups',backup.id);
    assert.deepEqual(readdirSync(folder).sort(),[...databases,'manifest.json','.preparing'].sort());
    for(const name of readdirSync(folder)){
      const bytes=readFileSync(join(folder,name));
      assert.equal(bytes.includes(Buffer.from(sample)),false);
      assert.equal(bytes.includes(Buffer.from(handle)),false);
    }
    // The owner can revoke while the asynchronous system decryption is pending.
    let deliveries=0;
    const pending=owner.use(handle,()=>{deliveries++;});
    assert.ok(owner.revoke(handle));
    await assert.rejects(pending,/凭据不可用/);
    assert.equal(deliveries,0);
    const replacement=await owner.store(randomBytes(32).toString('hex'));
    const beforeRestore=await owner.use(replacement,digest);
    const candidate=prepareRestore(profile,backup.id);
    try{candidate.commit();}finally{candidate.discard();}
    assert.equal(activeDirectory(profile),candidate.directory);
    database.close();
    database=openDesktopCredentials();
    const restoredOwner=database.forPlugin('fixture.owner');
    assert.equal(await restoredOwner.use(replacement,digest),beforeRestore);
    await assert.rejects(()=>restoredOwner.use(handle,digest),/凭据不可用/);
  }finally{database.close();}
}
app.whenReady().then(verify).then(()=>app.exit(0),error=>{console.error(error.message);app.exit(1);});
app.on('will-quit',()=>rmSync(profile,{recursive:true,force:true}));
