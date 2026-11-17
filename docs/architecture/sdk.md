# SDK 0.1 修订方案

状态 P。旧 contracts 作为设计输入只读保留；本轮不生成生产 TypeScript。下列是待冻结语义，不与旧声明同时声称已经实现。

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
