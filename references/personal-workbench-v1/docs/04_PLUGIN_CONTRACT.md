# 插件契约与 SDK 设计

**版本：插件 API 0.1.0 设计草案｜2026-11-18**

本文件给出实现时必须对齐的接口语义。`contracts/plugin-api.d.ts` 为声明文件，不包含实现；JSON Schema 只校验结构，不替代语义、权限与运行时检查。全部接口仍属于 A 类基线，正式发布前需要兼容性评审。

## 1. 包格式与入口

```text
plugin-package/
  manifest.json
  dist/ui.js              # 可选；预构建 UI 模块
  dist/service.js         # 可选；预构建后台模块
  assets/
  LICENSE
  THIRD_PARTY_NOTICES
```

Manifest schema 见 `../contracts/plugin-manifest.schema.json`，示例见 `../examples/whisper.manifest.json`。示例仅表示包声明，不包含可执行入口文件。

| 字段 | 契约 |
|---|---|
| schemaVersion | 包声明结构版本，当前 1 |
| id / version | 稳定插件标识与语义版本；id 全局唯一，不从展示名推断 |
| hostApi | 宿主 API 兼容范围；初版可用 `>=0.1.0 <0.2.0`，禁止忽略不匹配 |
| platforms | 声明支持平台；声明不等于已在每个平台完成测试 |
| entrypoints | 包内 UI/后台入口；不得指向绝对路径、父目录或网络脚本 |
| activationEvents | onView、onCommand、onService、onJob、onAppStart；按实际需求惰性激活 |
| requestedCapabilities | 请求的能力与用途；不能作为自动授权或自证可信依据 |
| dependencies | 必需与可选服务 id → 版本范围；不是自动下载代码依赖 |
| contributes | 视图、命令、服务、Job 类型、资源类型、设置 schema |

安装校验还必须检查 contribution ID 冲突、entrypoint 实际文件、所属命名空间、语义版本范围是否合法、重复方法和依赖环。Manifest 中不得自带生效的 trust/grant；宿主单独保存信任与授权记录。

后台和 UI 入口均在完成校验且符合信任策略后才执行。仅“扫描目录”不能触发模块 import。所有运行期注册项必须在 Manifest 中声明，否则返回未声明贡献错误。

## 2. UI 入口与多实例

```ts
interface PluginUiModule {
  register(context: UiRegistrationContext):
    void | Disposable | Promise<void | Disposable>;
}

interface ViewFactory {
  mount(container: HTMLElement, context: ViewContext): Promise<ViewController>;
}
```

一个 viewType 注册一个 factory，宿主每次打开窗格调用 mount 创建实例。不要用模块级全局变量保存“当前筛选”，否则多个实例会互相覆盖。

`ViewContext` 提供 instanceId、workspaceId、pluginId、config、restoredState、resource、services、jobs、受限 capabilities 以及 saveConfig/saveState。capabilities 仅开放允许 UI 使用的选择/展示等入口，不允许获取后台的任意执行能力。UI 不直接得到数据目录、凭据明文或任意 IPC 接口。

`ViewController` 提供 snapshot、canClose、updateConfig、setVisible、resize、dispose。配置从宿主编辑器修改时先校验并调用 updateConfig，接受后提交配置；写入失败则恢复旧配置并提示。只有持久化完成后才能显示已保存。dispose 必须解除该实例自己的订阅/计时器，不能结束插件级服务。canClose 可阻止有未保存编辑的切换；宿主显示“保存/放弃/取消”，不能直接丢掉输入。快照失败时保留旧状态和错误，不以空状态替换。

最低状态规则：config 保存显示偏好；state 保存可恢复导航与轻量草稿定位；业务正文/大结果进入插件数据层。建议单实例状态 ≤256KiB、整工作区导入 ≤5MiB，超过提示使用业务存储。这是防误用预算，可在评审后调整。

## 3. 后台入口与生命周期

```ts
interface PluginServiceModule {
  prepareData?(context: DataPreparationContext): Promise<DataStoreLifecycle>;
  activate(context: PluginContext): Promise<void | Disposable>;
}
```

activate 注册命令、服务、Job handler 和资源打开器。返回 Disposable 清理插件级资源。后台运行实例按 pluginId + generation 识别，generation 在重启后递增，旧句柄失效。

触发任意视图不必重复激活后台。重复激活请求由宿主合并，同一插件同一运行世代只执行一次 activate。若激活失败，释放已注册贡献并回滚到 failed，不能留下半注册服务。

onAppStart 是明确后台需求，不是默认值。例如应用内日程提醒需要启动服务；纯图片预览插件不必开机即启动。

## 4. 命令与设置

命令 id 稳定且命名空间明确，参数为 JSON。命令入口通过命令面板、插件视图按钮或宿主允许的位置暴露。声明 `inputSchema` 时调用前验证，缺参数返回可解释错误，不执行半个业务操作。

快捷键使用受控注册并处理冲突，不允许插件随意覆盖工作区切换、退出、辅助功能等关键组合。首版支持应用内命令快捷键，全系统热键为后续能力。

设置 schema 描述默认值、类型和帮助信息。普通设置可持久化到插件配置；服务令牌、密码不进入设置 JSON，保存为凭据 handle。视图 config 与插件全局设置互不覆盖。

## 5. 服务协议与依赖

```ts
const service = await context.services.resolve(
  'workbench.resource-catalog', '^1.0.0', { optional: true }
);
if (service) {
  await service.call('register', { resource: resultRef }, {
    timeoutMs: 5000, idempotencyKey: operationId
  });
}
```

代码为契约用法示意，变量由插件实际业务提供，不是可直接运行的完整示例。

必需服务不存在时插件激活失败；可选服务不存在返回 null，对应能力隐藏或降级。resolve 选择已启用且兼容的提供者；多个提供者时宿主保存用户选择。服务版本不兼容不能默默调用。

注册内容包含 id/version/methods，方法输入输出 schema 放在 Manifest。调用方、requestId、取消信号和委托授权由宿主构造 `ServiceCallContext`；调用方不能通过自己的 JSON 参数伪造授权身份。

调用链只共享业务需要的最小数据，不通过公共事件广播整库内容。事件订阅后续可以在明确的服务契约中增加，不先建设任意字符串主题的全局事件总线。

JupyterLab 使用 requires/optional/provides 区分服务依赖，本设计借鉴这一职责划分，但不直接复用它的运行时或产品业务模型。[S07]

## 6. Job 接口与副作用控制

```ts
const job = await context.jobs.submit(
  'local.whisper.transcribe',
  { fileRef: selectedFileRef, endpointId: configuredEndpointId },
  { idempotencyKey: stableSubmissionId }
);
const subscription = context.jobs.watch(job.id, renderJobState);
```

pluginId 由上下文绑定，不接受调用者自由填写。对其他插件 Job 的读取/取消需要明确授权或宿主任务中心身份。关闭视图释放 watch 订阅，不调用 cancel。

`JobHandler.execute(input, context)` 接收 jobId、idempotencyKey、signal 和 checkpoint。接受远端任务后尽早 checkpoint externalId，再更新进度。进度为 0..1 或 null，不能用无限“99%”掩盖 unknown。

相同 pluginId/jobType/idempotencyKey 的提交返回已有记录；输入摘要不同则报 `IDEMPOTENCY_CONFLICT`。所有失败不自动重试。人工重试新建尝试并关联前一 Job；对方支持幂等时沿用适当外部语义，不支持时提醒重复副作用风险。

`reconcile(record)` 可选，用于查外部任务状态，不能默认重新 execute。`cancel(jobId)` 返回当前记录，可能仍为 cancel_requested；只有确认停止才进入 cancelled。详情见 03 的状态机。

## 7. 资源与打开器

```ts
interface ResourceRef {
  providerId: string;
  kind: string;
  resourceId: string;
  version: number;
  label?: string;
}
```

resourceId 对宿主是 opaque identifier，不能把“解析成 file:/// 路径”作为通用逻辑。ResourceRef 不是访问授权，也不携带令牌或 Cookie。

资源打开器注册 kind，接到引用后返回 viewType/config；宿主再创建/复用合适视图。打开命令必须是用户操作或受信任流程触发，导入工作区时只保存引用，不主动执行打开器。

来源不存在时返回 `RESOURCE_NOT_FOUND`，提供重新定位；插件缺失显示占位。未来项目插件可以保存来自不同 provider 的引用，但不能直接改写其内部对象。

## 8. 存储与系统接口

SDK 为插件提供私有 key/value 事务配置存储；`storage.dataDirectory()` 只给可信后台，由其维护专用业务数据库。插件不依赖宿主 DB 表名。私有 namespace 的检查主要防止误用，不宣称可约束恶意可信原生代码。

`capabilities.status(name)` 返回 supported / unsupported / needsAuthorization / denied；invoke 只能调用已注册能力。首版建议能力：

| 能力 | 输入/结果概念 | 主要约束 |
|---|---|---|
| files.select / files.readSelected / files.writeSelected | 用户选择 → opaque FileRef；读写按授权引用 | 不能凭字符串路径扩权；处理搬移和权限撤销 |
| system.openResource | 安全解析后的本地资源或 URL | 允许协议、调用意图、可执行文件确认 |
| notifications.show | 标题、正文、来源、操作引用 | 不保证应用退出后调度；处理用户拒绝通知 |
| clipboard.read / clipboard.write | 显式用户动作与文本/允许类型 | 不默默轮询剪贴板；不把内容写日志 |
| credentials.store / credentials.use | 受保护句柄与操作用途 | UI 不读取原文；默认不导出 |
| network.request | 已配置端点/授权目标、请求体引用 | 限制重定向和目标；脱敏；大文件不进控制通道 |
| process.run | 受控可执行文件与参数数组 | 不提供泛用 shell 字符串；外部调用需明确授权 |

process.run 是本地服务插件可能需要的能力，但已有服务只需网络接入时不请求它。宿主统一能力名不意味着必须统一把所有数据经过主进程复制；大文件采用受控流或临时文件引用，UI/后台协议只传 metadata 与 handle。

### 8.1 数据生命周期挂钩

持有业务数据库的后台模块可导出 `prepareData(context)`，返回 DataStoreLifecycle：schemaVersion、beforeBackup、exportSnapshot、afterBackup 和 migrate。宿主在通过信任检查后加载模块，先调用 prepareData，完成数据版本检查/迁移后再调用 activate。prepareData 只准备数据接口，不启动 Job、同步或普通业务服务。一个插件首版提供一个聚合数据提供者，多个业务文件由其统一处理。

beforeBackup 暂停新业务写入并等待当前事务完成；exportSnapshot 写入宿主分配的备份目录，返回文件清单与 schema 信息；afterBackup 必须在成功或失败路径都调用以恢复写入。宿主负责对输出清单验证路径与内容哈希；可信插件不能据此被视为受限文件系统进程。

migrate 在插件普通业务激活前执行、在备份成功后进行，失败则不启用新版本。挂钩跨进程作为 runtime 协议调用，函数本身不跨 JSON 传输。没有业务数据的插件可不注册，只有视图 state 的插件使用宿主状态迁移路径。

## 9. RPC 与错误模型

传输请求包括 protocolVersion、requestId、method、params、deadline、traceId；origin 由通道注入而非信任 payload。响应为 result 或结构化 error，不返回原始进程栈给普通用户。

标准错误码：`INVALID_ARGUMENT`、`API_INCOMPATIBLE`、`CAPABILITY_UNAVAILABLE`、`PERMISSION_DENIED`、`SERVICE_UNAVAILABLE`、`TIMEOUT`、`CANCELLED`、`RESOURCE_NOT_FOUND`、`STATE_INCOMPATIBLE`、`IDEMPOTENCY_CONFLICT`、`INTERNAL_ERROR`。

API 的 timeoutMs/AbortSignal 是 SDK 表达，跨进程转成 deadline 和 cancel 消息。请求超时不推断服务执行回滚；有副作用方法必须考虑幂等或可查询状态。

控制消息建议最大 1MiB；文件用受控句柄。入站 Schema、深度/大小限制和异常速率限制须在进入业务方法前执行。错误日志包含 pluginId、generation、jobId/requestId/traceId，不包含业务正文和密钥。

## 10. 版本、兼容与插件开发验收

Manifest schema、hostApi、服务版本、业务 DB schema、view state version 分开演进。向后兼容迁移由数据所有者实现；宿主不能猜测陌生 payload 的含义。API 0.x 阶段 breaking change 需要提升 minor 并更新兼容范围。

插件上线最低检查：Manifest 校验；两个独立视图实例；无视图后台；离线/服务失效；关闭/重开；状态升级；资源不存在；保存失败；依赖缺失；主题/键盘；凭据与日志脱敏；卸载保留数据。

公共 SDK 只暴露稳定契约。插件直接 import `apps/desktop/src/main/*`、宿主数据库或另一个插件私有模块应被依赖边界检查阻止。以上限制是可维护性约束，不是攻击者安全隔离。
