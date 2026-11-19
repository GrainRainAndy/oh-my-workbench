# SDK 0.1 修订方案

## 在当前预览版编写插件

从仓库根目录运行 `npm start`，创建工作区并添加配色板。「生成 CSS」会从视图调用另一个插件的后台；「后台导出」会将任务交给宿主，结果可在任务中心查看。

| 想实现的能力 | 可运行示例 | 接入位置 |
|---|---|---|
| 每个窗格独立保存设置和恢复状态 | [配色板视图](../../plugins/fixture-palette/view.jsx) | 在 `plugins/<目录>/manifest.json` 声明视图类型和版本，`view.jsx` 默认导出 React 组件，通过 props 读取和更新实例数据 |
| 提供无界面的服务 | [CSS 服务清单](../../plugins/fixture-css/manifest.json) 和[处理器](../../plugins/fixture-css/backend.mjs) | 在 services 声明接口、精确版本和参数结果类型，从同目录的 backend.mjs 导出 call |
| 让两个视图共享业务数据 | [计数器后台](../../plugins/fixture-tally/backend.mjs) 和[视图](../../plugins/fixture-tally/view.jsx) | 后台在 context.dataDirectory 中打开私有数据库；视图通过声明的服务调用读写并订阅刷新 |
| 使用其他插件的服务和 Job | [配色板清单](../../plugins/fixture-palette/manifest.json) | usesServices 声明消费接口，jobs 声明执行方法，视图通过 jobs.submit 取得回执 |

新增插件后执行 `npm test` 检查类型和导入边界，再执行 `npm run test:desktop` 检查桌面集成。视图模块随桌面构建编译，新增视图后需重新构建应用。宿主启动时扫描清单，按需加载声明的视图和后台。两个入口的公开类型见 [ViewProps 与 BackendHandler](../../packages/sdk/src/index.ts)。

## 设计基线

以下公共面与生命周期描述保留方案阶段的提案。当前已经接入的能力以可运行示例、公开类型和本文后部的实施记录为准。

## 公共面与版本

Manifest 保留 id/version/hostApi/platforms/entrypoints/activationEvents/requestedCapabilities/dependencies/contributes。运行时贡献必须预先声明；无匹配贡献不能注册。范围采用标准 semver 解析，0.x breaking 提升 minor；插件包版本、Manifest schema、hostApi、RPC、服务、配置/状态与业务库版本分别演进。

Manifest新增backgroundMode=on-demand/resident，默认on-demand；resident只表达应用运行期持续后台需求（例如提醒），必须记录用途。onAppStart只是激活触发，非保活承诺。纯UI插件只能持久化配置/导航；需要业务内容或持久草稿必须提供后台入口，不借宿主配置库存业务正文。

六个扩展点：视图、命令、设置、服务、Job、资源打开器。首版不加任意宿主导航注入、通用全局事件总线、插件间私有存储访问或自动下载依赖。

| 表面 | 契约提案 |
|---|---|
| UI | register(context) 注册 factory；mount(container, ViewContext) 返回 controller，实例分别 dispose |
| 后台 | prepareData(context) 准备迁移/快照接口，activate(context) 注册业务并返回 disposer；同世代一次 |
| 服务 | resolve(id, range, optional)；call(method, params, options)；新增 subscribe(event, params, listener)→Disposable |
| 任务 | submit/get/cancel/watch；handler execute/reconcile/requestCancel |
| 数据 | 私有数据目录只给后台；UI 只能调用服务；snapshot/migration由数据所有者执行 |
| 平台 | status(name)→supported/unsupported/needsAuthorization/denied；受限 invoke(name,input) |
| 资源 | ResourceRef(providerId,kind,resourceId,version,label?)；opener→viewType/config；不携带授权 |

## 补齐旧声明的六项变更

1. ViewInstance 增 configVersion；UI module 可声明 migrateConfig(from,payload) 和 migrateState(from,snapshot)，返回新版本纯 JSON。未知较新版本保留原件+占位，不猜测迁移。迁移在 mount 前，失败不覆盖旧快照。state 建议≤256KiB，控制消息≤1MiB，超额改存插件数据引用。
2. 以 prepareClose(reason)→`ready | blocked(message) | dirty(message, canSave)` 补 canClose；controller 增 saveDraft() 与 discardDraft()，宿主统一保存/放弃/取消。reason 包含 pane-close/replace-view/delete-workspace/workspace-switch/window-close/plugin-disable/app-quit。保存失败不能 dispose；放弃必须显式选择并成功调用discardDraft()清理本实例草稿引用；随后的snapshot不得重新包含已放弃内容。多个视图先全部预检再执行用户选择，全部完成前不dispose；已成功保存的数据不因另一视图取消关闭而回滚。主窗口已经崩溃时无法调用钩子，靠上次持久快照恢复。
3. 服务 contribution 增 events 的参数/载荷 schema。订阅通道绑定 pluginId/generation/subscriptionId，重启后失效；事件含 revision。首版只在运行期有序尽力通知，不承诺持久消息队列；客户端重连重新取快照，发现 revision 跳跃也重读。防止订阅和首次快照竞态：先订阅再读快照，丢弃不大于快照 revision 的事件。两个 UI 实例由此同步业务变化，不通过宿主业务分支广播。
4. JobHandler.reconcile(record) 返回观测：running(progress?,externalId?) / succeeded(resultRefs) / failed(error) / cancelled / unknown。新增 requestCancel(record)→confirmed / requested / unsupported；signal 只处理本世代本地取消，不能替代远端取消协议。无法判定远端停止时保持 cancel_requested/unknown 并显示限制。
5. JobRecord 补 inputDigest、持久输入引用、attemptOf、generation、revision、timestamps、恢复所需 checkpoint；查询/取消按 jobId 找到任务所有者，不需要打开原视图。checkpoint 限制大小且不能夹带凭据；快照不要把本机授权句柄当可迁移凭据。
6. 服务 registry 先从 Manifest 构建提供者索引再惰性激活，否则 onService 存在先注册还是先发现的循环。必需缺失/不兼容/必需依赖环阻断激活；可选缺失返回 null，循环可选解析返回 unavailable；多兼容提供者要明确绑定，不能最后注册覆盖。运行期依赖失效只拒绝相关调用并显示降级；调用方是否继续由其声明必需性处理。

## RPC 与操作边界

请求 protocolVersion/requestId/method/params/deadline/traceId；通道注入 caller+generation+delegatedGrantIds。输入输出都验证；不传 DOM、函数、AbortSignal 或任意原生句柄。超时/取消通知≠副作用回滚；写调用无自动重试。标准错误沿用 INVALID_ARGUMENT/API_INCOMPATIBLE/PERMISSION_DENIED/SERVICE_UNAVAILABLE/TIMEOUT/STATE_INCOMPATIBLE/IDEMPOTENCY_CONFLICT 等，并补 REVISION_CONFLICT。

storage.transaction(fn) 的回调只在后台本地 SDK 执行；UI 不暴露它。后台自有数据库事务与宿主 Job 日志不能合并成跨库事务；通过幂等键、checkpoint、对账协调。大文件以授权引用/受控流处理，不在主进程 JSON 消息复制整个文件。

config 更新流程：schema 校验→controller updateConfig 预应用→宿主 revision 提交→成功通知；提交失败回退旧配置，无法回退时卸载到错误占位，保持旧持久版本。saveState 也使用实例身份和版本控制，过期实例不得覆盖新世代。

## 兼容与验收

发布 SDK 前同步类型、JSON Schema、协议样例和负面测试；用纯 UI、多视图后台 Job、可选服务三种 fixture 独立打包接入。第三个包不得改宿主业务代码。缺插件、停用、未知 state/config、升级失败、多实例与重启退订均须测试。安装更新重启生效；热停用不意味着 JS 模块缓存被卸载，必要时重建 renderer。

迁移上下文：prepareData接收宿主分配的当前运行模式(normal/migration)与dataDirectory。migration模式仅指向候选副本，migrate不得使用硬编码活动目录；不执行activate，不接普通服务/Job。验证后由宿主切换活动指针并启动新normal实例。该约束仍是可信代码契约，不声称阻止恶意代码访问原目录。

工作区仓储当前通过 preload 的 workspaces.remove({id,revision}) 条件删除单条呈现记录。duplicateWorkspace(source,name) 返回 revision 为 0 的新快照；重新分配所有 pane/instance id、深复制配置和资源引用、清空实例恢复状态，再通过已有 save 入口持久化。

当前内置插件的管理桥接为 plugins.list() 与 plugins.setEnabled(id,enabled)。主进程从受信目录的 manifest.json 读取插件和视图元信息，单独持久化启停设置。渲染器只在挂载启用的视图时加载其预构建模块。启停不会写入 Workspace。

随包服务首个可执行子集使用 usesServices 声明消费方的服务 ID 与精确版本，services 声明提供方的方法和输入输出类型。视图通过 services.call(id, version, method, input) 异步调用，宿主从持久化视图实例查找所属插件，并核对双方启用状态、声明与载荷。当前支持 string 与 string[]。共享可信 renderer 内的实例标识用于路由，不提供恶意 UI 隔离。服务按需启动 Electron utilityProcess，视图卸载不停止进程，停用提供方结束当前世代。

T05 首个路径：manifest.jobs 声明 type/title 及执行所需的版本化 service/method。视图通过 jobs.submit(type,key,input) 注册任务，主进程从已存视图解析所有者。当前输入为最多 256 项的连续字符串数组，序列化为 JSON 后最多 65,536 字节。提交时复制输入，派发与摘要均使用此副本。结果为最多 65,536 字节的字符串。SQLite 以 owner/jobType/requestKey 唯一并保存输入摘要；相同键不同输入报冲突。桌面任务中心先订阅变更再读取，视图卸载仅解除 UI 订阅。运行中记录在重新打开日志时进入 unknown，不重新派发。

任务派发前由宿主确认的拒绝记 failed，并记录宿主生成的原因。派发后超时、进程退出、结果不符合契约或插件抛错仍记 unknown；后续需处理器对账才能进一步确认。

共享 UI 的主题通过 CSS 自定义属性提供。插件可使用 --wb-text、--wb-muted、--wb-surface、--wb-line、--wb-accent 和 --wb-on-accent，跟随工作台的 color-scheme。主题偏好独立于工作区快照。

当前可执行视图契约类型见 packages/sdk/src/index.ts，包含配置更新、服务调用和任务回执。npm run typecheck 覆盖 packages 下的 TS 文件。插件边界检查分析 JS/TS 的静态 import/export、require、动态 import 和类型导入；用于代码依赖审查。宿主对 Workspace 的配置、状态和附加字段先校验 JSON 值，再校验布局引用，避免 SQLite 写入时静默丢失值。

T05 协作式取消：任务贡献通过 cancellable:true 声明支持。任务中心的取消请求把状态写为 cancel_requested，向当前处理器传递 AbortSignal。后台完成清理并确认取消时调用 context.confirmCancelled() 结束执行；若处理器正常返回，最终仍为 succeeded。派发前已阻止执行也可确认取消；派发后失联、超时、或取消确认前退出仍恢复 unknown。

视图清单可声明正整数 configVersion、stateVersion，缺省为 1。新实例采用该视图版本。当前没有显式迁移器的版本差异保留原配置和状态，并在原窗格显示不兼容占位。运行时发现会收集无效清单/入口和重复标识诊断；同一标识存在多个有效候选时全部暂缓加载。

可信后台服务处理器的 context.dataDirectory 是按插件标识创建的本机私有数据目录。视图上下文不含该目录；插件自行负责数据库结构和业务更新。当前工作台备份仅涵盖三个宿主库。

视图可用 services.watch(id,version,onInvalidated) 订阅已声明服务的快照变化，返回解除订阅函数。方法声明 invalidates:true 时，成功返回、输出通过校验且提供服务的后台进程仍是当前实例时，宿主通知已挂载的消费者重新读取。通知只含服务标识与版本，既有数据仍由后台服务返回；订阅者应先订阅再获取快照，并丢弃乱序读回。此接口仅覆盖失效通知，不提供持久事件流。

布局交换文件使用 format=workbench.layout、version=1 和 workspace 呈现快照。导出仅投影布局、标题、插件视图身份及配置，状态正文清空，任务和宿主授权字段不在交换契约中。导入校验文件版本、JSON 语义及 5 MiB 限额，重新分配工作区/窗格/实例标识。文件选择由主进程原生对话框完成，渲染器不接收本地文件路径。

仅以单个 SQLite 文件持久化全部私有数据的可信插件，可以用 backupDatabase 声明 dataDirectory 内的库文件名。宿主通过 VACUUM INTO 取得该库的一致快照，对文件校验后记录在 v2 manifest。各库分别一致；没有跨进程全局事务。恢复通过活动目录指针同时选中宿主库和声明的插件库；v1 宿主备份沿用当前插件数据目录。多文件插件需另行提供快照协议。

运行时清单的 usesServices 按 id/version 精确匹配，optional 默认为 false。注册表区分用户启停 enabled 和当前可执行 available。必需依赖缺失、有多个启用提供者或出现跨插件必需环时，dependencyIssue 给出原因并阻断挂载与调用。插件使用自身服务无需激活另一个插件。可选服务缺失保留视图，调用方处理服务不可用错误。

视图实例通过 state 读取恢复状态，通过 updateState(next) 替换当前实例的状态对象。它与 updateConfig 共用串行持久化队列，写入成功后 Promise 才完成。插件拥有字段语义，宿主按 stateVersion 校验兼容性。复制工作区和导出布局均清空恢复状态。

运行器提供 context.reportProgress(percent)，有效值为 0 至 100 的整数。任务记录 progress 初始为 null，递增时与 revision 一起持久化并通知任务中心。进度与完成、取消确认分别处理。

消费方可在 usesServices 的单个依赖中填写 provider（提供插件的 id）。注册表、实际调用和绑定订阅按同一提供者处理。绑定目标关闭时不回退到其他实现。同一个服务 id 与版本仅可声明一次。

服务处理器发现私有数据版本超出支持范围时，可抛出 code 为 DATA_VERSION_UNSUPPORTED 的错误。运行器向调用方传递此固定标识，其他内部异常使用通用错误。视图按本插件语义提供恢复说明。

视图目录的标题、说明及兼容版本取自启动时通过校验的清单。渲染包按插件目录查找已编译的视图模块，实例挂载时才加载。新增视图实现仍需重新构建桌面包。

工作区支持按现有格式导出布局时省略全部视图配置。该选项保留工作区名称、布局、实例标识与版本信息，将每个 config 和 state 写为空对象；普通导出保留 config。凭据应独立存放。

已实现 registerController 的原生关窗预检。注册返回释放函数，按视图实例登记，卸载时释放。prepareClose 同步返回 ready、blocked 或 dirty；当前窗口遇到后两者保留打开并显示插件消息。配色板保留失败的配置选择，提供重试保存与显式放弃操作。

切换到其他工作区、任务中心、插件管理或载入最新工作区时，会以 workspace-switch 预检已注册实例。blocked 会留在当前页面；dirty 进入宿主确认框，可继续编辑、显式放弃，或在所有待处理实例均支持时保存。单个操作失败会保留视图，已成功处理的实例从待处理列表移除。

替换视图时以 replace-view 询问目标实例。关闭窗格用 pane-close，分割和交换用 layout-change；这些结构调整可能重新挂载相邻子树，因此先检查当前挂载实例。布局变更读取已确认的最新修订。

新建或复制并切换工作区在表单提交时预检草稿，删除使用 delete-workspace 原因。取消草稿确认会返回原操作表单，保留输入。通过预检后，复制和删除使用当前已确认的工作区修订。

服务响应超时后宿主仍追踪已派发请求，直到收到后台终态响应或对应进程退出。这段时间继续计入恢复互斥与并发上限，迟到的响应不会自动重放任务。

T04 的宿主实现已有会话内只读文件授权。主进程按调用方持有授权作用域，使用原生选择器返回的位置签发不含路径的随机标识；读取按授权时的文件身份与大小上限复核，交付前检查撤销。关闭作用域后所有标识失效。布局导入使用一次性作用域。此接口目前属于宿主内部，视图通过 services.selectFile(id, version, method, input) 发起一次原生选择。宿主先解析服务依赖，在选择器中显示接收方与 1 MiB 上限，选定后复核视图与服务提供者，再创建该调用的只读委托。取消返回 null。

宿主只读授权支持为单次调用创建独立委托。该委托固定引用一份已授权文件，宿主持有其读取和结束操作。调用结束后关闭委托，其他并行委托仍可使用；撤销原授权会阻止所有派生委托交付读取结果。宿主可在派发服务时附加该委托。对应后台调用的 context.readSelectedFile() 可读取一次字节；普通调用不提供此方法。宿主按后台进程和调用 ID 路由读取，调用结束或取消后不再交付。文件路径和授权标识均不传入后台。

可信内置插件可在清单中声明 databaseVersion（正整数，SQLite user_version 范围内）和 backupDatabase（本插件的单个 SQLite 文件名），并提供同目录 migrate.mjs。注册时验证声明与入口路径，不执行迁移代码。入口导出 migrate({dataDirectory})，接收升级副本中的插件目录。迁移入口的绝对路径仅供宿主使用。

R12 的宿主内部凭据作用域按可信插件标识绑定。store 返回随机句柄，use 仅供宿主侧适配器消费，revoke 可撤销；读取和撤销均按插件标识与句柄联合匹配。凭据库独立于工作区和备份库，系统加密不可用时拒绝写入与读取。macOS 桌面适配器使用 Electron safeStorage 异步加解密，在交付前再次检查句柄是否已撤销。真实业务消费端仍待接入。

## 在预览包中运行 SDK 示例

从项目根目录运行 `npm ci`、`npm start`。macOS 构建需要 clang++、macOS SDK 和当前 Node 安装的开发头文件。首个例子使用仓库随附的配色板、CSS 服务和计数器。它们与宿主一起构建。新增可信内置视图后，重新构建才能让渲染器收录其入口。

1. 新建一个工作区，选择「配色板」，点击「左右切分」，在新窗格再选一次「配色板」。左右分别选「暮色海岸」与「山间晨雾」。切换工作区再返回，两个选择各自恢复。配色方案通过 `updateConfig` 保存到当前实例，选中色值通过 `updateState` 保存。[视图实现](../../plugins/fixture-palette/view.jsx)
2. 在左侧点击「生成 CSS」。配色板向 `workbench.palette.css` 的 `1.0.0` 版本调用 `format`，参数是当前色值数组，返回 CSS 文本。服务依赖由调用方声明，方法和输入输出类型由提供方声明。[调用方清单](../../plugins/fixture-palette/manifest.json) · [提供方清单](../../plugins/fixture-css/manifest.json) · [后台实现](../../plugins/fixture-css/backend.mjs)
3. 点击「后台导出」，切到任务中心，展开已完成记录。视图通过 `jobs.submit` 提交清单中的任务类型；首次提交生成请求标识，遇到提交未确认时复用该标识。任务记录由宿主持久化，视图卸载后仍可读取。[任务提交与服务接口](../../packages/sdk/src/index.ts)
4. 将两个窗格分别替换为「计数器」。在任一窗格点击「记一次」，两个实例会显示同一个新值。每个视图订阅服务失效通知并重读数据，在卸载时释放订阅。业务值由后台保存在自己的 SQLite 目录，复制工作区不会创建第二份计数。[清单](../../plugins/fixture-tally/manifest.json) · [视图](../../plugins/fixture-tally/view.jsx) · [后台](../../plugins/fixture-tally/backend.mjs)

开发时运行 `npm run check:boundaries` 检查插件导入边界，运行 `npm run test:desktop` 验证真实 Electron 生命周期。新插件沿用 `plugins/<目录>/manifest.json` 和 `view.jsx` 的结构，声明后台服务时提供 `backend.mjs`。视图通过宿主传入的 props 调用公开能力；后端仅访问本插件的数据目录。当前共享 UI 与可信 Node 后台的约束见[插件信任边界](plugin-trust.md)。

按需后台可从 backend.mjs 导出异步 dispose()。当最后一个窗口关闭、且所有服务调用和已派发请求均结束后，宿主等待 60 秒，再通知按需后台释放资源。重新开窗会撤销待执行的回收。后台进入释放阶段时新调用可收到“服务正在释放资源，请稍后重试”。宿主给释放操作 5 秒，超时终止该进程。计数器示例在 dispose() 中关闭其 SQLite 连接。resident 后台不参与本次无窗回收；有窗但缺少视图订阅的按插件回收仍待接入。

M0 后台模块可导出 activate({dataDirectory})，每个新后台进程在报告就绪前等待此函数完成。只提供启动行为的插件可仅导出 activate。activationEvents 包含 onAppStart 时，正常启动（包括登录静默启动）和插件恢复可用时激活。常驻声明须同时提供 onAppStart 和非空 description 说明用途。安全模式跳过激活。启动失败时插件管理显示本次启动诊断和重试方式。停用插件会清除诊断，重新启用后发起新的启动尝试。宿主不自动重试。
