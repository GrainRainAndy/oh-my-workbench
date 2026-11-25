// Run each browser scenario in its own temporary profile, one at a time.
import {execFileSync} from 'node:child_process';
import {accessSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';

const candidate=process.argv[2];
if(!candidate||process.argv.length!==3)throw Error('请传入待验证的 .app 路径');
const app=resolve(candidate);
accessSync(join(app,'Contents/Resources/app/apps/desktop/dist/index.html'));

const release='tests/e2e/release-renderer-headless.mjs';
const fixtures=existsSync(join(app,'Contents/Resources/app/plugins/fixture-palette'));
const scenarios=[
  ['源码组件：视图选择与快捷入口',['tests/e2e/view-choices-headless.mjs']],
  ['源码组件：日程时间轴',['tests/e2e/calendar-headless.mjs']],
  ...(fixtures?[['验证包：工作区、服务与后台导出',[release,app]]]:[]),
  ['发布包：全天日程与待办恢复',[release,app,'--read-retry']],
  ['发布包：定时会议与时间表布局',[release,app,'--timed']],
  ['发布包：660 × 460 与八窗格键盘操作',[release,app,'--compact-ui']],
  ['发布包：任务取消与中断恢复',[release,app,'--job-center']]
];
for(const [name,args] of scenarios){
  console.log(name);
  if(args[0]===release){
    execFileSync(join(app,'Contents/MacOS/Electron'),args,{
      env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'inherit'
    });
  }else{
    execFileSync(process.execPath,args,{stdio:'inherit'});
  }
}
console.log(scenarios.length+' 组无窗口测试全部通过');
