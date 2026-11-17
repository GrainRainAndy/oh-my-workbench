# M0/M1 分阶段实施计划

> 执行状态：T00进行中；Node通用运行试验已执行，依赖访问已获授权，桌面框架验证推进中；其余任务未开始。实施时使用 executing-plans，或用户明确选择后使用 subagent-driven-development；生产框架待T00证据冻结后推进，不能跳过技术验证。

**Goal:** 用公开 SDK 验证核心，再交付可日常使用的业务插件。
**Architecture:** 见整体架构；宿主业务中立、视图/后台分离、显式服务、私有业务数据。
**Tech Stack:** Electron/TypeScript/React/SQLite 为待验证提案；Vitest/Playwright 为候选，不提前锁未经检查版本。
**Spec:** [PRD](../product/prd.md)、[架构](../architecture/overview.md)、[SDK](../architecture/sdk.md)、[矩阵](../qa/traceability.md)。

## 全局约束

用户已确认方向与首版Q3；先执行T00，框架达门槛后依据证据冻结，M1业务最低集开工前冻结。references只读；Demo不作生产架构。无宿主业务模型/私有插件依赖/隐式任务重放。未执行测试不记通过。当前无Git与构建环境，以下路径/命令是未来创建后的验证入口，不是现成工具。

## 建议文件边界

apps/desktop/src/{main,preload,renderer}/：桌面适配、最小桥接、Shell；packages/contracts/src/：纯JSON模型/schema/RPC；packages/sdk/src/{ui,backend}/：公开客户端；packages/host-core/src/{workspace,runtime,services,jobs,persistence}/：通用逻辑；packages/ui-kit/src/：可选组件。plugins/{fixture-view,fixture-job,fixture-service,calendar,todo,whisper,ocr}/：公开接口消费者；tests/{unit,integration,e2e,performance}/：验证。

先用内部模块分界，不为每模块建立发布包。每任务按“写关键失败测试→确认失败→最小实现→相关测试通过→评审/独立提交”执行；只有初始化Git后才执行提交。依赖锁、脚本与类型检查放入第一次需要它们的任务。

## M0 插件核心

### T00 前置技术验证

- [ ] 在 spikes/runtime-electron、spikes/runtime-tauri 与 spikes/layout 创建一次性验证；按 S01–S06 采集证据。
- [ ] 产出 docs/qa/evidence/runtime-comparison.md 与已冻结 ADR；若信任选C，停止可信运行计划重设边界。

独立验收：相同负载证据、明确框架/信任/布局决定，无“测试待做但已定案”。

### T01 契约与工作区模型

Files：packages/contracts/src/{manifest,workspace,rpc}.ts、packages/host-core/src/workspace/{operations,repository}.ts、tests/unit/workspace.test.ts。
接口：validateManifest(unknown)→Manifest；validateWorkspace(unknown)→Workspace；splitPane(snapshot,paneId,axis)、closePane、swapPanes、duplicateWorkspace→Workspace；save(snapshot,expectedRevision)→Promise<Workspace>。

- [ ] 测试非法比例/重复ID/悬挂引用/越界路径/深度上限拒绝，1000个布局操作序列保持不变量；复制全新ID但资源相同；删除不调用业务删除。
- [ ] 创建构建/类型/依赖边界配置后运行 pnpm exec vitest run tests/unit/workspace.test.ts 确认失败。
- [ ] 实现纯模型、语义验证与revision存储接口；与SDK字段一致。
- [ ] 同命令通过、pnpm exec tsc --noEmit通过；记录独立模型验收。

### T02 桌面 Shell 与视图实例

Files：apps/desktop/src/renderer/{Shell,PaneFrame,WorkspaceSwitcher}.tsx、packages/sdk/src/ui/index.ts、plugins/fixture-view/、tests/e2e/workspaces.spec.ts。
接口：ViewFactory.mount、ViewController、prepareClose/migrateConfig/migrateState（见SDK）；LayoutAdapter只读写自有模型。

- [ ] 用两个同类实例验证独立配置、主题、键盘切分/换视图/切区、放大还原；草稿保存失败阻止关闭，最后窗格空入口。
- [ ] pnpm exec playwright test tests/e2e/workspaces.spec.ts 先失败再实现，最终通过；100次挂载/卸载订阅归零。
- [ ] 验证重启恢复与缺插件占位，记录实际适配器与CSS隔离限制。

### T03 注册、运行器与服务

Files：packages/host-core/src/runtime/{registry,supervisor}.ts、services/{registry,rpc}.ts、apps/desktop/src/main/plugin-host.ts、plugins/fixture-service/、tests/integration/runtime.test.ts。
接口：discover(root)只读Manifest；activate(pluginId)→Promise<RuntimeGeneration>；deactivate(pluginId,reason)→Promise<void>；resolve/call/subscribe按SDK。

- [ ] 测扫描零执行、并发只激活一次、必需缺失/环失败、可选缺失降级、多提供者绑定、半注册回滚。
- [ ] pnpm exec vitest run tests/integration/runtime.test.ts 先失败再实现监督与RPC；校验输入输出与通道身份。
- [ ] 杀后台验证宿主继续、旧句柄失效、重启节流；快照/订阅竞态与revision跳跃重读；不得自动重试副作用。

### T04 系统能力与桌面生命周期

Files：apps/desktop/src/main/{lifecycle,platform}.ts、preload/bridge.ts、tests/integration/platform.test.ts、tests/e2e/lifecycle.spec.ts。
接口：CapabilityApi.status/invoke、showWorkspaceWindow()、prepareShutdown()；文件grant、凭据handle不泄露UI。

- [ ] 写伪造caller、跨frame、路径逃逸、URL scheme/重定向、凭据日志负例；pnpm exec vitest run tests/integration/platform.test.ts先失败再通过。
- [ ] 实现文件/网络/通知/凭据/剪贴板/外开最小集合；process.run仅有真实消费者时增加，不暴露通用shell。
- [ ] 真机发布包验证登录、Dock/菜单/热键、关窗无窗任务、退出、睡眠唤醒、通知拒绝；原生人工结果与自动化分别记录。

### T05 Job与无视图后台

Files：packages/host-core/src/jobs/{registry,state-machine,reconcile}.ts、plugins/fixture-job/、apps/desktop/src/renderer/JobCenter.tsx、tests/integration/jobs.test.ts。
接口：submit/get/cancel/watch、execute/reconcile/requestCancel、checkpoint，具体语义见SDK。

- [ ] 测同键同输入返回原记录、不同输入冲突；关窗/切区任务继续；取消与完成竞态；无query/cancel能力正确显示限制。
- [ ] pnpm exec vitest run tests/integration/jobs.test.ts先失败再实现持久日志和任务中心。
- [ ] 在远端接受/externalId提交之间强杀；恢复unknown且请求数不增加；终态不可倒退。

### T06 迁移、管理与恢复

Files：packages/host-core/src/persistence/{backup,migrate,recovery}.ts、runtime/update.ts、apps/desktop/src/renderer/PluginManager.tsx、tests/integration/recovery.test.ts。
接口：createBackup(options)→BackupManifest、restoreBackup(id)→Promise<void>；prepareData/migrate与升级journal。

- [ ] 测磁盘满、snapshot失败、未知版本、迁移中断/切换中断、卸载保留数据、布局导入不执行；运行 pnpm exec vitest run tests/integration/recovery.test.ts先失败再通过。
- [ ] 实现事务/快照/迁移副本/重启升级；B仅在已批准时补版本信任/包校验，不默默开放安装。
- [ ] 安全启动不执行任何业务插件；强杀恢复已确认保存状态；备份实际恢复后业务计数一致。

### T07 M0 验收

- [ ] 新增第三个独立fixture不修改宿主业务代码；依赖检查阻止插件import宿主私有实现。
- [ ] pnpm exec vitest run、pnpm exec tsc --noEmit、pnpm exec playwright test及边界检查通过；执行R01–R15/R19适用项与R18基础桌面检查。
- [ ] 完成性能与长运行证据、开发预览安装包、SDK使用例与已知限制；不把三个fixture称产品MVP。

## M1 产品 MVP

### T08 独立日程

Files：plugins/calendar/src/{domain,repository,service,views,reminders}.ts、tests/unit/calendar.test.ts、tests/e2e/calendar.spec.ts。

- [ ] 冻结重复规则最低集、时间意图、提醒漏发策略；宿主仅消费通用API。
- [ ] pnpm exec vitest run tests/unit/calendar.test.ts覆盖全天/跨日/时区/DST/月末/单次例外及持久化；失败后实现插件业务。
- [ ] pnpm exec playwright test tests/e2e/calendar.spec.ts验证无账户CRUD、多视图同步、关窗提醒、拒绝通知、重启去重与离线。

### T09 独立待办

Files：plugins/todo/src/{domain,repository,service,views}.ts、tests/unit/todo.test.ts、tests/e2e/todo.spec.ts。

- [ ] 冻结清单/日期/提醒基线，子任务和重复不默认扩入。
- [ ] pnpm exec vitest run tests/unit/todo.test.ts先失败再实现CRUD、排序、归档、完成恢复、无时间日期；清单移动不复制事项。
- [ ] pnpm exec playwright test tests/e2e/todo.spec.ts通过，无Reminders/日程依赖仍完整可用。

### T10 真实本地工具

Files：plugins/whisper/src/{adapter,service,view}.ts或ocr对应目录、tests/integration/tool-adapters.test.ts、tests/e2e/tools.spec.ts。

- [ ] 获取实际接口/端点/认证/格式；选一个真实服务，另一个用不同能力契约验证，不假定统一HTTP接口。
- [ ] pnpm exec vitest run tests/integration/tool-adapters.test.ts先失败再实现；覆盖超时、认证错、无query/cancel、输出缺字段。
- [ ] 脱敏文件真实输入→关闭视图→任务中心找回→结果导出；记录后端版本与请求证据，不用固定结果充数。

### T11 产品发布

- [ ] 适用矩阵全部执行；pnpm exec vitest run、类型检查、边界检查、E2E通过，原生人工检查无阻断项。
- [ ] 出具安装包/签名公证状态/支持OS与CPU架构/许可证清单/备份恢复指南/已知限制；硬件与OS最低版本在锁依赖和发布前确认。
- [ ] 默认工作区由插件贡献组成，无业务宿主特权。M1后再为项目/校园/资料等单独立项。

依赖：T00→T01；T02/T03依赖契约；T04依赖运行通道；T05依赖持久日志与服务；T06整合迁移与管理；T07通过才进入T08–T10；最后T11。可独立评审不等于无依赖；不擅自并行改共享契约。

重点复核：副作用重复(T05)、工作区删除误删业务(T01/T06)、草稿关闭丢失(T02/T04)、迁移回滚损坏(T06)、共享UI故障宣称过度(T03/T07)。测试证据保留构建号、环境、需求ID与失败记录。
