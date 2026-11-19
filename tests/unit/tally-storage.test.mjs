import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';

function increment(dataDirectory){
    return spawnSync(process.execPath,['--input-type=module','-e',
      "import {call} from './plugins/fixture-tally/backend.mjs';console.log(call('workbench.tally','increment','total',{dataDirectory:process.argv[1]}))",
      dataDirectory],{encoding:'utf8'});
  }

test('counter opens legacy files and rejects future databases without writing',t=>{
  const dataDirectory=mkdtempSync(join(tmpdir(),'tally-version-'));
  t.after(()=>rmSync(dataDirectory,{recursive:true}));
  const file=join(dataDirectory,'counter.sqlite');
  const db=new DatabaseSync(file);
  db.exec('CREATE TABLE tally(id INTEGER PRIMARY KEY CHECK(id=1),count INTEGER NOT NULL); INSERT INTO tally VALUES(1,17)');
  db.close();
  assert.equal(increment(dataDirectory).stdout.trim(),'18');
  const future=new DatabaseSync(file);
  future.exec('PRAGMA user_version=2');
  future.close();
  const original=readFileSync(file);
  const rejected=increment(dataDirectory);
  assert.notEqual(rejected.status,0);
  assert.match(rejected.stderr,/数据版本/);
  assert.deepEqual(readFileSync(file),original);
});

test('legacy counter at its limit remains readable after a rejected increment',t=>{
  const dataDirectory=mkdtempSync(join(tmpdir(),'tally-limit-'));
  t.after(()=>rmSync(dataDirectory,{recursive:true}));
  const file=join(dataDirectory,'counter.sqlite');
  const db=new DatabaseSync(file);
  db.exec('CREATE TABLE tally(id INTEGER PRIMARY KEY CHECK(id=1),count INTEGER NOT NULL)');
  db.prepare('INSERT INTO tally VALUES(1,?)').run(Number.MAX_SAFE_INTEGER);
  db.close();
  const original=readFileSync(file);
  const result=increment(dataDirectory);
  assert.notEqual(result.status,0);
  assert.deepEqual(readFileSync(file),original);
  const reopened=new DatabaseSync(file,{readOnly:true});
  try{assert.equal(reopened.prepare('SELECT count FROM tally').get().count,Number.MAX_SAFE_INTEGER);}
  finally{reopened.close();}
});

test('plugin migration refuses future and ambiguous historical copies without changing their bytes',async t=>{
  const {migrate}=await import('../../plugins/fixture-tally/migrate.mjs');
  for(const sql of [
    'CREATE TABLE tally(value INTEGER); INSERT INTO tally VALUES(17),(18)',
    'CREATE TABLE tally(id INTEGER PRIMARY KEY,count INTEGER); INSERT INTO tally VALUES(1,17); PRAGMA user_version=2'
  ]){
    const dataDirectory=mkdtempSync(join(tmpdir(),'tally-migration-'));
    t.after(()=>rmSync(dataDirectory,{recursive:true}));
    const file=join(dataDirectory,'counter.sqlite');
    const db=new DatabaseSync(file);
    db.exec(sql);
    db.close();
    const before=readFileSync(file);
    assert.throws(()=>migrate({dataDirectory}),/损坏|不兼容/);
    assert.deepEqual(readFileSync(file),before);
  }
});
