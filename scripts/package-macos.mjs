import {execFileSync} from 'node:child_process';
import {cp,mkdir,mkdtemp,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

if(process.platform!=='darwin')throw Error('macOS packaging requires macOS.');
const root=fileURLToPath(new URL('../',import.meta.url));
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const dist=join(root,'node_modules/electron/dist');
if((await readFile(join(dist,'version'),'utf8')).trim()!==pkg.devDependencies.electron)
  throw Error('Electron runtime version differs from the pinned version.');
const output=join(root,'release');
await mkdir(output,{recursive:true});
const staging=await mkdtemp(join(output,'.stage-'));
const title='Oh My Workbench';
const bundle=join(staging,title+'.app');
const resources=join(bundle,'Contents/Resources');
const app=join(resources,'app');
try{
  execFileSync('ditto',[join(dist,'Electron.app'),bundle]);
  await rm(join(resources,'default_app.asar'),{force:true});
  await mkdir(app,{recursive:true});
  await writeFile(join(app,'package.json'),JSON.stringify({
    name:pkg.name,productName:title,version:pkg.version,main:pkg.main,type:pkg.type
  },null,2));
  for(const path of ['apps/desktop/main.cjs','apps/desktop/preload.cjs','apps/desktop/preferences.cjs','apps/desktop/shortcuts.cjs','apps/desktop/credentials.cjs','apps/desktop/service-worker.cjs','apps/desktop/migration-worker.mjs',
    'apps/desktop/dist','apps/desktop/dist-main','apps/desktop/assets','packages/host-core/src','plugins']){
    await cp(join(root,path),join(app,path),{recursive:true,filter:src=>!(/\.(ts|jsx|css)$/.test(src)&&!src.includes('/dist/'))});
  }
  if(process.argv.includes('--performance-fixture')){
    const palette=join(app,'plugins','fixture-palette');
    const path=join(palette,'manifest.json');
    const manifest=JSON.parse(await readFile(path,'utf8'));
    const identity={id:'fixture.performance',version:'1'};
    manifest.services=[{...identity,methods:{ping:{input:'string[]',output:'string'}}}];
    manifest.usesServices.push(identity,{id:'workbench.tally',version:'1.0.0'});
    manifest.jobs.push({type:'timed-probe',title:'无窗采样',service:identity.id,version:identity.version,method:'ping'});
    await writeFile(path,JSON.stringify(manifest));
    await writeFile(join(palette,'backend.mjs'),"export async function call(service,method,input){if(Array.isArray(input)){await new Promise(resolve=>setTimeout(resolve,4000));}return String(process.pid)}");
  }
  const notices=join(resources,'Licenses');
  await mkdir(notices);
  for(const dep of ['react','react-dom','scheduler','electron'])
    await cp(join(root,'node_modules',dep,'LICENSE'),join(notices,dep+'.txt'));
  await cp(join(dist,'LICENSES.chromium.html'),join(notices,'chromium.html'));
  const plist=join(bundle,'Contents/Info.plist');
  for(const [key,value] of Object.entries({CFBundleIdentifier:'com.grainrain.ohmyworkbench.preview',
    CFBundleName:title,CFBundleDisplayName:title,CFBundleShortVersionString:pkg.version,CFBundleVersion:pkg.version})){
    execFileSync('plutil',['-replace',key,'-string',value,plist]);
  }
  execFileSync('codesign',['--force','--deep','--sign','-',bundle],{stdio:'inherit'});
  execFileSync('codesign',['--verify','--deep','--strict',bundle]);
  // Keep each verified build independently launchable.
  const build=await mkdtemp(join(output,'macos-'+process.arch+'-'));
  const target=join(build,title+'.app');
  await rename(bundle,target);
  console.log(target);
}finally{await rm(staging,{recursive:true,force:true});}
