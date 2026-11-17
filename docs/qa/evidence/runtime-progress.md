# T00 首轮技术验证进度

状态：进行中；用户后续批准Git创建与下载，先前环境限制已解除。下方首轮阻塞为历史记录，最新结果见文末；不代表M0完成。

## 环境与阻塞

实际主机：macOS 27.0.1 (26A434)、arm64；Node v26.13.1、npm 11.20.0、rustc/cargo 1.94.1。已有工具链，不代表已有框架依赖。

- npm访问Electron包信息失败：connect EPERM 127.0.0.1:7897。当前执行环境拒绝网络连接，不擅自修改代理或绕开限制。
- 本地未找到可用Electron依赖；Rust缓存无tauri。离线cargo check实际失败，日志见 [tauri-build.txt](tauri-build.txt)。
- git init -b spike/m0-runtime被文件系统权限拒绝：.git Operation not permitted。当前目录继续开发独立spikes子目录，无Git提交/分支/worktree；未尝试提升权限。

## 已执行证据

- 测试先于模块编写；首次运行因模块尚不存在失败，记录 [runtime-red.txt](runtime-red.txt)。这是测试搭建阶段的导入错误，不称为逐行为TDD红灯。
- [runtime-tests.txt](runtime-tests.txt)：Node内置测试执行真实子进程，最终8项通过。包括共享后台、客户端断开、后台崩溃、世代失效、超时后操作仍完成，以及日志恢复不重放。
- Electron main/worker/preload已执行node --check；只验证语法，不证明Electron API行为。未安装依赖，不能做桌面性能结论。
- references保持只读；测试只写临时目录与当前证据目录，不运行会写回原资料的Demo脚本。

## S01–S06状态

| 项目 | 当前证据 | 尚缺 |
|---|---|---|
| S01动态插件 | Node后台独立ESM加载、静态发现、路径负例；Electron动态UI入口已写 | 两栈实际桌面UI/发布包/CSP/版本更新 |
| S02进程与故障 | 真实Node子进程故障和旧连接失效；客户端断开任务继续 | Electron/Tauri进程、真关窗、3后台8视图、UI卡死 |
| S03桌面行为 | 尚无原生实测 | 登录/菜单栏/Dock/热键/关窗退出/睡眠通知 |
| S04性能 | 未测，禁止用单测耗时作为性能结论 | 两栈同负载、发布包、全进程资源与长运行 |
| S05布局 | 未开始 | 无标签布局适配、12格、尺寸/键盘/序列化 |
| S06恢复 | 简单日志重载unknown、幂等冲突、终态不可倒退、损坏文件保留 | 真远端接受后故障、SQLite与迁移副本切换 |

## 实施判断记录

Ruling: T00采用隔离spikes目录，在无Git写权限下不创建worktree、不伪造提交。成本：暂时无版本历史；恢复权限后补初始版本管理。

Ruling: 依赖下载被环境阻止后，先用零依赖Node试验验证通用后台语义；它不替代桌面框架验证。成本：后续必须在两套实际运行环境重验。

Ruling: Tauri只保留最小构建前置探针，不在无法编译时铺开大量Rust实现。成本：当前不能提供对等框架性能比较，ADR保持待证据冻结。

下一步在允许依赖下载的执行环境安装并锁定框架版本，先跑S01/S02真实桌面路径，再补原生行为与性能。不得将当前实验直接升级为生产SDK。


## 独立代码审阅与修复

审阅指出并发激活重复启动子进程、损坏日志load失败后仍可覆盖原件、Manifest缺失/null ID被正则隐式转换接受三项。已分别添加回归断言，观察3项失败（review-regressions-red.txt），修复后完整8项通过。崩溃测试也改为先确认后台第二次工作已开始且未完成，再终止进程，避免把“尚未接收”误作“执行中断”。

Electron入口仍有未完成项：请求未以ready握手作为激活门槛，且未实现启动超时与激活失败回收。因为框架不可运行，明确保留为未验证脚手架，不据它报告S01/S02通过；实际桌面试验前必须先补齐并验证。这不是当前Node通用后台试验的通过范围。


## 授权下载后的进展

用户明确允许创建本地.git与下载依赖后，已在spike/m0-runtime分支初始化仓库；没有设置remote或推送。npm锁定Electron 45.3.4，Cargo.lock锁定Tauri 2.12.6。Tauri debug构建成功，真实WKWebView窗口中动态import预置ESM并挂载两实例，输出见tauri-run.txt；尚无Node后台，所以不是同负载对照。

补齐Electron ready握手/启动超时/退出失败处理，通用测试增至9项通过。Electron自动化入口验证两DOM实例、受限preload调用、真实关窗期间utilityProcess任务、重建窗口查状态及后台终止。

下载说明：官方安装器等待过久，检查确认官方GitHub文件可达，改用curl读取同一官方发布文件并按npm包checksums.json核对SHA256；未修改系统代理、未使用第三方镜像。


## 本轮最终实测结果

Electron 45.3.4（开发运行，未打包）在macOS arm64真实窗口验证6项通过，退出码0，证据electron-runtime.json与electron-run.txt：独立ESM挂载两个DOM实例、renderer无Node process、有限preload调用、实际关窗后后台任务完成、窗口重建读回结果、终止后台后拒绝在途调用且宿主继续。记录显示窗口于21:00:20.731Z关闭、任务响应于21:00:21.430Z完成；代码还断言后台完成时间晚于关窗。

独立审阅发现启动activate竞态、整体验证缺少超时、关窗测试顺序证明不足，已增加bootstrap门槛、20秒总超时和完成时间顺序断言。握手模块已有就绪/退出/超时测试；完整Node测试9项通过。Tauri重新构建后真实窗口报告instances=2并正常退出，带20秒失败保护。当前没有已知审阅阻断项留在这些验证路径。

官方Electron下载文件SHA256核对通过，见electron-checksum.txt；npm安装审计14包报告0漏洞（不等于安全审计或无漏洞保证）。没有修改系统登录项、菜单栏/热键设置或系统代理。两套桌面试验已退出。

S01/S02获得部分真实桌面证据；S03–S06剩余项、发布签名包与同负载性能仍未完成。框架ADR仍未最终冻结。下一步补齐Tauri相同后台工作负载，再测资源占用，而非拿空窗口与Electron比较。


## Tauri 后台对等验证（最新）

用户指定GitHub仓库并要求推进Tauri后台后，接入Rust监督的真实Node子进程与JSONL RPC。service.mjs直接复用Electron fixture；相同双视图、800ms任务及10s中断任务。真实WKWebView窗口验证6项通过，退出码0；日志确认Destroyed事件早于completedAt，重开后由前端再次调用Rust命令读回completed=1。终止Node时在途请求返回BACKEND_EXITED，宿主继续记录证据并退出。完整记录见tauri-runtime.json、tauri-run.txt。

Rust测试2项通过（覆盖并发stats/任务、超时后继续、进程结束/停止后调用、非法方法），Node通用9项继续回归。测试先写，初始因backend模块不存在编译失败，保留tauri-backend-red.txt，不冒充逐行为红灯。现在S02已有两栈单后台真实关窗证据；3后台8视图、发布包、升级迁移和长期性能仍未完成。

限制：Tauri使用系统Node（本机26.13.1），Electron嵌入Node24.22.3；UI资源在Tauri构建时嵌入，尚无动态安装包/打包Node运行环境。核心业务代码相同，但这不等于发行形态或性能条件完全一致。控制消息仍是可信小型fixture，没有完整生产SDK/授权/取消/更新模型。

远端origin已按用户要求配置为https://github.com/GrainRainAndy/oh-my-workbench.git，初始化检查为空；本轮只同步spike/m0-runtime，不强制推送或覆盖其他分支。


### Tauri本轮审阅后的最终回归

把主动stop故障模拟改为只向子进程发送终止信号，pending失败必须来自真实EOF处理；EOF路径现在回收子进程，避免宿主常驻时留下僵尸。首次窗口与重建窗口统一使用导航过滤，命令同时检查窗口label和实际本地URL。收紧完成时间为严格晚于Destroyed，自动验证启动时清除旧成功报告，失败不能留下上次通过记录。

统一来源校验一度错误拒绝Tauri实际根入口tauri://localhost，真实窗口就绪超时。已新增根URL/文档URL及外部来源负例，观察失败后修复（tauri-origin-red.txt），Rust最终3项通过；随后真实窗口完整6项重新通过、退出码0，tauri-run.txt与tauri-runtime.json为最终证据。

明确保留的试验限制：RPC的timeout限定响应等待，不覆盖stdin写管道堵塞；当前可信小消息fixture没有验证恶意或停止读取的后台。生产运行器需有有界发送队列、消息大小与背压处理，此项不作为本轮通过声明。Cmd+Q走试验专用退出菜单，系统注销/关闭会话等完整生命周期尚未验收。
