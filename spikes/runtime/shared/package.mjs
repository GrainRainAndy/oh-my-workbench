import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
export async function discover(directory) {
  const root = await realpath(directory);
  const manifest = JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
  if (typeof manifest?.id !== 'string' || typeof manifest.version !== 'string' || !/^[a-z][a-z0-9.-]+$/.test(manifest.id) || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw Error('INVALID_MANIFEST');
  const entries = {};
  if (!manifest.entrypoints || !Object.keys(manifest.entrypoints).length) throw Error('NO_ENTRY');
  for (const [kind, entry] of Object.entries(manifest.entrypoints)) {
    if (!['ui','service'].includes(kind) || typeof entry !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(entry) || path.isAbsolute(entry) || entry.split('/').includes('..')) throw Error('INVALID_ENTRY');
    const target=await realpath(path.join(root,entry));
    if (!target.startsWith(root+path.sep) || !(await stat(target)).isFile()) throw Error('ENTRY_ESCAPE');
    entries[kind]=target;
  }
  return {manifest,entries,root};
}
