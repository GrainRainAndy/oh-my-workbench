import {execFileSync} from 'node:child_process';
import {access,cp,mkdir,mkdtemp,readFile,rename,rm,symlink,writeFile} from 'node:fs/promises';
import {basename,join} from 'node:path';
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
  await rm(join(resources,'electron.icns'),{force:true});
  await mkdir(app,{recursive:true});
  await writeFile(join(app,'package.json'),JSON.stringify({
    name:pkg.name,productName:title,version:pkg.version,main:pkg.main,type:pkg.type
  },null,2));
  const development=process.argv.includes('--with-fixtures')||process.argv.includes('--performance-fixture');
  for(const path of ['apps/desktop/main.cjs','apps/desktop/export.cjs','apps/desktop/preload.cjs','apps/desktop/preferences.cjs','apps/desktop/shortcuts.cjs','apps/desktop/credentials.cjs','apps/desktop/service-worker.cjs','apps/desktop/migration-worker.mjs',
    'apps/desktop/dist','apps/desktop/dist-main','apps/desktop/assets','packages/host-core/src','plugins']){
    if(path==='apps/desktop/dist'&&!development){
      execFileSync(join(root,'node_modules/.bin/vite'),['build','apps/desktop','--base','./','--mode','workbench-product','--outDir',join(app,path)],{cwd:root,stdio:'inherit'});
      continue;
    }
    await cp(join(root,path),join(app,path),{recursive:true,filter:src=>(development||!src.startsWith(join(root,'plugins','fixture-')))&&!(/\.(ts|jsx|css)$/.test(src)&&!src.includes('/dist/'))});
  }
  await rename(join(app,'apps/desktop/assets/Workbench.icns'),join(resources,'Workbench.icns'));
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
  const renderer=join(app,'apps/desktop/dist');
  const manifest=JSON.parse(await readFile(join(renderer,'.vite/manifest.json'),'utf8'));
  for(const chunk of Object.values(manifest)){
    for(const file of [chunk.file,...(chunk.css??[]),...(chunk.assets??[])])
      await access(join(renderer,file));
  }
  const notices=join(resources,'Licenses');
  await mkdir(notices);
  await rename(join(renderer,'renderer-licenses.md'),join(notices,'renderer-licenses.md'));
  for(const dep of ['react','react-dom','scheduler','electron'])
    await cp(join(root,'node_modules',dep,'LICENSE'),join(notices,dep+'.txt'));
  await cp(join(dist,'LICENSES.chromium.html'),join(notices,'chromium.html'));
  const plist=join(bundle,'Contents/Info.plist');
  for(const [key,value] of Object.entries({CFBundleIdentifier:'com.grainrain.ohmyworkbench.preview',
    CFBundleName:title,CFBundleDisplayName:title,CFBundleIconFile:'Workbench.icns',
    CFBundleShortVersionString:pkg.version,CFBundleVersion:pkg.version})){
    execFileSync('plutil',['-replace',key,'-string',value,plist]);
  }
  execFileSync('codesign',['--force','--deep','--sign','-',bundle],{stdio:'inherit'});
  execFileSync('codesign',['--verify','--deep','--strict',bundle]);
  const pending=await mkdtemp(join(output,'.pending-'));
  const build=join(output,'macos-'+process.arch+'-'+basename(pending).slice(-6));
  try{
  if(process.argv.includes('--dmg')){
    await symlink('/Applications',join(staging,'Applications'));
    const image=join(pending,`OhMyWorkbench-${pkg.version}-${process.arch}.dmg`);
    execFileSync('hdiutil',['create','-volname',title,'-srcfolder',staging,'-format','UDZO',image],{stdio:'inherit'});
    execFileSync('hdiutil',['verify',image],{stdio:'inherit'});

  }
  await rename(bundle,join(pending,title+'.app'));
  await rename(pending,build);
  }finally{await rm(pending,{recursive:true,force:true});}
  const store=join(root,'scripts/release-store.py');
  execFileSync('python3',[store,'record',basename(build)],{stdio:'inherit'});
  if(!process.argv.includes('--keep-previous')){
    try{execFileSync('python3',[store,'clean'],{stdio:'inherit'});}
    catch{console.warn('轮转未完成。请在可读取进程列表时执行 python3 scripts/release-store.py plan。');}
  }
  if(process.argv.includes('--dmg'))console.log(join(build,`OhMyWorkbench-${pkg.version}-${process.arch}.dmg`));
  console.log(join(build,title+'.app'));
}finally{await rm(staging,{recursive:true,force:true});}
