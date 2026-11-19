import { stripTypeScriptTypes } from 'node:module';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const electron = createRequire(new URL('../runtime/package.json', import.meta.url))('electron');
const dir = await mkdtemp(join(tmpdir(), 'workbench-layout-'));
try {
  for (const [src, dest] of [['../../packages/contracts/src/layout.ts','layout.mjs'],['../../packages/host-core/src/workspace/operations.ts','operations.mjs']]) {
    const source = await readFile(new URL(src,import.meta.url),'utf8');
    await writeFile(join(dir,dest),stripTypeScriptTypes(source).replace('../../../contracts/src/layout.ts','./layout.mjs'));
  }
  for (const file of ['main.cjs','index.html','renderer.mjs'])
    await copyFile(new URL(file,import.meta.url),join(dir,file));
  const child = spawn(electron,[join(dir,'main.cjs'),...process.argv.slice(2)],{stdio:'inherit'});
  process.exitCode = await new Promise((resolve,reject)=>child.once('error',reject).once('exit',code=>resolve(code ?? 1)));
} finally {
  await rm(dir,{recursive:true,force:true});
}
