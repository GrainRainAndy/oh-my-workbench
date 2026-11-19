import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
const electron=process.env.WORKBENCH_TEST_ELECTRON??createRequire(import.meta.url)('electron');
const dir=await mkdtemp(join(tmpdir(),'workbench-desktop-test-'));
try {
  for(const args of [['tests/e2e/idle-backend.cjs'],['tests/e2e/backend-crash-limit.cjs'],['tests/e2e/delegated-file.cjs'],['tests/e2e/desktop.cjs'],['tests/e2e/desktop.cjs','--verify-relaunch'],['tests/e2e/compact-window.cjs'],['tests/e2e/first-import.cjs'],['tests/e2e/shortcut-settings.cjs','--native-conflict'],['tests/e2e/content-boundary.cjs'],['tests/e2e/login-startup.cjs'],['tests/e2e/no-window.cjs'],['tests/e2e/startup-recovery.cjs'],['tests/e2e/future-plugin-data.cjs'],['tests/e2e/future-plugin-data.cjs','--legacy-limit'],...['seed','missing','restored'].map(phase=>['tests/e2e/missing-plugin.cjs',phase]),['tests/e2e/safe-mode.cjs','--safe-mode']]){
    console.log('Running',args.join(' '));
    const child=spawn(electron,args,{
      env:{...process.env,WORKBENCH_E2E_TEMP_DIR:dir},stdio:'inherit',timeout:args[0]==='tests/e2e/desktop.cjs'?180000:60000
    });
    const [status,signal]=await once(child,'close');
    if(status!==0)throw Error(`${args.join(' ')} failed (${signal??status})`);
  }
}finally{await rm(dir,{recursive:true,force:true});}
