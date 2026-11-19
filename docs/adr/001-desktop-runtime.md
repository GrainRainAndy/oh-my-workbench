# ADR-001 桌面框架与插件执行路线

> 最新决策（C）：用户已选定 Electron，M1 首个本地工具选定 Whisper 语音转写。下文早期候选状态作为历史记录。发布包、常驻资源和真实转写仍需分别验收。T01 已开始。

日期 2026-11-18；状态：验证路线 Accepted（用户回复“都确认按照你的思路走”）；最终框架选择仍等待 Spike 证据。推荐 Electron + TypeScript + React（默认 UI Kit）+ SQLite；不是因旧稿选过而冻结。

## 对项目的比较

| 约束 | Electron 路线 | Tauri 路线 | 判断 |
|---|---|---|---|
| 动态自定义 Web UI | Chromium 加载本地 ESM，需资源协议/CSP设计 | 系统 WebView 同样可承载 Web UI，需资源加载与权限设计 | 二者都不是现成业务插件宿主，打包后实测 |
| JS/TS后台插件 | utilityProcess 自带 Node、消息端口 | 需自建 JS runtime 或随包 Node sidecar；Rust原生插件不是运行时业务包替代 | 当前插件开发体验偏 Electron |
| 生命周期/IPC | 主进程监督插件进程；序列化协议 | Rust core 监督侧车；跨 Rust/JS 协议与双工具链 | 都需自己实现 generation/任务恢复 |
| macOS 集成 | app/Tray/globalShortcut/Notification 等 | core 窗口/托盘及官方 autostart 等插件 | 均可评估，不以 API 存在当验收通过 |
| 常驻与登录 | 识别登录启动，自行决定是否创建窗口 | 启动参数与 autostart，自行决定窗口 | 无窗后台属于应用生命周期设计 |
| 内存/CPU/启动 | 打包浏览器与Node，需测全进程 | 复用系统WebView，若补Node侧车会改变成本 | 更小包不推出更低总RSS/CPU或更快启动 |
| 跨桌面 | 渲染引擎较一致，框架随应用更新 | 不同系统WebView需额外兼容验证 | 首版仅macOS；后续都要实际测试 |
| 移动 | 不直接复用桌面外壳 | 有移动路线，但动态插件/常驻仍受平台约束 | 不作为本轮决定性指标 |
| 维护 | TS路径统一，承担Electron/Chromium升级和原生ABI | Rust+Web+可能Node，承担侧车签名/架构与WebView差异 | 对当前插件形态 Electron 集成面较少（推断） |

官方事实：utilityProcess 创建带 Node 和 MessagePort 的子进程（[Electron API](https://www.electronjs.org/docs/latest/api/utility-process)）。Tauri 使用 OS WebView，macOS 为 WKWebView，core 管理 IPC/窗口等（[进程模型](https://v2.tauri.app/concept/process-model/)）；sidecar 要准备目标架构对应二进制（[侧车文档](https://v2.tauri.app/develop/sidecar/)）。这些事实支持开发复杂度判断，不构成性能基准。

## 桌面行为证据与注意点

Electron app 文档提供登录项设置/状态与登录启动识别；当前 latest 文档历史表标明 >=45 移除 openAsHidden，并提示 macOS 登录项可靠性需要打包、签名与公证。实施应核对实际锁定版本，不照搬旧博客，不靠该字段实现静默启动（[app](https://www.electronjs.org/docs/latest/api/app)）。全局快捷键在应用失焦时工作，需检查注册失败（[globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut)）。Tauri autostart 提供启停/状态，macOS 示例使用 LaunchAgent（[autostart](https://v2.tauri.app/plugin/autostart/)）。本项目用登录启动应用，不引入退出后继续工作的独立守护。

上述官方页面于本轮在线查阅；latest 可能覆盖未来或不同版本，锁定版本必须重新核对。菜单栏默认值、静默启动与热键语义是产品决策，不由框架决定。

## 风险、备选与门槛

推荐理由：核心挑战是动态 UI+插件后台生命周期，统一 TS/Node 可减少首轮运行器自建工作。主要风险是资源占用、共享 UI 故障域、原生 SQLite ABI、签名后插件加载。Tauri+Web UI+Node sidecar 是公平替代；全 Rust 业务插件会改变 SDK 开发体验，不能当成同等范围廉价替代。

按 [Spike](../plans/spikes.md) 做相同发布负载对比。若 Electron 无法达到确认后的常驻预算或发布加载失败，而 Tauri 达标且侧车维护成本可接受，则改选 Tauri并更新计划；若二者均不达标，先优化生命周期/进程数或重新确认预算，不伪造达标。没有本轮实测数字，不能宣布最终胜出。

S05 已在锁定版本的 Electron 开发窗口验证自建递归 split 的首个子集，结果见 [QA 记录](../qa/evidence/runtime-progress.md)。生产布局适配器的选择仍待完整 S05 验收。
