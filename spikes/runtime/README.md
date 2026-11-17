# M0 runtime spike — disposable evidence, not product code

## 已能执行

无需安装任何依赖，使用 Node.js 22+：

```sh
cd spikes/runtime
npm test
```

测试使用真实 Node 子进程与独立 ESM 后台 fixture，临时目录在测试后清理。验证扫描不执行代码、入口路径/符号链接边界、两个客户端共享后台、断开客户端不取消进行中调用、进程崩溃后的连接世代、超时不等于副作用回滚，以及简单任务日志的幂等与未知状态恢复。

这不是 Electron utilityProcess 验收，不是窗口/DOM验收，也不是安全沙箱测试。Node 子进程具备当前用户权限。JSON日志只是单写者实验，未采用SQLite、未验证断电durability；输入JSON字段顺序影响摘要，不能直接作为生产幂等实现。没有完整SDK、授权、迁移或多插件管理器。

## Electron 待执行入口

`electron/` 是使用官方 utilityProcess / BrowserWindow / preload / protocol API 的最小入口。Electron已锁定45.3.4，npm依赖锁文件已生成；官方二进制SHA256核对通过，真实macOS窗口自动验证6项通过，详见证据记录。

ready握手、超时和失败回收已补齐；入口命令为 `npm run electron`。自动验证：`npm run electron -- --verify`，真实窗口会自动关闭、重建并退出，结果写入docs/qa/evidence/electron-runtime.json。

人工步骤：启动后两实例分别提交；关闭窗口；通过Dock或应用菜单Reopen workspace重开；查询后台stats与日志，对照executions/completed。菜单可结束后台，用于观察故障；此入口没有自动恢复、退出确认、菜单栏图标、登录启动或全局热键，不能当产品桌面行为验收。测试程序仅执行延迟计数，不接真实业务服务。

UI模块为独立本地ESM，静态路径白名单加载；禁止远端脚本及新窗口，有限IPC只接受主frame。但共享JS环境不隔离恶意插件。开发运行CSP下加载已通过；正式发布包、升级/签名后加载仍未测试。

## Tauri 前置检查

`tauri/` 检查Rust/Tauri构建及双视图加载，不是同功能性能对照。后续授权下载后已成功构建，Cargo.lock锁定Tauri 2.12.6及传递依赖。通过真实WKWebView窗口加载同一fixture UI的两个实例，输出tauri-ui-ready；界面资源为构建时嵌入，尚未验证运行时安装包。

后续接入与Electron相同的独立ESM与Node后台工作负载，再比较；不能拿空Tauri窗口对比完整Electron后台。尚未打包Node侧车，也未选其分发方式。

## 证据与剩余工作

见 [本轮结果](../../docs/qa/evidence/runtime-progress.md)。原计划S01–S06均未整体完成；不提前修改框架ADR为最终选定。
