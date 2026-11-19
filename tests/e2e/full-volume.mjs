import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {closeSync,mkdirSync,mkdtempSync,openSync,readFileSync,readdirSync,rmSync,statfsSync,statSync,truncateSync,writeSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import snapshots from '../../packages/host-core/src/persistence/backup.cjs';
import {migrate} from '../../plugins/fixture-tally/migrate.mjs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateWorkspace} from '../../packages/contracts/src/workspace.ts';
import {newWorkspace} from '../../packages/host-core/src/workspace/create.mjs';
import repository from '../../packages/host-core/src/workspace/repository.cjs';

const dir=mkdtempSync(join(tmpdir(),'workbench-volume-'));
const image=join(dir,'bounded.dmg'),volume=join(dir,'mount');
let mounted=false,store;
try{
  mkdirSync(volume);
  execFileSync('hdiutil',['create','-size','32m','-fs','HFS+','-volname','Workbench QA',image]);
  execFileSync('hdiutil',['attach','-nobrowse','-mountpoint',volume,image]);
  mounted=true;
  const fs=statfsSync(volume);
  assert.ok(fs.blocks*fs.bsize<=32*1024*1024,'Expected a bounded test volume');
  const file=join(volume,'workspaces.sqlite');
  store=repository.openRepository(file,validateWorkspace);
  const saved=store.save(newWorkspace('已确认'));
  for(const name of ['plugins.sqlite','jobs.sqlite']){
    const db=new DatabaseSync(join(volume,name));
    try{
      db.exec('CREATE TABLE marker(value INTEGER)');
      if(name==='jobs.sqlite')db.exec('INSERT INTO marker VALUES(zeroblob(1048576))');
    }finally{db.close();}
  }
  const owner='fixture.tally',name='counter.sqlite';
  const dataDirectory=snapshots.pluginDirectory(volume,owner);
  mkdirSync(dataDirectory,{recursive:true});
  const original=join(dataDirectory,name);
  const legacy=new DatabaseSync(original);
  try{legacy.exec('CREATE TABLE tally(value INTEGER); INSERT INTO tally VALUES(17)');}finally{legacy.close();}
  const before=readFileSync(original);
  const backup=snapshots.createSnapshot(volume,volume,[{owner,name}]);
  const prepare=()=>snapshots.prepareRestore(volume,backup.id,{owner,name,version:1});
  const candidate=prepare();
  const filler=join(volume,'filler');
  const fd=openSync(filler,'wx');
  try{
    const block=Buffer.alloc(fs.bsize,1);
    assert.throws(()=>{
      for(let written=0;written<32*1024*1024;){
        written+=writeSync(fd,block);
      }
    },{code:'ENOSPC'});
  }finally{closeSync(fd);}
  const makeBackup=()=>snapshots.createSnapshot(volume,volume,[{owner,name}]);
  const backupRoot=join(volume,'backups');
  assert.throws(makeBackup,error=>statfsSync(volume).bavail===0&&
    (error.code==='ENOSPC'||[13,14].includes(error.errcode)));
  assert.deepEqual(readdirSync(backupRoot),[backup.id]);
  assert.equal(snapshots.verifySnapshot(join(backupRoot,backup.id)).id,backup.id);
  const edit={...saved,name:'新'.repeat(24000)};
  assert.throws(()=>store.save(edit),/存储空间不足/);
  assert.deepEqual(store.list(),[saved]);
  store.close();
  store=repository.openRepository(file,validateWorkspace);
  assert.deepEqual(store.list(),[saved]);
  try{
    assert.throws(()=>migrate({dataDirectory:join(candidate.directory,'plugin-data',owner)}),error=>[13,14].includes(error.errcode)&&statfsSync(volume).bavail===0);
  }finally{candidate.discard();}
  assert.equal(snapshots.activeDirectory(volume),volume);
  assert.deepEqual(readFileSync(original),before);
  assert.equal(snapshots.verifySnapshot(join(volume,'backups',backup.id)).id,backup.id);
  // Leave room for staging and the small host databases, but not the jobs database.
  truncateSync(filler,statSync(filler).size-256*1024);
  const refill=openSync(filler,'a');
  try{
    const block=Buffer.alloc(fs.bsize,1);
    while(statfsSync(volume).bavail*fs.bsize>256*1024)writeSync(refill,block);
  }finally{closeSync(refill);}
  assert.ok(statfsSync(volume).bavail>0);
  assert.throws(makeBackup,error=>error.errcode===13);
  assert.deepEqual(readdirSync(backupRoot),[backup.id]);
  assert.equal(snapshots.verifySnapshot(join(backupRoot,backup.id)).id,backup.id);
  rmSync(filler);
  const retriedBackup=makeBackup();
  assert.notEqual(retriedBackup.id,backup.id);
  assert.equal(snapshots.verifySnapshot(join(backupRoot,retriedBackup.id)).id,retriedBackup.id);
  console.log('Backup on full volume failed without publishing a partial copy; previous and retried snapshots verified.');
  const retried=store.save(edit);
  assert.equal(retried.revision,saved.revision+1);
  assert.deepEqual(store.list(),[retried]);
  const retry=prepare();
  try{
    migrate({dataDirectory:join(retry.directory,'plugin-data',owner)});
    retry.commit();
  }finally{retry.discard();}
  const upgraded=new DatabaseSync(join(snapshots.pluginDirectory(volume,owner),name),{readOnly:true});
  try{
    assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version,1);
    assert.equal(upgraded.prepare('SELECT count FROM tally WHERE id=1').get().count,17);
  }finally{upgraded.close();}
  assert.deepEqual(readFileSync(original),before);
  console.log('Plugin migration failed on the exhausted volume; original and snapshot survived, retry restored count 17.');
  console.log('Bounded HFS+ volume reached ENOSPC; confirmed workspace survived reopen and retry advanced one revision.');
}finally{
  store?.close();
  if(mounted)execFileSync('hdiutil',['detach',volume]);
  rmSync(dir,{recursive:true,force:true});
}
