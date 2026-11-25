import {createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import snapshots from '../../packages/host-core/src/persistence/backup.cjs';

test('snapshot includes WAL commits, verifies all databases and preserves originals on failure',()=>{
  const dir=mkdtempSync(join(tmpdir(),'workbench-snapshot-'));
  const names=['workspaces.sqlite','plugins.sqlite','jobs.sqlite'];
  const sources=[];
  try{
    for(const [index,name] of names.entries()){
      const db=new DatabaseSync(join(dir,name));sources.push(db);
      db.exec('PRAGMA journal_mode=WAL; CREATE TABLE sample (value INTEGER)');
      db.prepare('INSERT INTO sample VALUES (?)').run(index+1);
    }
    sources[0].exec('CREATE TABLE payload(data BLOB);INSERT INTO payload VALUES(randomblob(1048593))');
    const {id}=snapshots.createSnapshot(dir);
    const folder=join(dir,'backups',id);
    const verified=snapshots.verifySnapshot(folder);
    assert.equal(verified.files.length,3);
    const payload=readFileSync(join(folder,names[0]));
    assert.ok(payload.length>1024*1024);
    assert.equal(verified.files[0].sha256,createHash('sha256').update(payload).digest('hex'));
    for(const [index,name] of names.entries()){
      sources[index].exec('UPDATE sample SET value=99');
      const restored=join(dir,'restored-'+name);
      copyFileSync(join(folder,name),restored);
      const db=new DatabaseSync(restored);
      assert.equal(db.prepare('SELECT value FROM sample').get().value,index+1);
      db.close();
    }
    writeFileSync(join(folder,'jobs.sqlite'),'damaged test copy');
    assert.throws(()=>snapshots.verifySnapshot(folder),/校验失败/);
    sources.pop().close();
    writeFileSync(join(dir,'jobs.sqlite'),'damaged source');
    assert.throws(()=>snapshots.createSnapshot(dir));
    assert.equal(readFileSync(join(dir,'jobs.sqlite'),'utf8'),'damaged source');
    assert.deepEqual(readdirSync(join(dir,'backups')),[id]);
  }finally{for(const db of sources)db.close();rmSync(dir,{recursive:true});}
});

test('verified restore activates all databases together and preserves the old generation',()=>{
  const profile=mkdtempSync(join(tmpdir(),'workbench-restore-'));
  try{
    const names=['workspaces.sqlite','plugins.sqlite','jobs.sqlite'];
    for(const name of names){
      const db=new DatabaseSync(join(profile,name));
      db.exec('CREATE TABLE example(n);INSERT INTO example VALUES(1)');db.close();
    }
    const backup=snapshots.createSnapshot(profile);
    for(const name of names){
      const db=new DatabaseSync(join(profile,name));db.exec('UPDATE example SET n=2');db.close();
    }
    const abandoned=snapshots.prepareRestore(profile,backup.id);
    abandoned.discard();
    assert.deepEqual(readdirSync(join(profile,'stores')),[]);
    assert.throws(()=>abandoned.commit(),/副本已释放/);
    const next=snapshots.prepareRestore(profile,backup.id);
    assert.equal(snapshots.activeDirectory(profile),profile);
    // A directory occupying the pointer path makes the final atomic rename fail.
    const pointer=join(profile,'active-store.json');
    mkdirSync(pointer);
    assert.throws(()=>next.commit());
    rmSync(pointer,{recursive:true});
    assert.equal(snapshots.activeDirectory(profile),profile);
    next.commit();
    next.commit();
    next.discard();
    snapshots.discardInterruptedCopies(profile);
    assert.equal(snapshots.activeDirectory(profile),next.directory);
    for(const name of names){
      for(const [directory,n] of [[profile,2],[next.directory,1]]){
        const db=new DatabaseSync(join(directory,name),{readOnly:true});
        assert.equal(db.prepare('SELECT n FROM example').get().n,n);db.close();
      }
    }
    writeFileSync(join(profile,'backups',backup.id,'jobs.sqlite'),'damaged');
    assert.throws(()=>snapshots.prepareRestore(profile,backup.id));
    assert.equal(snapshots.activeDirectory(profile),next.directory);
  }finally{rmSync(profile,{recursive:true});}
});

test('restoring host-only backups preserves the active plugin data generation',()=>{
  const profile=mkdtempSync(join(tmpdir(),'workbench-plugin-snapshot-'));
  try{
    for(const name of ['workspaces.sqlite','plugins.sqlite','jobs.sqlite']){
      const db=new DatabaseSync(join(profile,name));db.exec('CREATE TABLE metadata(n)');db.close();
    }
    const old=snapshots.createSnapshot(profile);
    const owner='fixture.test',name='plugin.sqlite';
    const directory=snapshots.pluginDirectory(profile,owner);
    mkdirSync(directory,{recursive:true});
    const db=new DatabaseSync(join(directory,name));db.exec('CREATE TABLE tally(n); INSERT INTO tally VALUES(12)');db.close();
    const copy=snapshots.createSnapshot(profile,profile,[{owner,name}]);
    const history=snapshots.listSnapshots(profile);
    assert.deepEqual(history.find(item=>item.id===old.id).plugins,[]);
    assert.deepEqual(history.find(item=>item.id===copy.id).plugins,[{owner,hasDatabase:true}]);
    snapshots.prepareRestore(profile,copy.id).commit();
    const restored=snapshots.pluginDirectory(profile,owner);
    assert.notEqual(restored,directory);
    snapshots.prepareRestore(profile,old.id).commit();
    assert.equal(snapshots.pluginDirectory(profile,owner),restored);
    const reopened=new DatabaseSync(join(restored,name),{readOnly:true});
    assert.equal(reopened.prepare('SELECT n FROM tally').get().n,12);reopened.close();
  }finally{rmSync(profile,{recursive:true});}
});

test('process death at restore pointer replacement selects exactly one complete generation',async t=>{
  const {spawnSync}=await import('node:child_process');
  const {fileURLToPath}=await import('node:url');
  const fixture=fileURLToPath(new URL('../fixtures/interrupted-restore.cjs',import.meta.url));
  const profile=mkdtempSync(join(tmpdir(),'workbench-restore-interrupt-'));
  t.after(()=>rmSync(profile,{recursive:true,force:true}));
  const owner='test.counter',name='counter.sqlite';
  const business=snapshots.pluginDirectory(profile,owner);
  mkdirSync(business,{recursive:true});
  const hostFiles=['workspaces.sqlite','plugins.sqlite','jobs.sqlite'];
  const originals=[...hostFiles.map(n=>join(profile,n)),join(business,name)];
  function usingDatabase(file,operation){
    const db=new DatabaseSync(file,{readOnly:operation==='read'});
    try{
      if(operation==='read')return db.prepare('SELECT n FROM marker').get().n;
      db.exec(operation);
    }finally{db.close();}
  }
  for(const file of originals)usingDatabase(file,'CREATE TABLE marker(n); INSERT INTO marker VALUES(1)');
  const backup=snapshots.createSnapshot(profile,profile,[{owner,name}]);
  for(const file of originals)usingDatabase(file,'UPDATE marker SET n=2');
  for(const [phase,value] of [['before',2],['after',1]]){
    const result=spawnSync(process.execPath,[fixture,profile,backup.id,phase],{timeout:5000});
    assert.ifError(result.error);
    assert.equal(result.signal,'SIGKILL',String(result.stderr));
    const active=snapshots.activeDirectory(profile);
    const visible=[...hostFiles.map(n=>join(active,n)),join(snapshots.pluginDirectory(profile,owner),name)];
    assert.deepEqual(visible.map(file=>usingDatabase(file,'read')),[value,value,value,value]);
    assert.deepEqual(originals.map(file=>usingDatabase(file,'read')),[2,2,2,2]);
  }
});

test('interrupted plugin schema upgrade leaves the active generation intact and can retry from the snapshot',async t=>{
  const {spawnSync}=await import('node:child_process');
  const {fileURLToPath}=await import('node:url');
  const worker=fileURLToPath(new URL('../fixtures/migrate-plugin-copy.cjs',import.meta.url));
  const profile=mkdtempSync(join(tmpdir(),'workbench-migration-'));
  t.after(()=>rmSync(profile,{recursive:true,force:true}));
  for(const file of ['workspaces.sqlite','plugins.sqlite','jobs.sqlite']){
    const db=new DatabaseSync(join(profile,file));
    db.exec('CREATE TABLE marker(value);INSERT INTO marker VALUES(9)');
    db.close();
  }
  const owner='fixture.tally',name='counter.sqlite';
  const data=snapshots.pluginDirectory(profile,owner);
  mkdirSync(data,{recursive:true});
  const original=join(data,name);
  const legacy=new DatabaseSync(original);
  legacy.exec('CREATE TABLE tally(value INTEGER);INSERT INTO tally VALUES(17)');
  legacy.close();
  const bytes=readFileSync(original);
  const backup=snapshots.createSnapshot(profile,profile,[{owner,name}]);
  for(const phase of ['no-change','during','after-sql','complete']){
    const run=spawnSync(process.execPath,[worker,profile,backup.id,phase],{timeout:5000});
    assert.ifError(run.error);
    if(phase==='complete')assert.equal(run.status,0,String(run.stderr));
    else if(phase==='no-change'){
      assert.equal(run.status,1);
      assert.match(String(run.stderr),/迁移后的数据库版本与插件声明不符/);
      assert.equal(snapshots.activeDirectory(profile),profile);
      assert.deepEqual(readdirSync(join(profile,'stores')),[]);
    }
    else{
      assert.equal(run.signal,'SIGKILL');
      assert.equal(snapshots.activeDirectory(profile),profile);
      assert.equal(snapshots.pluginDirectory(profile,owner),data);
      assert.equal(readdirSync(join(profile,'stores')).length,1);
      snapshots.discardInterruptedCopies(profile);
      assert.deepEqual(readdirSync(join(profile,'stores')),[]);
    }
    assert.deepEqual(readFileSync(original),bytes);
    assert.equal(snapshots.verifySnapshot(join(profile,'backups',backup.id)).id,backup.id);
    const workspace=new DatabaseSync(join(snapshots.activeDirectory(profile),'workspaces.sqlite'),{readOnly:true});
    try{assert.equal(workspace.prepare('SELECT value FROM marker').get().value,9);}
    finally{workspace.close();}
  }
  const migrated=new DatabaseSync(join(snapshots.pluginDirectory(profile,owner),name),{readOnly:true});
  try{
    assert.equal(migrated.prepare('PRAGMA user_version').get().user_version,1);
    assert.equal(migrated.prepare('SELECT count FROM tally WHERE id=1').get().count,17);
  }finally{migrated.close();}
});

test('startup discards interrupted snapshot staging and retains the last published backup',async t=>{
  const {spawnSync}=await import('node:child_process');
  const dir=mkdtempSync(join(tmpdir(),'workbench-backup-interrupted-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  for(const name of ['workspaces.sqlite','plugins.sqlite','jobs.sqlite']){
    const db=new DatabaseSync(join(dir,name));
    db.exec('CREATE TABLE sample(n);INSERT INTO sample VALUES(42)');
    db.close();
  }
  const good=snapshots.createSnapshot(dir);
  const child=spawnSync(process.execPath,['-e',`
    const fs=require('node:fs');
    const open=fs.openSync;
    fs.openSync=function(file,...args){
      if(typeof file==='string'&&file.includes('.partial-')&&file.endsWith('jobs.sqlite'))
        process.kill(process.pid,'SIGKILL');
      return open.call(this,file,...args);
    };
    require('./packages/host-core/src/persistence/backup.cjs').createSnapshot(process.argv[1]);
  `,dir],{timeout:5000});
  assert.ifError(child.error);
  assert.equal(child.signal,'SIGKILL');
  const root=join(dir,'backups');
  assert.equal(readdirSync(root).length,2);
  assert.deepEqual(snapshots.listSnapshots(dir).map(record=>record.id),[good.id]);
  mkdirSync(join(root,'.partial-legacy'));
  snapshots.discardInterruptedCopies(dir);
  assert.deepEqual(readdirSync(root).sort(),['.partial-legacy',good.id].sort());
  assert.equal(snapshots.verifySnapshot(join(root,good.id)).id,good.id);
  const retry=snapshots.createSnapshot(dir);
  assert.equal(snapshots.verifySnapshot(join(root,retry.id)).id,retry.id);
});
