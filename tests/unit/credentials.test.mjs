import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generateKeyPairSync,publicEncrypt,privateDecrypt} from 'node:crypto';
import credentials from '../../packages/host-core/src/platform/credentials.cjs';

test('encrypted credentials survive restart, isolate owners and fail closed when encryption is unavailable',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'workbench-credentials-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'credentials.sqlite');
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  let available=true;
  const encryption={isEncryptionAvailable:()=>available,
    encryptString:value=>publicEncrypt(publicKey,Buffer.from(value)),
    decryptString:bytes=>privateDecrypt(privateKey,bytes).toString()};
  let store=credentials.openCredentials(file,encryption);
  t.after(()=>store.close());
  const secret='private-fixture-credential-123';
  const handle=await store.forPlugin('fixture.a').store(secret);
  store.close();
  assert.equal(readFileSync(file).includes(Buffer.from(secret)),false);
  store=credentials.openCredentials(file,encryption);
  const owner=store.forPlugin('fixture.a'),other=store.forPlugin('fixture.b');
  await assert.rejects(()=>other.use(handle,()=>assert.fail()),/凭据不可用/);
  assert.equal(other.revoke(handle),false);
  assert.equal(await owner.use(handle,value=>value===secret),true);
  available=false;
  await assert.rejects(()=>owner.store(secret),/系统凭据存储不可用/);
  await assert.rejects(()=>owner.use(handle,()=>assert.fail()),/系统凭据存储不可用/);
  assert.equal(owner.revoke(handle),true);
  available=true;
  await assert.rejects(()=>owner.use(handle,()=>assert.fail()),/凭据不可用/);
});

test('revocation during decryption prevents delivery to the consumer',async t=>{
  const started=Promise.withResolvers();
  const release=Promise.withResolvers();
  const store=credentials.openCredentials(':memory:',{
    isEncryptionAvailable:()=>true,
    encryptString:value=>Buffer.from(value),
    decryptString:async bytes=>{
      started.resolve();
      await release.promise;
      return bytes.toString();
    }
  });
  t.after(()=>store.close());
  const owner=store.forPlugin('fixture.a');
  const handle=await owner.store('synthetic-test-value');
  let delivered=false;
  const pending=owner.use(handle,()=>{delivered=true;});
  await started.promise;
  assert.equal(owner.revoke(handle),true);
  release.resolve();
  await assert.rejects(pending,/凭据不可用/);
  assert.equal(delivered,false);
});
