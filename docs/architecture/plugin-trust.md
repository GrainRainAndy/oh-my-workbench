# 插件信任与运行边界

状态：首版信任范围已确认（用户回复“1确认”）：A 第一方/自写可信插件，预留 B，C 不纳入首版承诺。具体工程措施仍为待评审设计。

| 模式 | 执行范围 | 额外工程与代价 | 不可误述 |
|---|---|---|---|
| A 第一方/自写可信 | 随附、开发者审查的包；默认业务也走 SDK | Manifest、故障归属、数据保护、依赖检查 | 第一方也会出错，不能免除接口与恢复测试 |
| B 用户信任第三方 | 用户逐包逐版本明确接受风险后执行 | 包安装、来源/哈希、更新差异、信任记录、卸载与回滚 | 同权限 Node 代码仍可能绕过 broker；信任不是沙箱 |
| C 不可信插件 | 恶意代码仍必须限制访问 | 独立受限 UI、受限后台/OS沙箱、额度、网络/文件代理、委托权限、安全审计 | 不能把 A/B 加一个开关变成 C |

模块隔离：包/API/依赖方向，防止耦合。进程隔离：地址空间与生命周期分开。故障隔离：具体异常/卡死不会影响哪些部分，需要注入验证；分进程也不能保证无资源耗尽。安全沙箱：对恶意代码强制限制能力，与前三者不同。

本方案共享可信 UI renderer，CSS Modules/容器样式或 Shadow DOM 只防样式误污染；ErrorBoundary 不防死循环。插件后台 utilityProcess 有 Node 能力（[官方 API](https://www.electronjs.org/docs/latest/api/utility-process)），属于可信进程，不是安全沙箱。Tauri capability 也明确不防恶意 Rust、错误 scope 检查等（[官方边界](https://v2.tauri.app/security/capabilities/)）。

SDK 校验身份来自后台通道/世代，不能相信 JSON 自报 pluginId；UI 在共享 JS 环境中不能声称强身份隔离。提供者调用文件能力需显式 delegated grant，不因拥有更高权限替调用方任意读取。API 的 scope/namespace 校验防误用且可审计，不限制可信 Node 自行读文件。

包在导入/发现阶段只读 Manifest。执行前检验入口真实路径、文件存在、哈希、大小、重复路径/符号链接逃逸、API与平台、贡献冲突；禁止安装脚本。哈希证明内容一致，不证明作者身份或无恶意。B 若启用需版本变更再确认与来源记录；已确认首版 A，不建设可执行第三方安装入口。

renderer 禁 Node、启用 contextIsolation/sandbox，有限 preload API；禁止任意 IPC、任意 shell 字符串、远端代码加载，校验消息来源/参数/长度；外部网页默认系统浏览器打开，结果文本按不可信数据渲染（[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)）。文件路径不是 grant，打开时校验真实目标和撤销状态；网络端点精确协议/主机/端口，重定向重检；凭据不进入 UI/日志/导出。

可信恶意插件、框架/OS漏洞、整个 UI renderer 资源耗尽不在本方案完整防御承诺中。保护目标是清晰契约、错误恢复和外部输入防护；若用户要求 C，必须在生产实现前重开 ADR 与运行模型。
