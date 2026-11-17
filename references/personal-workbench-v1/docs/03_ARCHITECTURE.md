# 核心架构设计与参考实现

**版本：v1.0 评审稿｜2026-11-18｜A 类参考方案；技术栈尚未冻结**

前置文档：01 PRD、02 插件信任。本文只为已明确的工作区中心、插件优先架构提供可实施方案，不把第一方业务写进宿主。

## 1. 核心不变量

1. 宿主不拥有 CalendarEvent、TodoItem、Project 等业务表或业务规则。
2. 工作区只拥有布局、视图实例和引用；删除工作区不删除业务对象。
3. 视图关闭、服务停用、Job 取消和应用退出是四个不同操作。
4. 第一方插件使用与未来受信任第三方相同的公开接口；平台适配器可以是宿主受控实现，不冒充业务插件特权。
5. 服务协作通过版本化契约，禁止用对方私有表/全局对象作为协议。
6. 关闭外部安装入口是 Q3 未决定时的默认行为；不能把预留权限字段解释为已实现强沙箱。

## 2. 分层与模块职责

| 模块 | 责任 | 不负责 |
|---|---|---|
| Workbench Shell | 工作区入口、窗格框架、全局命令、设置、任务与诊断入口 | 日历/待办/项目内容 |
| Workspace Engine | 递归布局、实例标识、工作区切换、恢复、导入导出 | 插件数据模型和业务复制 |
| Plugin Registry | Manifest 校验、兼容性、贡献发现、依赖图、信任与版本状态 | 执行业务算法 |
| Plugin Supervisor | 激活/停用、后台运行实例、心跳、超时、重启节流 | 自动重放有副作用任务 |
| Capability Broker | 文件/通知/凭据等系统能力、调用来源与范围核验 | 允许插件直接访问所有宿主内部模块 |
| Service Registry | 命名服务、版本匹配、可选依赖、调用与取消 | 任意全局共享业务对象 |
| Job Registry | Job 标识、生命周期记录、幂等提交、状态订阅、结果引用 | 把所有任务都自动持久执行或自动续跑 |
| Persistence & Recovery | 宿主事务、插件数据目录、版本迁移协调、备份协议 | 解释插件每张业务表 |
| UI Kit & SDK | 组件、设计令牌、可序列化协议、开发体验 | 强制插件只能显示模板化表单 |

## 3. 参考技术路线与替代方案

### 3.1 参考路线：Electron + TypeScript + React

这是 A 类建议，用于把后续目录、接口和测试写具体，不是已经通过评测的技术选型。Electron 提供 main、renderer 与辅助进程等运行组成，适合映射宿主、插件 UI 和后台服务。[S11][S12]

参考结构：Electron 主进程管理平台能力与持久化协调；renderer 承载宿主和可信 UI 插件；有后台逻辑的插件按需拥有独立 utility process；TypeScript 定义跨边界协议，React 提供默认 UI Kit，SQLite 存储宿主元数据与各插件独立业务数据。

选择理由是第一阶段便于统一前端工具链、服务调用与跨桌面平台行为。代价是运行资源预算、原生模块打包、宿主与可信 UI 共故障域，以及不能将桌面外壳直接复用到移动端。没有实测前不声称比 Tauri 更快或更稳定。

### 3.2 替代：Tauri + Web UI + Rust 平台适配

Tauri 官方覆盖桌面和移动平台，并提供前后端 capability 机制。[S13][S06] 对未来移动平台与原生能力值得评估。但其原生插件机制不能不经设计就等同于本产品的“用户运行时安装业务插件”；动态 UI、后台语言与包更新仍要自行定义。

若选择 Tauri，保留 Workspace/Manifest/RPC 的 JSON 契约，把 HostAdapter 和运行器替换为 Rust/侧车实现。是否满足资源目标、动态插件开发体验与本地服务接入，需要同一验收场景比较，不能只比较安装包大小。

### 3.3 布局路线

优先验证无标签的 Gridview 类组件，而不是先引入带标签/浮动窗口的完整 IDE 停靠模型。Dockview 官方将 Gridview 定义为不带标签的可调整网格，说明其由嵌套 Splitview 组成。[S08][S09]

Dockview 是候选，不是必选。当前许可区分 MIT 包与商业 Enterprise，最终选用的包、功能和版本须逐项核对，不能把整个仓库视为同一授权。[S10]

定义自有 `LayoutNode` 和 `LayoutAdapter`，只持久化自有模型。M0 必须验证切分、移动、最小尺寸、无标签、JSON 往返和键盘操作；候选不满足时，以窄接口替换或实现轻量二叉切分，不扩大产品功能以迎合库。

## 4. 进程与信任模型

参考执行链：

```text
Desktop Main / Platform Adapter
  ├─ Host DB + Recovery + Plugin Registry + Job Registry
  ├─ Capability Broker + Service Router
  ├─ Shell Renderer
  │    ├─ Workspace / Pane Frame / UI Kit
  │    └─ Trusted Plugin UI Instances（共享渲染环境）
  └─ Plugin Service Processes（有后台逻辑时按插件惰性启动）
       ├─ Calendar / Todo data services
       ├─ Tool adapters → existing Whisper / OCR services
       └─ Optional service providers
```

主进程不加载任意插件业务模块，不执行模型推理和大文件解析。插件 UI 不获取完整 Node/Electron API；桥接暴露一组有限方法，校验 IPC 发送方和载荷。Electron 官方明确建议 context isolation、renderer sandbox 和细粒度 IPC 桥接。[S02][S03][S04][S15]

后台 utility process 带 Node 集成，不因此成为不可信代码沙箱。[S12] 一插件一后台进程提高故障归属和重启控制，但有资源代价；首版仅惰性启动，若性能预算不满足，可重评受信任第一方服务共享运行器，必须同时修改故障隔离承诺。

共享 renderer 中的插件 ErrorBoundary 只能处理部分可恢复渲染错误，不能隔离死循环、内存耗尽或所有异步异常。宿主提供诊断与安全重启；如要求未知插件无法拖垮宿主 UI，应切换到 C 类独立受限执行方案。

## 5. 数据对象与归属

| 对象 | 所有者 | 关键字段 |
|---|---|---|
| Workspace | 宿主 | id、name、revision、layout、activePaneId、schemaVersion |
| ViewInstance | 宿主保存，插件解释配置/状态 | id、pluginId、viewType、config、stateVersion、state、resource |
| PluginInstallation | 宿主 | id、version、packageHash、trustRecord、enabled、apiRange |
| JobRecord | 宿主记录，插件解释过程 | id、pluginId、jobType、status、idempotencyKey、externalId、resultRefs |
| ResourceRef | 引用由宿主保存，插件解析 | providerId、kind、resourceId、version、label |
| BusinessData | 插件 | 各插件自己的 schema、migrationVersion 和索引 |
| Secret | 平台凭据层 | plugin 命名空间、handle、授权用途；不进工作区文件 |

### 5.1 工作区模型

`LayoutNode` 是 `leaf(paneId, viewInstanceId?)` 或 `split(axis, ratio, first, second)`。`horizontal` 明确定义为左右排列，`vertical` 为上下排列；ratio 属于 (0,1)，结合最小尺寸计算实际显示。

空窗格 leaf 没有 viewInstanceId。一个工作区内每个实例最多被一个 leaf 使用，paneId 全局唯一，实例必须存在于该工作区实例表。activePaneId 必须指向叶节点。解析后还要检查深度/节点量、唯一性、引用完整性，不能只依赖 JSON Schema。

每个工作区独立记录实例。复制时重新生成 workspace/pane/viewInstance ID，复制 config/state/resource；resource 指向同一业务对象。插件不可把自身事件/待办主键存为视图实例标识。

### 5.2 状态作用域

| 作用域 | 举例 | 生命周期 |
|---|---|---|
| 应用级 | 当前工作区、主题、信任记录 | 应用配置 |
| 插件级 | 服务端点、数据结构、后台订阅 | 与插件启停/数据保留相关 |
| 工作区/视图级 | 某个日程筛选、当前目录、内部标签 | 配置工作区时保存 |
| 会话级 | 指针悬停、临时弹窗、未提交拖动 | 不要求跨重启保存 |

时间视图应保存 `relative: today/thisWeek` 或 `fixed: date` 的意图，而非仅保存解析后的绝对日期。

## 6. 插件与视图生命周期

插件状态：`discovered → validated → disabled/ready → activating → active → stopping → disabled`；校验/激活/运行失败可进入 `failed`。安装版本与活动运行版本分开记录，待升级包不能替换正运行入口。

发现插件只读取 Manifest，不执行模块。需要视图、命令、服务或声明的后台启动事件时才激活。必需依赖缺失或依赖环使相关插件失败；可选依赖缺失不阻止加载。服务重启后世代号改变，旧调用失效，调用方需重新取得服务句柄。

视图状态：`unmounted → mounting → mounted → hidden/unmounted`。插件服务可以一直 active。切换工作区时先持久化有价值输入，再卸载非活动视图；首版不缓存所有工作区的全部 DOM。插件可以为瞬态重建缓存数据，但不能把唯一数据放在组件内存。

停用先展示正在运行的 Job 与依赖方，用户可取消停用或停止相关工作并停用。达到关闭宽限时间后可终止后台进程，并把未确认任务标记为 interrupted/unknown，不能伪装成功完成。宽限时间默认 5 秒，是可调整工程值。

## 7. Job 与外部服务恢复

状态集合：`queued、running、cancel_requested、succeeded、failed、cancelled、interrupted、unknown`。succeeded/failed/cancelled 为终态；interrupted 表示宿主明确中断了本地执行；unknown 表示外部是否完成尚不能确认。

提交先在事务中写 Job 与幂等键，再调用插件适配器。崩溃可能发生在“远端已接受、externalId 未落库”之间，不能声称 exactly-once。支持远端幂等键时传递该键；不支持时记录 unknown 并要求查询/人工确认，禁止自动重复提交。

取消是请求。只有外部服务或本地执行器确认停止，才标 cancelled；远端没有取消能力时，显示“不能取消远端任务”，可停止本地轮询但仍保留 unknown/running 状态。

应用启动只做 reconciliation：按记录查询 externalId 或本地执行归属。外部服务支持查询时可更新结果；只有同步请求响应的端点无法可靠重连，需要明确告知。重试产生新尝试标识，并关联原 Job；不会悄悄复用已成功操作的幂等语义。

## 8. 持久化、迁移与备份

建议目录（名称可调整，不依赖写死的用户主目录）：

```text
userData/
  host.sqlite
  plugins/<plugin-id>/<version>/   # 只读安装资源
  plugin-data/<plugin-id>/         # 插件业务库/结果元信息
  backups/<backup-id>/
  logs/                           # 限额、轮转、脱敏
```

工作区写入由宿主串行协调，事务包含布局与实例表，并进行 revision 比较。拖动过程可 300ms 防抖，拖动结束立即提交；业务保存返回成功必须在对应数据持久化之后。具体 SQLite synchronous/WAL 设置须在强制终止测试中验证，不把 WAL 本身等同完整持久性。

插件数据归插件所有，参考实现每插件一个 SQLite 文件。宿主提供数据目录与备份协调，插件后台独占其写入口，UI 只通过服务调用，不直接访问数据库。单写者和插件私有 schema 降低并发迁移复杂度。

备份要协调写入：先停止新写入/暂停可变状态，等待事务完成，再通过一致性快照接口导出数据库及结果清单。运行中的 SQLite 数据库不能只复制主文件而漏掉 WAL；应使用一致性快照或合适的备份协议。[S16][S17]大文件可用引用或显式勾选复制，不默认打包用户所有项目文件。凭据默认不导出，恢复后重新授权。

迁移流程：检查版本 → 建立可用备份 → 暂停该插件 → 事务迁移 → 数据校验 → 切换版本 → 重新激活。失败保留原文件并停用新版本。不得在错误时以“新建空库”掩盖数据丢失。

工作区导入独立于业务数据恢复，导入只创建配置与引用。缺插件保留占位，不下载安装，不信任包，不执行资源打开命令。

## 9. 服务接口与能力代理

服务以全局命名 id 和语义版本注册，例如 `workbench.resource-catalog@1`；方法具有 JSON Schema 输入/输出。调用包含 requestId、deadline、cancelToken、traceId、必要的幂等键和委托授权句柄。传输不允许函数、DOM 节点、原生文件句柄或任意路径权限声明。

服务发现首先匹配已安装且已信任的提供者，多提供者时用户明确选定默认，不“谁最后注册就覆盖”。运行期依赖丢失返回 `SERVICE_UNAVAILABLE`，可选能力禁用相关按钮，不让整个插件退出。

本地 UI 可以调用 Promise 风格 SDK；跨进程统一转换为 RPC。AbortSignal 只在本地使用，通过 cancellation 消息映射，不把 Signal 对象直接 JSON 序列化。超时只代表调用方停止等待，不代表对端副作用已经回滚。

能力代理通过 actual channel 绑定 caller，并检查参数、授权范围、是否允许当前操作。原生可信后台仍可能绕开代理，这一点必须在 Q3 文档与安装提示保持一致。

## 10. 布局与插件 UI

UI Kit 提供颜色、间距、字体、焦点、表单、空态、错误态和任务进度组件。插件可自行实现复杂界面，最低遵守键盘/主题/缩放语义。

参考实现采用 CSS Modules/命名空间和容器样式约定；必要时可用 Shadow DOM 防止意外样式泄漏，但其不是代码安全隔离。组件入口通过 SDK 的 mount/unmount 边界适配，而不是把 React Component 类型写死进所有公共协议；React 是首版开发套件选择。

插件声明 minWidth/minHeight；小窗格可切换紧凑模式或展示尺寸提示。宿主只控制框架，不改插件内部业务导航。插件内部标签只能作为它自己的 config/state 保存，宿主不感知标签列表。

## 11. 平台与后续扩展

macOS 文件/通知/凭据能力通过 HostAdapter 提供；平台特有对象不越过 JSON 协议。Windows/Linux 以相同能力名称返回 supported/unsupported/needsAuthorization；缺失能力不通过伪成功掩盖。

移动端将来可以复用数据格式、服务协议及适合的 Web 业务逻辑，但可能采用新的 Shell、后台生命周期与授权接口。动态代码分发、常驻后台和本地模型等需独立评估，不在本文保证通用。

校园登录、Apple 双向同步、Agent 会话恢复分别由业务插件实现。原站登录限制或权限变更导致某功能不可用时，插件提供可解释状态，不要求宿主绕过访问控制。

## 12. 必须先验证的架构风险

| 风险 | M0/M1 验证 |
|---|---|
| 布局库把标签组或私有格式绑进宿主 | 无标签 12 窗格往返、布局导入导出、替换适配器测试 |
| 动态 UI 模块与 CSP/打包冲突 | 打包构建从本地插件资源加载视图；禁止远端脚本 |
| 每插件进程资源过高 | 8视图/3后台进程预算；实测后决定进程粒度 |
| 服务中断导致任务重复执行 | externalId 落盘前后故障注入、幂等与 unknown 路径 |
| 公共 SDK 名义存在但默认插件走后门 | 依赖边界 lint；默认插件不能 import 宿主内部包 |
| 升级破坏业务数据 | 备份、正向迁移失败、旧版本不兼容和恢复测试 |

本文没有进行上述实测。实施任务与预期验证命令见 05，发布条件见 06。
