# 接管审阅与差异台账

## 资料完整性

references 已是展开目录，共 26 个文件，无压缩包，不需要再次解压。v1.0 分文档、合并 Markdown、HTML 阅读版均存在。Demo 的 initialState 中资源 r2 写了“v0.9 评审稿”，路径 docs/01-PRD.md，但对应正文不存在；这只是示例记录，不能据此重建 v0.9 或推断版本差异。用户明确较晚 v0.9 应优先：获得正文后逐需求合并，保留 v1.0 独有有效项，并重新评审受影响 ADR。

现有根 AGENTS.md 为空；目录未初始化 Git（git status 返回 not a git repository）。本轮不初始化、不提交，也不修改 references。

## 差异与处理

| 主题 | 原证据 | 本轮处理 |
|---|---|---|
| 阶段编号 | 01/05/06 的 M0 验证、M1 核心、M2 产品 | 最新要求优先：M0 核心（含前置验证）、M1 产品；不是删除旧 M0 验证 |
| 工作区中心标记 | README 中 Q2 “A”是选项字母，PRD C 是确认状态 | 使用独立状态标签，避免把选项 A/B/C 当成确认程度 |
| 独立桌面 | 原稿已有 Electron 参考与关闭窗口语义 | 最新要求加强为桌面架构方向；登录、菜单栏、热键默认值仍 O |
| 信任 | 原稿建议第一方/自写，Q3 未决 | 延续为 P 推荐，不记为已确认；外部安装默认不实施 |
| 布局 | 原稿自有 tree；Demo x/y、叶内 view/config | 保留自有二叉模型；明确 pane 与 instance ID 分离，不迁就 Demo 格式 |
| 全局热键 | 04 将全系统热键留待后续 | 本轮提升为桌面行为待决项，允许 M0 验证宿主唤出；不是插件自由注册热键 |
| 业务 MVP | 07 建议重复日程、子任务等；日程/待办独立可用记为 C | 独立可用保留为 H；具体功能矩阵仍 L/P，开工前确认 |
| 数据保护 | 原稿备份/导入/迁移与 unknown 任务语义完整 | 保留，不因简化架构删掉失败路径 |
| 性能 | 原稿 3s/500MB 等建议预算 | 仅作候选目标；新增无窗状态及空闲 CPU 测量，不宣称达标 |
| Demo 限额 | 20 工作区、12 视图、4任务、1MiB 导入、固定日期 | 仅原型限制；正式安全上限另定，不自动成为 PRD |
| 扩展点 | Q4 未答，旧稿列六种贡献 | P 保留视图/服务/命令/设置/Job/资源，但不建通用事件总线/任意导航注入 |

## Demo 源码审阅

源码定位以 references/workbench-demo/index.html 为准。它是无构建依赖的原生 JS 字符串模板应用，不是组件框架项目。侧栏、顶栏、WorkspaceCanvas、Popover/Modal/Drawer 是静态容器；renderNav/renderLayout/renderNode/renderView 与各业务 render 函数生成 HTML；全局 data-action 事件委托把所有动作汇入 action switch。

- 约 112–150 行：PLUGINS 静态字典；initialState 建立日常、研究与项目、资料处理三套工作区。leaf(view, config) 把窗格和视图实例合并；split(axis,a,b,ratio) 递归构树。removeNode 收缩单子树；cloneTree 换 ID；copy 用 JSON 序列化。
- renderNode/minSize 使用 flex 嵌套，叶最小 260×170，分隔 11px；窄屏滚动保留桌面布局。拖动比例夹在 .12–.88，导入校验允许 .08–.92；这两者并不一致。键盘分隔调整每次 .04。
- splitPane 创建空叶并打开选择器；pickView 替换叶 view/config 或在最外侧追加右栏。swapPanes 是两个叶的交换，不是任意拖放重构树。最大化只改变渲染入口，不写原树。undoMap 每工作区保留20次布局快照，不撤销业务操作。
- switchWorkspace 修改 active 并整体重绘，无正式 canClose/snapshot 协议。复制只复制布局配置；tasks/events/resources/notes 全局共享。不同待办实例的筛选位于 leaf.config，refreshView 刷新所有同类型视图。
- setPlugin 只是 enabled 布尔开关；停用保留占位。有模拟任务时拒绝停用 tools。没有安装、模块加载、进程、依赖发现或 SDK。
- startJob/tickJobs 用 Date.now 和永久 300ms interval 推进 9/14秒模拟；选文件只保留 name/size/type，不读正文、不联网。关闭窗格不影响全局 jobs；重载把运行态转 interrupted。取消立即改状态，不能移植为真实远端取消实现。
- save/flushSave 将全部 state 写进单个 localStorage key，180ms 防抖；加载异常尝试写 recovery 副本后回到初始样例。正式版不得用“重建示例数据”替代业务恢复。布局导出排除业务数组；导入验证后追加并换 ID，不自动启用未知插件。
- 日程只支持当天定时事件，拒绝跨日；today 固定 2026-11-18。无全天、重复、通知或时区策略。待办 group 同时叫清单/项目，正式模型应归待办插件解释，不能变成宿主 Project。
- 资源归档直接写全局 resources，不是真实跨插件服务。命令列表包含日程/待办分支，正式宿主必须改为贡献注册。notes/campus 仅交互样例，不自动纳入 M1。

已目视审阅四张 preview：浅/深主题、插件选择器、研究工作区；保留工作区侧栏、轻量窗格框架、选择视图、任务抽屉的方向，颜色/字重/密度未冻结。

test_demo.py 逐项阅读；test-results.json 保存23组通过记录，未捕获 JS 错误。测试使用 page.set_content 与 localStorage 内存替身，涵盖切分/交换、多实例、复制删除、模拟后台、导入拒绝与序列化恢复。本轮未重跑。脚本会向原目录写截图和 JSON，后续应在副本运行；不能原地运行后声称 references 未变。历史结果不证明真实磁盘持久化、原生窗口生命周期、隔离、真实服务或性能。

## SDK 的实质缺口

1. JobHandler 只有 execute/reconcile：没有重启后远端 cancel 钩子；reconcile 的 JobOutcome 不能表达 running+progress。必须补全，不靠强行 cast。
2. 业务服务只有 call 无订阅，多视图跨进程共享修改需要版本化订阅或显式刷新；Demo 全局 refreshView 不能当成协议。
3. Workspace 只有 stateVersion，config 没有独立版本；API 无 config/state migration 钩子。必须分别演进。
4. canClose 只返回 allow/message，没有“保存”动作；关闭原因缺 replace-view/delete-workspace/window-close。设计中应补全防丢路径。
5. Manifest 正则不能替代入口存在、真实路径边界、命名空间、兼容范围及依赖图校验；示例无 dist 文件，不是可加载包。
6. storage.transaction(callback) 是 SDK 本地回调，不能把函数跨 IPC；后台独占自己的数据入口，协议传事务操作或由本地存储适配器完成。
7. 原稿一次备份多个插件不等于跨库原子快照；需要清楚注明一致性范围，首版不建设分布式事务。
8. 关闭主窗口、renderer 崩溃、系统睡眠及强制退出不同；提醒不保证睡眠/退出期间送达，恢复时对账与去重。
