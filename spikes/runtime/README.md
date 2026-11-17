# M0 runtime spike — disposable evidence, not product code

## 已能执行

无需安装任何依赖，使用 Node.js 22+：

```sh
cd spikes/runtime
npm test
```

测试使用真实 Node 子进程与独立 ESM 后台 fixture，临时目录在测试后清理。验证扫描不执行代码、入口路径/符号链接边界、两个客户端共享后台、断开客户端不取消进行中调用、进程崩溃后的连接世代、超时不等于副作用回滚，以及简单任务日志的幂等与未知状态恢复。

这不是 Electron utilityProcess 验收，不是窗口/DOM验收，也不是安全沙箱测试。Node 子进程具备当前用户权限。JSON日志只是单写者实验，未采用SQLite、未验证断电durability；输入JSON字段顺序影响摘要，不能直接作为生产幂等实现。没有完整SDK、授权、迁移或多插件管理器。

## Electron 运行入口

`electron/` 是使用官方 utilityProcess / BrowserWindow / preload / protocol API 的最小入口。Electron已锁定45.3.4，npm依赖锁文件已生成；官方二进制SHA256核对通过，真实macOS窗口自动验证6项通过，详见证据记录。

ready握手、超时和失败回收已补齐；入口命令为 `npm run electron`。自动验证：`npm run electron -- --verify`，真实窗口会自动关闭、重建并退出，结果写入docs/qa/evidence/electron-runtime.json。

人工步骤：启动后两实例分别提交；关闭窗口；通过Dock或应用菜单Reopen workspace重开；查询后台stats与日志，对照executions/completed。菜单可结束后台，用于观察故障；此入口没有自动恢复、退出确认、菜单栏图标、登录启动或全局热键，不能当产品桌面行为验收。测试程序仅执行延迟计数，不接真实业务服务。

UI模块为独立本地ESM，静态路径白名单加载；禁止远端脚本及新窗口，有限IPC只接受主frame。但共享JS环境不隔离恶意插件。开发运行CSP下加载已通过；正式发布包、升级/签名后加载仍未测试。

## Tauri 相同后台任务

Tauri 2.12.6由Rust宿主管理Node子进程，JSONL消息按requestId分发，读取响应与等待调用分离，长任务不会阻塞stats查询。后台动态加载与Electron相同的 `fixtures/counter/service.mjs`；UI同样挂载两个实例。

```sh
cargo test --locked --manifest-path tauri/Cargo.toml --target-dir /tmp/workbench-tauri-target
cargo build --locked --manifest-path tauri/Cargo.toml --target-dir /tmp/workbench-tauri-target
WORKBENCH_VERIFY=1 /tmp/workbench-tauri-target/debug/workbench-tauri-build-probe
```

以上命令在spikes/runtime目录运行。去掉WORKBENCH_VERIFY即可手动操作；应用菜单提供Reopen workspace和Quit Spike（Cmd+Q）。关最后窗口保留后台，Dock重新打开；明确退出回收Node子进程。试验未实现产品级退出任务确认，勿用于真实业务数据。

Node默认从PATH启动，可用WORKBENCH_NODE指定可执行文件；当前使用开发机Node，尚未随安装包附带。UI模块为构建时嵌入的同一fixture副本，不等同于运行时第三方插件安装。没有强沙箱或完整授权机制。Rust命令仅开放fixture方法，读取/等待在后台线程，不阻塞UI线程。

自动验证6项：双实例DOM、renderer无Node全局、UI→Rust→Node调用、真实窗口销毁后完成任务、重建窗口读回状态、后台终止不退出宿主。证据tauri-runtime.json及tauri-run.txt。Rust测试3项，覆盖来源URL、并发、超时不回滚、进程终止拒绝在途调用与方法拒绝；两栈使用同一模拟延迟业务，但尚无发布包/同Node版本/资源成本对比，不能以此宣布性能胜负。

## 证据与剩余工作

见 [本轮结果](../../docs/qa/evidence/runtime-progress.md)。原计划S01–S06均未整体完成；不提前修改框架ADR为最终选定。

注意：当前Rust RPC超时仅限制写入后的响应等待；未验证停止读取导致的管道堵塞。生产发送队列/背压、发布打包和系统注销仍待后续验证。
