# 个人插件化工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先交付可验证的工作区与插件核心，再以独立日程、待办和真实本地工具完成产品 MVP。

**Architecture:** 轻量宿主、工作区中心、插件视图与后台分离；通过显式版本化服务协作，业务数据归插件。Q3 未决时仅运行第一方/自写可信插件。

**Tech Stack:** A 类参考为 Electron、TypeScript、React、SQLite；布局组件经 M0 验证选择。版本需在执行时核对并锁定，不写未经核实的 latest。Vitest 为单元/集成测试候选，Playwright Electron 为 UI 自动化候选。

**Spec:** `01_PRD.md`、`02_PLUGIN_TRUST.md`、`03_ARCHITECTURE.md`、`04_PLUGIN_CONTRACT.md`、`06_ACCEPTANCE_TESTS.md`、`07_PLUGIN_BASELINES.md`。

**执行状态：**本计划未执行；以下路径是建议新仓库结构，不表示已存在的应用代码。命令在完成对应脚手架与依赖安装后使用，其预期结果不是本次已验证结果。

## Global Constraints

- 工作区中心；支持多套保存；宿主不提供单窗格标签组。
- 插件业务逻辑与视图生命周期分离；不承诺应用退出后继续执行。
- 第一方插件不得 import 宿主内部实现；不把业务表放进 host DB。
- 默认外部插件安装关闭；Q3 变更必须更新 ADR 和安全测试。
- 复制/删除工作区不能复制/删除业务对象或取消 Job。
- 用户确认 C 优先于建议 A；开始业务插件前冻结其最低范围。
- 持久化与跨边界结构要有 schema version；代码回滚不替代数据恢复。

## Review Focus

1. **重复提交窗口**：远端接受后、本地 externalId 未提交时崩溃，不重复执行副作用（T07）。
2. **数据生命周期混淆**：删除工作区/卸载插件不应删除用户业务数据（T02/T09）。
3. **权限误表述**：可信 Node 插件不被描述为强沙箱；外部网页不能调用桥接（T06/T13）。
4. **隐藏视图工作丢失**：切换工作区前保存草稿，后台继续，视图回来可重连（T03/T07/T10）。
5. **迁移回滚错误**：更新失败保留旧数据，新 schema 不被旧代码直接打开（T08）。

## 1. 建议仓库边界

```text
apps/desktop/src/
  main/                  # 应用启动、窗口、平台适配、IPC 入口
  preload/               # 细粒度桥接，不暴露全量 IPC
  renderer/              # Shell、PaneFrame、工作区选择器
packages/
  contracts/             # manifest/workspace schema、协议类型
  workspace/             # 纯布局操作、序列化、实例身份
  plugin-runtime/        # registry、依赖解析、supervisor
  services/              # RPC、service registry、调用追踪
  jobs/                  # Job 状态机、幂等、取消、恢复
  persistence/           # 宿主 DB、快照、迁移协调
  platform/              # 文件、凭据、通知等接口与适配
  ui-kit/                # 令牌与通用组件
  sdk/                   # 插件公开入口，不导出宿主私有实现
plugins/
  fixture-view/ fixture-job/ fixture-service/
  calendar/ todo/ whisper/ ocr/
tests/
  unit/ integration/ e2e/ fixtures/ performance/
docs/                    # 本文档与后续 ADR
```

依赖方向：应用依赖核心包与 SDK；业务插件只依赖 SDK/UI Kit 及自己的业务依赖；contracts 不依赖 Electron/React；核心不得反向依赖 calendar/todo 等业务包。

## 2. 实施任务

每个任务按“写失败测试 → 确认失败 → 最小实现 → 全部相关测试通过 → 独立提交”执行。单独任务不要求整个产品可用，但要有可核验的边界和输出。

### T00 · 关键架构验证与决策门槛（M0）

**Files:** `docs/adr/001-runtime.md`、`docs/adr/002-layout.md`、`tests/fixtures/layout-12panes.json`。

**Consumes:** PRD F01–F07、Q3 专题和 N01/N02 预算。

**Produces:** 已选 RuntimeAdapter/LayoutAdapter 方案；保留与否的证据，不把试验代码直接并入产品。

- [ ] 建立同一 12 窗格样本，验证无标签、切分、移动、约束尺寸和序列化往返。
- [ ] 验证本地预构建 UI 模块与后台模块在发布构建中能被加载，远端脚本被拒绝。
- [ ] 记录 Electron/Tauri 取舍、真实资源消耗和未解决风险；不使用不同负载的数字直接比较。
- [ ] 明确 Q3 当前策略和适用承诺；若选 C，停止可信共享 UI 方案扩展，另写受限运行器方案。
- [ ] 确认技术路线后提交 ADR；未决时只推进框架无关的契约和纯模型。

### T01 · 契约、构建与依赖边界

**Files:** `package.json`、`pnpm-workspace.yaml`、`packages/contracts/src/{manifest,workspace,api}.ts`、`tests/unit/manifest.test.ts`、`eslint.config.js`。

**Consumes:** 本包 `contracts/`。

**Produces:** `validateManifest(input: unknown): PluginManifest`、`validateWorkspace(input: unknown): WorkspaceSnapshot`、公开 SDK 类型。

- [ ] 写断言：合法示例通过；入口 `../outside.js`、重复 contribution、API 不兼容被拒绝；命名空间冲突报准确错误。
- [ ] 执行 `pnpm exec vitest run tests/unit/manifest.test.ts`，确认未实现时失败。
- [ ] 实现结构与语义校验，建立包边界 lint；锁定依赖和运行版本。
- [ ] 运行上述测试、`pnpm exec tsc --noEmit`、lint；确认 contracts 不依赖框架。
- [ ] 提交 `chore: establish contracts and package boundaries`。

### T02 · 工作区纯模型与保存语义

**Files:** `packages/workspace/src/{model,operations,repository}.ts`、`tests/unit/workspace.test.ts`。

**Interfaces:** `splitPane(snapshot, paneId, axis): WorkspaceSnapshot`；`closePane`、`movePane`、`duplicateWorkspace`；Repository 提供 `save(snapshot, expectedRevision)`。

- [ ] 写测试：左右/上下切分、关闭最后一格、无效拖放、复制产生新实例 ID、resource 引用保持、删除不调用业务删除接口。
- [ ] 运行 `pnpm exec vitest run tests/unit/workspace.test.ts` 确认失败。
- [ ] 实现纯函数布局与 revision 检查；比例非法、活动 pane 不存在、重复 ID 必须拒绝。
- [ ] 运行往返与属性测试：1000 个有效操作序列不产生悬挂引用；数据计数不因工作区 CRUD 改变。
- [ ] 提交 `feat: implement workspace model and lifecycle`。

### T03 · Shell、视图挂载与工作区交互

**Files:** `apps/desktop/src/renderer/{Shell,WorkspaceSwitcher,PaneFrame}.tsx`、`packages/workspace/src/layout-adapter.ts`、`plugins/fixture-view/`、`tests/e2e/workspaces.spec.ts`。

**Consumes:** T02；`PluginUiModule`、`ViewFactory`、`ViewController`。

**Produces:** 可配置多工作区 Shell；单窗格单实例、无宿主标签栏；状态保存入口。

- [ ] 写 E2E：创建两工作区、两个同类型视图筛选独立；拖动交换；切换有草稿时能取消；无标签组入口。
- [ ] 运行 `pnpm exec playwright test tests/e2e/workspaces.spec.ts`，确认界面未实现导致失败。
- [ ] 实现布局适配和实例管理；切换前 canClose/snapshot，临时最大化不重写布局；建立默认主题和键盘焦点。
- [ ] 重启后验证视图/配置恢复；小窗口不丢窗格；100次挂载/卸载后订阅计数归零。
- [ ] 提交 `feat: add workspace shell and view lifecycle`。

### T04 · 插件注册、依赖与后台运行器

**Files:** `packages/plugin-runtime/src/{registry,dependencies,supervisor}.ts`、`apps/desktop/src/main/plugin-host.ts`、`tests/integration/plugin-runtime.test.ts`。

**Interfaces:** `discoverPlugins(root)` 只读 Manifest；`activate(pluginId)`、`deactivate(pluginId, reason)`、`getStatus(pluginId)`。

- [ ] 写测试：扫描不执行代码；同时激活只调用一次；必需缺失/依赖环拒绝；可选缺失可用；停用释放注册项。
- [ ] 执行 `pnpm exec vitest run tests/integration/plugin-runtime.test.ts` 确认失败。
- [ ] 实现身份绑定的后台通道和 generation，惰性启动；崩溃不能自动重放业务；重启循环有节流。
- [ ] 注入 activate 中途抛错和子进程退出，验证宿主不退出、贡献回滚、状态可解释。
- [ ] 提交 `feat: supervise plugin lifecycle`。

### T05 · 显式服务接口与可选协作

**Files:** `packages/services/src/{registry,rpc,client}.ts`、`plugins/fixture-service/`、`tests/integration/services.test.ts`。

**Consumes/Produces:** SDK 的 `ServicesApi.resolve`、`ServiceClient.call`、`ServiceCallContext`。

- [ ] 写测试：版本匹配、可选 null、必需失败、多提供者选择、请求取消、提供者重启令旧句柄失效。
- [ ] 运行 `pnpm exec vitest run tests/integration/services.test.ts` 确认失败。
- [ ] 实现输入/输出校验与超时/取消消息；host 注入 caller，不读取业务载荷自称身份。
- [ ] 验证超时后有副作用方法不会被框架自动重试；跨插件授权不隐式扩大。
- [ ] 提交 `feat: add versioned service contracts`。

### T06 · 平台能力、凭据与外部内容防护

**Files:** `packages/platform/src/{broker,files,credentials,notifications,external-open}.ts`、`apps/desktop/src/preload/bridge.ts`、`tests/integration/capabilities.test.ts`。

**Interfaces:** `CapabilityApi.status/invoke`；FileRef、credential handle、实际调用方来源。

- [ ] 写负面测试：拒绝未授予文件、伪造 pluginId、越界路径、未允许 URL scheme、跨域重定向、密钥日志输出。
- [ ] 运行 `pnpm exec vitest run tests/integration/capabilities.test.ts` 确认失败。
- [ ] 实现最小桥接与来源/参数校验，平台缺能力返回 unsupported；不暴露全量 ipcRenderer 或 shell。
- [ ] 用外部内容测试页验证不能调用宿主能力；补人工 OS 通知/文件选择拒绝场景。
- [ ] 提交 `feat: broker platform capabilities`。

### T07 · Job 状态、幂等与视图无关执行

**Files:** `packages/jobs/src/{registry,state-machine,reconcile}.ts`、`plugins/fixture-job/`、`tests/integration/jobs.test.ts`。

**Interfaces:** `JobsApi`、`JobHandler`、`JobExecutionContext`、`JobRecord`。

- [ ] 写测试：同键同输入只提交一次；同键不同输入报冲突；关闭所有视图后继续；取消未确认不显示 cancelled。
- [ ] 运行 `pnpm exec vitest run tests/integration/jobs.test.ts` 确认失败。
- [ ] 实现事务登记、状态更新、订阅与任务中心；为外部服务提供支持/不支持 query/cancel 的适配能力。
- [ ] 在远端接受前后、externalId 写入前后注入中断；验证 unknown 与明确重连，不重复提交。
- [ ] 提交 `feat: track jobs independently of views`。

### T08 · 恢复、备份、迁移和退出流程

**Files:** `packages/persistence/src/{host-db,backup,migrations,recovery}.ts`、`apps/desktop/src/main/shutdown.ts`、`tests/integration/recovery.test.ts`。

**Interfaces:** `createBackup(options): Promise<BackupRecord>`、`restoreBackup(id)`、`prepareShutdown()`。

- [ ] 写测试：已保存工作区强杀后恢复；损坏状态保留原件；缺插件占位；迁移失败不新建空库；磁盘满显示保存失败。
- [ ] 运行 `pnpm exec vitest run tests/integration/recovery.test.ts` 确认失败。
- [ ] 实现一致性快照、迁移前备份、revision 与失败回滚；工作区导入不触发插件安装/代码执行。
- [ ] 验证 Cmd+Q 未完成任务提示、5秒宽限后的 interrupted/unknown，以及关闭窗口仍在应用运行期的语义。
- [ ] 提交 `feat: recover state and protect data during upgrades`。

SQLite 备份应采用能生成一致性快照的方式，并处理 WAL，不直接复制正在写入的单一主文件。[S16][S17]

### T09 · 插件管理、安全模式与诊断

**Files:** `apps/desktop/src/renderer/{PluginManager,Diagnostics,JobCenter}.tsx`、`packages/plugin-runtime/src/install.ts`、`tests/integration/plugin-management.test.ts`。

**Consumes:** T04/T06/T08；信任策略和安装状态分离。

- [ ] 写测试：Q3 未决时外部包不能执行；卸载默认保留数据；停用有 Job 时确认；不兼容包保留可解释失败。
- [ ] 运行 `pnpm exec vitest run tests/integration/plugin-management.test.ts` 确认失败。
- [ ] 实现第一方管理、版本状态、诊断、来源脱敏和安全模式；按 Q3 决定是否启用第三方安装分支。
- [ ] 若开放 B，测试包遍历/超额、升级能力变化再确认、待重启生效和数据回滚；A 模式不伪装已支持安装。
- [ ] 提交 `feat: manage plugin state and recovery diagnostics`。

### T10 · 独立日程插件（M2）

**Files:** `plugins/calendar/src/{domain,repository,service,views,reminders}.ts`、`tests/unit/calendar.test.ts`、`tests/e2e/calendar.spec.ts`。

**Consumes:** SDK，不 import 宿主内部；详细范围见 07。

- [ ] 冻结日程最低范围，再写测试：全天/跨日、创建编辑删除、多个日历、重复单次例外、离线、两个视图同步。
- [ ] 执行 `pnpm exec vitest run tests/unit/calendar.test.ts` 确认失败。
- [ ] 实现本地业务库、日历视图与应用内提醒；相对日期恢复按当前日期计算。
- [ ] 执行 `pnpm exec playwright test tests/e2e/calendar.spec.ts`，验证无需 Apple 账户即可完整管理。
- [ ] 提交 `feat(calendar): provide standalone calendar workflows`。

### T11 · 独立待办插件（M2）

**Files:** `plugins/todo/src/{domain,repository,service,views}.ts`、`tests/unit/todo.test.ts`、`tests/e2e/todo.spec.ts`。

**Consumes:** SDK；不依赖日程内部数据库。

- [ ] 写测试：清单/事项 CRUD、完成与恢复、日期与时间区分、排序筛选、重启恢复、已完成内容不误删。
- [ ] 运行 `pnpm exec vitest run tests/unit/todo.test.ts` 确认失败。
- [ ] 实现 07 中已冻结基线，跨插件动作只用可选公开服务。
- [ ] 执行 `pnpm exec playwright test tests/e2e/todo.spec.ts`，不登录 Reminders 也能完成流程。
- [ ] 提交 `feat(todo): provide standalone task management`。

### T12 · 本地工具适配与真实闭环（M2）

**Files:** `plugins/{whisper,ocr}/src/{adapter,service,view}.ts`、`tests/fixtures/tool-service.ts`、`tests/integration/tool-adapters.test.ts`、`tests/e2e/tools.spec.ts`。

**Consumes:** Job/ResourceRef/Capability SDK；用户实际服务接口在此阶段核对。

- [ ] 为支持异步查询和仅同步返回两类服务写契约测试，不能假设所有 Whisper/OCR 端点相同。
- [ ] 运行 `pnpm exec vitest run tests/integration/tool-adapters.test.ts` 确认失败。
- [ ] 实现一个真实适配器，保留 capability detection；关闭视图后可从 JobCenter 找回结果。
- [ ] 用第二类适配器验证不改宿主即可扩展；真实测试使用脱敏样本并记录服务版本，不只跑 mock。
- [ ] 提交 `feat(tools): integrate local processing services`。

### T13 · 全链路、性能与发布验证

**Files:** `tests/e2e/acceptance.spec.ts`、`tests/performance/workbench.ts`、`scripts/check-dependency-boundaries.mjs`、`docs/release-checklist.md`。

**Consumes:** 06 全部适用验收项。

- [ ] 将需求 ID 关联到测试结果、构建号、环境和证据，不允许只写“测试通过”。
- [ ] 运行 `pnpm exec vitest run`、`pnpm exec playwright test`、类型检查与边界检查；无未解释失败。
- [ ] 在发布构建测量冷启动/工作区切换/内存；性能预算不满足则优化或明确调整 ADR，禁止篡改负载定义。
- [ ] 人工检查原生权限、关闭/退出、屏幕缩放、键盘、通知拒绝、安装/卸载/备份恢复。
- [ ] 生成安装包、版本清单、已知限制与回滚说明；提交 `release: verify product MVP acceptance`。

Playwright 的 Electron 自动化在官方文档中仍标为实验支持，原生对话框需单独 mock/人工覆盖；不能把 E2E 框架通过等同全部系统能力已验证。[S18]

## 3. 依赖顺序与阶段验收

T00 → T01 → T02/T04 → T03/T05 → T06/T07 → T08/T09 → **M1 验收** → T10/T11/T12 → T13 → **M2 验收**。

T10/T11 可在 SDK 稳定后独立推进；T12 与任务恢复紧密相关，应先通过 T07/T08。资料、项目、校园插件按后续规格增加，不把它们的细节预先填进主干核心。

## 4. 本计划的可实施性边界

当前没有现成仓库路径、已有实现或实际服务规范可供检查，所以没有声称某段源码需要修改，也没有虚构可运行的启动命令。进入实施时先冻结 T00 与业务最低范围，再将本计划复制到代码仓库并对齐实际包名。计划中的函数边界与契约一致，具体内部类可以调整，但不能改变 PRD 的生命周期和数据所有权。
