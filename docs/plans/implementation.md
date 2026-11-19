# M0/M1 分阶段实施计划

## 当前实施状态

M0 已有可运行的 macOS Apple Silicon 预览包。桌面端采用 Electron、React、TypeScript 与 SQLite。M1 首个本地工具已选定 Whisper 语音转写。完整产品验收仍以 T07 通过后启动 T08–T10 为序。

| 任务 | 已有证据 | 待验收重点 |
|---|---|---|
| T00、T07 技术与整体验证 | 包内启动、30 次启动与 100 次切区、八窗格拖动与三后台混合负载、无窗任务采样、30 分钟空闲 CPU/RSS、2 小时交替开关窗（25/25 个样本） | 实际睡眠唤醒及辅助技术手测；注入 resume 已验证任务中心重读进度 |
| T01、T02 工作区与视图 | 多实例、递归布局、显式与自动保存、渲染进程恢复、缺失插件占位、切换及替换前草稿预检 | 已验证草稿阻止重启、再次退出重新确认后台任务；系统级交互仍纳入原生手测 |
| T03、T04 运行器与桌面 | 版本化服务、后台进程更替的通知隔离、关窗后任务继续、从配色文件按钮到后台的单次只读委托 | 已验证文件模式位拒绝和跨进程热键冲突；原生文件选择与隐私授权、实际登录及实体按键唤窗待手测 |
| T05、T06 任务与恢复 | 取消确认、持久化进度、未知结果保留、宿主及插件数据库备份与实际恢复、旧版及未来版本插件库往返恢复；从插件管理页升级、取消、失败定位快照及重试；副本迁移中强杀与恢复指针写入 ENOSPC；有界卷写满后的保存、备份与迁移重试 | 手动备份回执和升级失败入口均已核对 Finder 实际选中路径；原生取消与确认升级均已验证，升级后重新打开工作区并保留旧库原件 |
| T08–T11 产品与发布 | 已确认 M1 方向，当前构建内含验证插件 | 独立日程、待办、真实 Whisper 转写，以及发布形态验收 |

最近验证的 macOS arm64 预览包为 `release/macos-arm64-pdyPsG/Oh My Workbench.app`，已验证紧凑窗口下从首次 Tab 到创建工作区并载入第一个插件视图的键盘流程。窗格内容滚动时标题栏保持可操作；包内验证了八窗格的左右及嵌套上下拖动、实时比例提示及单次持久化。

当前分支为 `spike/m0-runtime`。根目录可执行 `npm run build`、`npm test`、`npm run test:desktop` 和 `npm run package:mac`。任务清单内的 pnpm、Vitest 与 Playwright 命令保留为原计划记录。实际执行结果见[运行验证记录](../qa/evidence/runtime-progress.md)。

## 全局约束

公开 SDK 与序列化数据构成插件协作边界。宿主只管理呈现、运行器与通用服务。变更须对照 [PRD](../product/prd.md)、[架构](../architecture/overview.md)、[SDK](../architecture/sdk.md) 和[验证矩阵](../qa/traceability.md)。references 永久只读，M1 业务最低集在开工前冻结。

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
- [x] 安全启动暂停业务插件执行；渲染进程异常退出后恢复已确认保存状态；实际备份恢复后业务计数一致。见 [Electron 验证记录](../qa/evidence/runtime-progress.md)。

### T07 M0 验收

- [x] 新增第三个独立fixture不修改宿主业务代码；依赖检查阻止插件import宿主私有实现。
- [x] 自动化回归：当前 npm test 通过 48 项测试、TypeScript 类型检查与插件依赖边界检查；npm run test:desktop 通过 18 个 Electron 场景。实际入口及工具见本页「当前实施状态」。
- [x] 开发预览包、SDK 使用例、性能原始数据与已知限制已留档。候选包 macos-arm64-e3K1Da 对应本地检查点 3bb6841；完整两小时开关窗记录见[验收矩阵](../qa/traceability.md)，来自此前构建。
- [ ] 完成 R01–R15/R19 适用项及 R18 原生验收。当前开放项含原生选择器和授权、实际登录启动、实体快捷键唤窗、物理睡眠唤醒、辅助技术操作、升级确认框及访达定位。逐项证据和限制见[运行记录](../qa/evidence/runtime-progress.md)。
- [ ] 汇总上述结果并作 T07 结论，之后按依赖顺序进入产品阶段。

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

当前代码进度：T01 已有 LayoutNode 与结构校验；S05 模型操作及 Electron 实验窗口已执行首轮回归，详见 [验证记录](../qa/evidence/runtime-progress.md)。T01 的 Workspace、持久化 revision 与完整任务验收仍待实现。

T01/T02 增量已建立项目根目录 npm 锁与 Electron、React、SQLite 桌面入口。运行 npm start 打开工作台，npm test 运行模型与运行器回归，npm run test:desktop 打开隔离的临时库做窗口检查。已接入命名工作区新建与切换、拆分与比例调整、视图配置按 revision 保存、插件缺失占位。插件目录当前由构建扫描，动态包注册、后台 SDK、Job 中心、完整工作区管理与 M1 插件仍开放。窗口证据见 [QA](../qa/evidence/runtime-progress.md)。

T01/T02 已增加新建、复制、重命名及确认删除的界面和 SQLite revision 条件删除。复制/删除与完整进程重开已执行；重命名尚无专项窗口用例。剩余任务以各 T 项验收条件为准。

T03/T06 首个 UI 插件管理路径已接入桌面入口，启停偏好独立持久化，停用后原位恢复已有双进程窗口回归。后台 generation、服务路由与 Job 生命周期仍按 T03/T05 推进。

T03 已接入首个正式 utilityProcess 服务调用，验证配色板消费独立 CSS 服务、两视图共享后台、停用降级与重新激活。当前精确版本匹配；多提供者绑定、服务事件订阅和后台依赖图仍待实现。

T05 已开始。正式入口具有 SQLite 任务登记、按事件更新的任务中心、导出结果与重启恢复用例。仍需区分已知失败和未知结果、增加对账及可确认取消的处理器，并验证真实无窗长任务。

T05 已验证派发前失败提示与 SQLite 任务登记进程 SIGKILL 恢复。真实远端对账、取消确认和无窗长任务仍开放。

T02 已接入可键盘访问的窗格操作菜单，支持选择替换视图及交换目标；放大还原为临时呈现状态。双实例真实窗口已检查还原尺寸、配置顺序、替换实例标识及保存边界。

T02/R05 已接入主题选择和自定义 UI 主题变量，双窗口进程回归覆盖手动明暗切换与重启保留。辅助技术和系统外观切换仍待原生手测。

T04 主入口创建默认菜单栏图标及打开、退出命令；活跃任务退出时弹出原生确认，识别登录启动以跳过首次显示。T05 正式宿主无窗任务已通过独立进程桌面回归，详见验证记录。发布包原生行为、登录项配置和热键仍开放。

T01/T07 增加 npm run typecheck、npm run check:boundaries，并接入 npm test。当前只对 packages 的 TypeScript 文件启用严格检查；桌面 JSX/CJS 尚未纳入该类型检查范围。

T07 已生成并实测本机 macOS arm64 开发预览包，复现命令 npm run package:mac，然后 node tests/e2e/packaged.mjs "<输出的 .app 路径>"。T07 其余门槛仍开放。

T06 首个宿主备份入口已实现，插件管理页可创建本机备份与定位副本。当前验证包含工作区、插件启停和任务三个库，以及部分失败时保留原件。恢复到活动数据路径、迁移和业务插件备份仍待完成。

T06 已接入备份记录和确认恢复，宿主三个库通过同一目录指针选择，恢复前保留当前快照。有运行中任务时拒绝切换。业务数据库的迁移与插件更新协议仍开放。

T01/T02 已补齐 R01 最近工作区恢复和删除最后工作区时建立默认空区。最近选择为本机导航偏好，恢复旧备份后按存在性回退。

T05 正式宿主已支持声明式协作取消、取消待确认状态与成功竞态。无取消能力任务在界面显示限制。远端 externalId、checkpoint 与真实对账仍待完成。

T02/T06 已验证不兼容实例占位且原始快照保留，T03 已增加损坏清单与重复标识诊断。显式配置/恢复状态迁移及业务数据迁移仍开放。

T02 实例配置更新已获得并发提交与过期 revision 的真实窗口回归。插件的 updateConfig Promise 会在保存失败时拒绝，当前配色板在窗格中显示失败提示。

T07 的第三个独立验证插件与插件依赖边界检查已有实测；删除工作区后业务数据保留已覆盖正式窗口与跨进程恢复。其余 M0 门槛仍按上文。

T03 已打通公开服务快照失效通知，正式双窗格实测同步；插件可按服务版本订阅并在卸载时释放监听。完整按世代绑定的事件载荷与 revision 流仍待验收。

S04/T07 增加发布构建的 30 次新进程启动与 100 次暖切区基线；测量口径、首次离群样本及原始数据见 QA 记录。当前 8 区各 1 个视图，完整混合负载与长运行门槛仍开放。

T02 密集布局补充包内 E2E：node tests/e2e/packaged.mjs "<.app 路径>" --dense，检查八个同时可见的插件实例、紧凑工具栏几何与键盘操作。

R15/T06 已接入工作区菜单的布局导出与导入，首次欢迎界面也支持导入。导入生成独立记录，留在当前页面，用户从侧栏主动打开。此文件格式与完整备份各自版本化。

T06 已覆盖自声明单 SQLite 插件业务库快照与恢复，计数器通过真实窗口数值回退验证，宿主 v1 历史备份兼容。多文件迁移与升级中断仍开放。

T06 已增加安全启动与正常模式切回入口，测试覆盖实际进程的 --safe-mode 启动隔离、工作区恢复和插件停用操作。损坏宿主数据库的启动恢复仍待单独验证。

T04/D09 新增可关闭菜单栏、录制/清除唤出快捷键、登录自启开关。机器相关偏好单独存储，注册失败保留旧绑定。登录项发布形态和真实键盘唤出仍待原生验收。

T03 已实现必需服务依赖图、传递阻断、可选服务降级与恢复。多提供者显式绑定仍开放。依赖状态只影响运行资格，保留用户启停偏好。

T02 已接入按实例保存的视图恢复状态，配色板的当前选中色块验证状态隔离和重启恢复。

T02/T04 已覆盖工作区名称草稿及有待确认保存时的原生窗口关闭保护，通用插件草稿处置仍开放。

T06 启动恢复已接入原生对话框。打不开宿主工作库时，用户可退出、定位目录，或明确选择最近通过文件校验的备份，提示跳过的损坏记录数；恢复副本通过快照与工作区契约校验后才切换。未知业务 schema 的迁移与升级中断验收仍开放。

T03/T07 已验证插件模块首次加载失败时的窗格占位、重挂载和窗口重新载入恢复路径。

T07 已验证共享渲染进程意外退出后的手动恢复入口与双窗格持久化恢复。未确认的内存编辑不在此恢复保证内。

T02 当前窗格可通过标题按钮明确选择，保存实例配置或恢复状态也同步更新 activePaneId。焦点标识由工作区快照恢复。

T05 已接入处理器进度、事务持久化和任务中心进度条；延迟处理器确认的原生集成测试覆盖取消请求的中间状态。

T01/T02 工作区操作菜单与 ⌘S 已接入显式保存，沿用自动保存的 SQLite 修订校验与关窗保护。

T06 已覆盖工作区保存遇到 SQLITE_FULL 时的原件保留、用户错误提示与恢复后重试。备份目录及业务库的空间耗尽仍待验证。

T03 已支持消费方通过 manifest 显式绑定服务提供者，已用两个同版本实现验证任务派发与指定后台执行。

T06 已验证恢复指针原子替换前后进程被强杀时的宿主与插件跨库一致性。业务 schema 迁移仍单独验收。

T07 已整理可运行的 SDK 使用例，覆盖独立视图状态、后台服务、共享业务库和 Job。CSS 验证插件的实际后台入口已纳入 TypeScript 检查。

T03/T05 已通过 utilityProcess 实际异常退出后的任务对账、同键去重与下一显式请求重新激活验证。

S04/T07 的八个可见视图与三个独立后台混合负载已有发布构建单点实测；持续运行与唤醒仍单独验收。

S04 无窗口带任务档已完成发布构建单点采样，覆盖计时等待中的任务及零窗口提交结果。

T06 已验证恢复提交阶段 ENOSPC 后回收未启用的副本、保留原工作区与保护快照，并可从同一确认界面重试。

T06 已在插件业务库结构迁移事务中、提交后切换前分别强杀进程，验证旧库保留和快照重试。桌面升级入口与异常退出后的未启用副本回收仍待实施。

T06 已接入启动时回收带标记的中断副本，真实桌面启动恢复和两个强杀阶段已验证；无标记的历史副本保留。

T04 文件能力已实现内部只读会话授权、撤销和交付前复核，并接入布局导入。插件后台身份绑定和显式委托待验收。

T06 的计数器迁移已移入插件自有模块。强杀与重试覆盖该实现，桌面宿主在升级副本上调度迁移、复核结果并切换的入口仍待接入。

T06 注册表现已按清单发现迁移入口；强杀与重试测试从注册表取入口。桌面升级确认、迁移调度和切换校验仍待接入。

T06 升级副本的 commit 已接入宿主侧目标版本与完整性校验，成功重试及版本未变时拒绝切换已有进程级回归。桌面升级入口仍待接入。

T06 插件管理页现可检查单库版本，确认后先备份，再在独立进程内迁移副本；通过版本与完整性复核后切换并重载。安全模式与不可用插件不提供升级。当前验证覆盖一个可信内置插件。

R13 跨进程冲突处理已改用 macOS 原生独占注册，原生对照返回 eventHotKeyExistsErr 的场景已进入常规桌面回归。物理按键的系统级唤回、登录与唤醒仍单独验收。

T03/T07 已接入后台 activate 与 onAppStart，登录原因注入场景验证无窗启动；常驻与按需进程在缩短的无窗空闲期限下已验证。原生登录和睡眠唤醒仍需单独验收。

T07 插件管理现从 manifest 展示常驻用途与关闭窗口后的行为，开关关联用途和安全模式说明。登录启动场景增加在空工作区列表中从界面停用、重新启用后台并核对进程的检查。

T07 常驻与按需后台已按生产 60 秒空闲期限完成真实进程对照，记录见 runtime-progress。系统睡眠唤醒和实际登录生命周期仍独立验收。

T06 备份开始时目标卷已满的真实故障场景已通过，覆盖原快照保留、清理及释放空间后重试。SQLite 复制过程中空间耗尽也已用有界 HFS+ 映像实测通过。

T07 已验证 powerMonitor.resume 后任务中心重读持久进度，未重发任务。该路径使用注入的唤醒事件，实际系统睡眠唤醒保留为独立门槛。
