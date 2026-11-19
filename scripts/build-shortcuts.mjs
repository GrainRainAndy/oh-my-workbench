import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
if(process.platform==='darwin'){
  const include=resolve(dirname(process.execPath),'../include/node');
  execFileSync('clang++',['-std=c++17','-bundle','-undefined','dynamic_lookup','-framework','Carbon','-I',include,
    'apps/desktop/native/shortcuts.cc','-o','apps/desktop/dist-main/shortcuts.node'],{stdio:'inherit'});
}
