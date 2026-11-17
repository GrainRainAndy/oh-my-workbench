# 决策记录、假设、待决项与资料来源

**版本：v1.0 评审稿｜核查日期：2026-11-18**

## 1. 用户已经明确的决定

| ID | 决定 | 状态与影响 |
|---|---|---|
| D01 | Q1 选 C，分阶段：核心→可日常使用的产品 | C；不把示例插件演示称为产品完成 |
| D02 | Q2 选 A，工作区中心 | C；启动恢复工作区，不强制首页/应用中心 |
| D03 | Q3 要求详细展开 | O；不能代替用户最终选 A/B/C |
| D04 | Q4 没有有效答案 | O；上轮交互选项缺失，不能推定批准了某份扩展点清单 |
| D05 | Q5 选 C，统一设计体系＋自定义 UI | C；SDK 不只允许固定表单/卡片 |
| D06 | Q6 选 B，应用运行期后台执行 | C；不要求守护进程；视图关闭不等于取消 |
| D07 | Q7 选 B，显式服务接口 | C；宿主不建立统一日程/待办/项目业务模型 |
| D08 | Q8 支持到保存多工作区，不需要宿主单窗格多标签 | C；插件内部标签由插件自行管理 |
| D09 | 日程和待办要在 MVP 独立完整可用 | C；Apple 数据源不是前提 |
| D10 | 业务功能尽可能插件化，先设计核心 | C；项目/校园业务细节后续独立设计 |
| D11 | macOS 优先，未来扩展其他桌面和移动 | C；不强求首版多端，不堵死协议扩展 |
| D12 | Wave 仅可参考窗格，不继承终端产品定位 | C；不能把产品做成终端外壳 |

## 2. 当前建议基线（不是已确认决定）

| ADR | 建议 | 理由 / 代价 |
|---|---|---|
| ADR-01 信任 | 首版 A，自写/第一方；预留 B；C 不作承诺 | 减少初期安全平台范围，但不防恶意可信代码 |
| ADR-02 桌面实现 | Electron + TypeScript + React 为参考，Tauri 为替代 | 方便写出具体方案；资源预算、动态加载、平台桥接仍要验证 |
| ADR-03 布局 | 自有二叉布局模型＋可替换 LayoutAdapter，优先验证无标签 Gridview | 避免库私有格式及 IDE 特性扩大范围 |
| ADR-04 后台运行 | 有后台逻辑的插件惰性独立进程，共享可信 UI renderer | 改善服务故障归属；UI 仍共享故障域，进程有开销 |
| ADR-05 数据 | 宿主元数据与每插件业务库分开，资源只引用 | 减少业务耦合；跨插件不能依赖跨库事务 |
| ADR-06 工作区 | 多套保存/复制/删除，业务数据不随之复制或删除 | 防止“工作区=项目/数据分区”的隐含混淆 |
| ADR-07 扩展点 | 视图、命令、设置、服务、Job、资源；导航只暴露受控入口 | 补足 Q4，避免插件任意改宿主 UI |
| ADR-08 升级 | 重启生效为基线，不要求热替换；备份+迁移后启用 | 减少运行状态混乱；仍需处理数据回滚 |
| ADR-09 默认插件 | 日程/待办必需；至少一个真实工具＋第二类契约验证 | 明确 M2 最低验收，不假定现有端点格式 |
| ADR-10 生命周期 | macOS 关闭窗口不退出；Cmd+Q 提示后停止应用内工作 | 符合“应用运行期后台”；不承诺退出后续跑 |
| ADR-11 隐私 | 本地优先、默认无遥测、凭据不随布局导出 | 便于个人使用；云同步另行设计 |
| ADR-12 性能 | PRD 的启动/内存/切换数值作为待验证预算 | 没有实测，不作为已达标结论 |

## 3. 待决项与最晚决策时点

| 待决项 | 当前临时处理 | 最晚决定时点 | 改变时主要影响 |
|---|---|---|---|
| Q3：是否开放可信第三方，是否要求不可信沙箱 | 外部安装关闭，只运行第一方/自写 | 外部安装实现前；若 C，运行模型定稿前 | UI/后台边界、授权、包分发、成本 |
| Q4：扩展点范围 | ADR-07 建议，不允许任意改宿主 | SDK 0.1 冻结前 | Manifest、注册接口、导航与测试 |
| 桌面框架和布局库 | 参考 Electron，接口保持可替换 | T00 后进入桌面实现前 | 脚手架、IPC、系统桥、打包 |
| 日程/待办“完整”的具体最低集 | 07 中建议基线 | T10/T11 开工前 | 重复规则、提醒、子任务与视图工作量 |
| Whisper/OCR 实际接口与数量 | 至少一个真实闭环＋另一个扩展验证 | T12 接入前 | 适配器、恢复/取消能力、格式范围 |
| 项目/资料/校园是否前移 M2 | 默认 M3 | 产品 MVP 范围冻结前 | 产品交付量，不改变宿主业务中立性 |
| 性能预算与兼容 OS 范围 | 参考设备和 A 类数值 | M0/M1 实测后、发布承诺前 | 优化和测试矩阵 |

这些待决项都有局部门槛，不要求全部解决才可编写文档或实现框架无关模型。若选 C，必须重开信任相关设计，不能把它看成最终发布前的一个开关。

## 4. 调研依据与使用边界

以下仅使用项目官方文档。查阅公开资料不等于安装试用或基准评测；版本、许可和平台支持在锁定依赖时还需核对。引用支持外部事实，不表示官方为本项目架构背书。

<a id="source-S01"></a>
### S01 · VS Code — Extension runtime security

来源：https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security

用于区分扩展进程与权限沙箱：Extension Host 与应用权限相同，支持文件、网络、进程操作。本文不复制其整个分发模式。

<a id="source-S02"></a>
### S02 · Electron — Security

来源：https://www.electronjs.org/docs/latest/tutorial/security

用于 renderer/远端内容、Node 集成、导航和 IPC 来源检查的安全基线。

<a id="source-S03"></a>
### S03 · Electron — Context Isolation

来源：https://www.electronjs.org/docs/latest/tutorial/context-isolation

用于区分 preload 与页面上下文，以及有限 API 桥接；不是插件之间自动隔离。

<a id="source-S04"></a>
### S04 · Electron — Process Sandboxing

来源：https://www.electronjs.org/docs/latest/tutorial/sandbox

用于说明 renderer sandbox 的边界及 preload 暴露能力的风险。

<a id="source-S05"></a>
### S05 · Node.js — VM

来源：https://nodejs.org/api/vm.html

官方明确 `node:vm` 不是安全机制，不能当作运行不可信插件的沙箱方案。

<a id="source-S06"></a>
### S06 · Tauri — Capabilities

来源：https://v2.tauri.app/security/capabilities/

用于解释前端能力限制以及不能防御恶意 Rust/错误 scope/供应链攻击等边界。

<a id="source-S07"></a>
### S07 · JupyterLab — Develop Extensions

来源：https://jupyterlab.readthedocs.io/en/stable/extension/extension_dev.html

用于参考插件服务的 requires、optional、provides 和生命周期划分。

<a id="source-S08"></a>
### S08 · Dockview — Introduction

来源：https://dockview.dev/docs/overview/introduction/

用于核查 Dockview/Gridview/Splitview 的区分，Gridview 不带标签。

<a id="source-S09"></a>
### S09 · Dockview — Gridview Overview

来源：https://dockview.dev/docs/other/gridview/overview/

用于确认嵌套 Splitview 构成 Gridview 的候选实现思路。

<a id="source-S10"></a>
### S10 · Dockview — Licensing

来源：https://dockview.dev/docs/overview/licence/

补充：https://dockview.dev/typedocs/

用于核查 MIT 包与 Enterprise 商业包边界，不能据此推断所有高级特性都可免费复用。

<a id="source-S11"></a>
### S11 · Electron — Process Model

来源：https://www.electronjs.org/docs/latest/tutorial/process-model

用于参考主进程、renderer 与辅助进程职责。

<a id="source-S12"></a>
### S12 · Electron — utilityProcess

来源：https://www.electronjs.org/docs/latest/api/utility-process

用于后台进程候选；该机制有 Node.js 集成，不被本文视为不可信代码安全边界。

<a id="source-S13"></a>
### S13 · Tauri — What is Tauri?

来源：https://v2.tauri.app/start/

用于平台覆盖与替代技术路线；不表示动态业务插件和移动复用已经自动解决。

<a id="source-S14"></a>
### S14 · Electron — safeStorage

来源：https://www.electronjs.org/docs/latest/api/safe-storage

用于各平台凭据保护语义差异；实现时优先核查当时支持的异步接口，不固化已弃用 API。

<a id="source-S15"></a>
### S15 · Electron — Inter-Process Communication

来源：https://www.electronjs.org/docs/latest/tutorial/ipc

用于主进程/renderer 的有限桥接设计，避免暴露完整 IPC 发送接口。

<a id="source-S16"></a>
### S16 · SQLite — Online Backup API

来源：https://www.sqlite.org/backup.html

用于在线一致性快照与备份流程参考。

<a id="source-S17"></a>
### S17 · SQLite — Write-Ahead Logging

来源：https://www.sqlite.org/wal.html

用于事务/WAL/检查点与备份文件边界；SQLite 版本与已知问题需在实现时核对。

<a id="source-S18"></a>
### S18 · Playwright — Electron

来源：https://playwright.dev/docs/api/class-electron

用于 E2E 测试候选；官方仍标为实验支持，不能替代原生能力的人工检查。

## 5. 变更规则

每项新增决定记录日期、来源、状态、影响文档与对应验收 ID。C 改动需要用户明确授权；A 可在评审后修改；O 达到决策门槛前不能以工程默认值隐式冻结。

文档合并或复制到代码仓库后，应以同一版本控制源更新，不同时维护两份相互分叉的 PRD。
