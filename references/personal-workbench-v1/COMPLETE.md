# 个人插件化工作台 · 完整需求与实现文档

**v1.0 评审稿 · 2026-11-18**

本文件合并文档包正文与契约附录，便于阅读和交给开发工具。原始分文档版本保留独立文件。

<a id="overview"></a>

# 个人插件化工作台：需求与实现文档包

**版本：v1.0 评审稿 · 日期：2026-11-18 · 语言：中文**

本包依据本次会话编写。它定义产品需求、核心边界、插件契约、实施顺序和验收方法，不是已经实现或测试通过的软件。没有访问你的本地代码、模型服务或校园账户，也没有进行运行时性能实测。

## 先看什么

| 文档 | 用途 |
|---|---|
| [01 PRD](#prd) | 产品目标、已确认范围、工作区交互、功能和非功能需求 |
| [02 Q3：插件信任与安全](#trust) | 详细展开尚未决定的 Q3，区分信任、隔离、权限和开放分发 |
| [03 核心架构设计](#architecture) | 模块职责、参考技术路线、生命周期、存储和故障处理 |
| [04 插件契约与 SDK](#sdk) | Manifest、视图、命令、服务、任务、资源及宿主接口 |
| [05 实施计划](#plan) | 分阶段交付、建议目录、可执行任务与验证入口 |
| [06 验收与测试](#tests) | 需求追踪、正常与异常场景、发布检查 |
| [07 默认插件需求基线](#plugins) | 日程、待办、Whisper、OCR 的建议最低范围；后续插件边界 |
| [08 决策、假设与来源](#decisions) | 已确认事项、待审建议、决策门槛和官方资料 |

`contracts/` 提供可校验的 Manifest、工作区 JSON Schema；`examples/` 提供与契约对应的示例。它们是设计辅助材料，不是插件实现。

## 三种状态，不能混用

- **C｜已确认**：用户在会话中明确选择或提出的要求。实现不能擅自改变。
- **A｜建议基线**：为使文档可执行而补充的设计选择，尚未得到用户逐项确认。
- **O｜待决策**：会显著改变范围或实现的选项；达到相应实施门槛前必须决定。

PRD 的“完整”指范围、交互、异常、验收和未决事项均有明确归属，不代表所有业务插件的详细规格已经冻结。Q3、技术栈及业务插件最低范围仍有待审项；本包不把它们写成用户已同意的要求。

## 最新决定

| 问题 | 当前结果 |
|---|---|
| Q1 交付方式 | **C：分阶段交付**，先核心，再以可日常使用的业务插件完成产品 MVP |
| Q2 产品导航 | **A：工作区中心**，打开后进入上次的窗格工作区 |
| Q3 插件信任 | **待讨论**；02 文档展开 A/B/C 及推荐路径 |
| Q4 扩展范围 | **未作答**；上轮问题中的选择项未完整显示，不推定用户作过选择 |
| Q5 UI 自由度 | **C：混合模式**，提供统一组件和规范，允许插件自定义 UI |
| Q6 后台运行 | **B：应用运行期间持续工作**，不要求退出后的常驻执行 |
| Q7 插件协作 | **B：显式服务接口**，不使用宿主统一业务模型 |
| Q8 窗格能力 | 支持多套工作区保存；宿主不提供单窗格多标签，插件可自行实现内部标签 |

## 评审稿采用的临时基线

Q3 未决定前，只启用随附第一方与用户自写插件，关闭外部插件包安装入口。架构允许后续接入经用户明确授权的可信第三方插件，但不承诺安全执行任意不可信代码。该基线可以支持核心原型，不等于已经替你选择 Q3。

实现文档以 **Electron + TypeScript + React** 为参考路线，保留 Tauri 作为替代，均未定案。框架无关的 PRD、数据契约和测试要求应优先成立。移动端不强求复用桌面宿主与原生插件，只要求业务协议和数据结构不无故绑定 macOS。

## 文档使用规则

发现矛盾时，按“用户最新明确要求 → 本包 C 决策 → PRD → 契约 → 参考实现”处理。新增决定写入 08 文档，并同步更新需求、契约和验收用例。A 类数值是拟定工程预算，不是已测指标。

所有外部事实以 08 文档的官方来源为依据，核查日期为 2026-11-18；项目自身的方案与数值属于设计建议，不应误读为来源中的结论。


---

<a id="prd"></a>

# 个人插件化工作台 · PRD

**版本：v1.0 评审稿｜2026-11-18｜产品与核心需求**

状态标记：C 为用户确认；A 为建议基线；O 为待决策。实现细节见 03、04；Q3 专题见 02；验收见 06。

## 1. 产品定义

构建一个面向个人的、桌面优先的工作台，以可保存的多窗格工作区组织插件视图。宿主提供稳定的运行、呈现和通用能力，日程、待办、本地工具、项目及校园信息由自包含插件实现。

工作台不是终端应用，也不是必须围绕聊天、笔记或任务列表展开的应用。Wave Terminal 仅是窗格交互的可选参考，不作为产品整体原型。首页就是当前工作区，不额外设置强制经过的信息首页或应用启动页。

### 1.1 目标用户与真实场景

首要用户为应用开发者本人。已有本地 Whisper、OCR 等模型服务，希望集中调用；需要独立可用的日程和待办；项目文件已有分类，但项目进展与常用入口缺少组织方式；希望逐步接入校园作业、课件与考试信息。

Apple Calendar 和 Reminders 是当前使用工具与交互参考，不是 MVP 的必需数据后端。现有数据迁移、双向同步和校内网站对接，不应成为开发插件核心的前提。

### 1.2 成功标准

用户能够配置并保存多个工作区，重启后继续使用；通过默认插件独立管理日程与待办；通过工具插件完成文件处理并找回结果；新增业务插件主要通过 Manifest 和 SDK 接入，而非改动宿主业务代码。

核心可用与产品可用分别验收。示例插件能加载不等于产品 MVP 完成；日程/待办勉强展示数据也不等于独立可用。

## 2. 已确认决策与范围

| 维度 | 需求 | 状态 |
|---|---|---|
| 交付 | 核心验证后再完成业务插件，分阶段交付 | C：Q1 |
| 入口 | 工作区中心，默认恢复上次使用的工作区 | C：Q2 |
| UI | 宿主提供组件、主题与规范，允许插件自定义内容 | C：Q5 |
| 后台 | 插件工作独立于窗格，应用运行时可以持续 | C：Q6 |
| 协作 | 插件通过显式服务接口协作 | C：Q7 |
| 布局 | 横竖切分、调整、替换视图、多实例、恢复、位置调整、多套工作区保存 | C：Q8 |
| 标签页 | 宿主不提供单窗格标签组；插件内部标签自行管理 | C：Q8 |
| 平台 | MVP 优先 macOS；未来扩展 Windows、Linux、移动端 | C |
| 业务归属 | 日程、待办、项目等默认能力也由插件提供 | C |
| 信任与分发 | 第三方插件是否进入首版，尚未决定 | O：Q3 |

### 2.1 不在首版承诺内

多人协作、云账户与跨设备实时同步、公开插件市场、不可信原生代码沙箱、应用退出后的后台守护服务、宿主级标签组、浮动窗格和跨窗口拖动，不进入当前首版基线。也不建设通用 AI Agent 框架、完整文件管理器、完整浏览器或模型训练/推理引擎。

以上为范围控制建议 A；用户已有明确排除的标签组、退出后运行和浮动窗格除外。移动端定位另行设计，桌面插件不自动获得移动端可运行承诺。

## 3. 分阶段交付

| 阶段 | 交付内容 | 退出条件 |
|---|---|---|
| M0 架构验证 | 工作区模型、布局候选验证、插件视图/服务通信、信任边界评审 | 关键风险有证据；确定参考技术路线；未通过的方案不得视为已选 |
| M1 核心 MVP | 工作区、插件生命周期、SDK、任务中心、数据与恢复、诊断、安全基线 | 纯视图、后台任务、可选服务三个验证插件通过核心验收 |
| M2 产品 MVP | 独立日程、独立待办、本地处理工具；默认工作区与可用安装包 | 不依赖 Apple 数据源即可完成管理；至少一个真实本地服务闭环，第二类工具验证扩展 |
| M3 后续插件 | 项目、资料归档、校园信息、外部同步、Agent Session 专用适配 | 按独立插件规格评审，不回写为宿主业务特例 |

M2 中日程、待办是 C；工具数量、先接 Whisper 还是 OCR、项目/校园是否前移为 A。07 文档给出建议最低功能；这些范围在对应插件开工前确认，不阻塞框架无关的核心设计。

## 4. 概念和信息架构

**工作区**是命名的布局、视图实例与显示配置集合，不是数据隔离账户，不自动等于项目。切换工作区不会切换一整套日程数据库。

**插件**是功能包；**视图类型**是其可打开界面；**视图实例**是某个窗格中的一次呈现。同一插件可以提供多个类型，同一类型可以有多个配置不同的实例。

**资源引用**是可重新打开的对象定位，宿主不解释其业务含义。项目文件、Agent Session、网页门户可以由不同插件提供引用，再由未来的项目插件组合。

**Job（处理任务）**表示转写、识别、导入等正在执行的操作；**Todo（待办事项）**是用户的行动记录。二者不能混用同一状态机。

界面由工作区选择器、中央窗格区域、轻量全局操作入口组成。插件管理、设置、任务中心与诊断以辅助页面或面板出现，不将应用改成“先选应用再工作”的导航体系。具体侧栏/顶栏样式为 A，功能不依赖其摆放位置。

## 5. 主要用户流程

### 5.1 建立并切换工作区

首次启动进入一个可编辑默认工作区，提供添加视图入口。用户拆分窗格、选择插件视图、调整比例、配置显示范围并命名工作区。随后创建第二个工作区，可复制当前布局或从空布局开始；切换后仍可回到原配置。

复制工作区创建新工作区与视图实例标识，只复制配置和引用，**不复制日历事件、待办、文件或外部任务**。删除工作区只删除布局与实例配置，不删除业务数据、不取消处理任务。删除最后一个工作区后建立空的默认工作区，不陷入无入口状态。

### 5.2 使用同一个插件的多个视图

一个日程插件可在两个窗格分别显示周历与日程列表；两个列表也可筛选不同日历。视图配置彼此独立，业务修改在共享数据中反映。关闭某个视图不删除日程、不停止提醒服务。

### 5.3 执行本地工具任务

在工具视图选文件、选择已配置的本地服务、提交处理。宿主产生 Job 标识，提供状态和结果入口。用户关闭视图或切换工作区后，任务继续；从任务中心重新进入结果。失败时保留输入引用和错误摘要，不自动重复提交可能已执行的操作。

### 5.4 异常与恢复

重启先恢复宿主布局，再按需激活插件；暂时不可用的插件保留占位和原状态。业务数据损坏、状态版本不兼容与服务离线分别显示，不以“恢复失败”为由清空数据。异常退出后的任务首先核实真实状态，不假定继续执行，也不盲目重跑。

## 6. 功能需求

优先级 P0 为所属阶段必须满足，P1 为明确可延后。以下可验收规则与 06 文档一一对应。

### 6.1 工作区与视图

| ID | 要求与边界 | 阶段/状态 |
|---|---|---|
| F01 | 启动进入上次工作区；不存在时创建默认工作区；不强制打开独立首页 | M1/P0/C |
| F02 | 工作区创建、命名、复制、切换、删除、持久化；复制不克隆业务数据，删除不清除业务数据 | M1/P0/C+A |
| F03 | 在选定叶窗格左右/上下切分，调整分隔比例，关闭并合并区域；关闭最后一格保留空入口 | M1/P0/C |
| F04 | 调整窗格位置；同类型视图支持多实例且配置独立；错误拖放不丢失视图 | M1/P0/C |
| F05 | 每个宿主窗格只承载一个视图实例；宿主不提供标签组；插件内部可有标签，但不得操作其他窗格内部状态 | M1/P0/C |
| F06 | 提供设计令牌、主题和基础组件，允许自定义 UI；插件样式不得无意污染宿主或其他视图 | M1/P0/C+A |
| F07 | 保存布局、实例配置及版本化恢复状态；有价值输入须持久化或阻止破坏性离开；不可恢复状态保留原件并降级 | M1/P0/A |

切分受到当前可用空间和视图最小尺寸约束，“任意”表示可递归组合，不承诺无限小窗格。窗口不足时保留逻辑布局，提供聚焦当前窗格/滚动等降级，不静默删格。临时最大化不改写原比例；工作区切换只卸载/隐藏视图，不结束插件后台服务。

### 6.2 插件与运行能力

| ID | 要求与边界 | 阶段/状态 |
|---|---|---|
| F08 | 按 Manifest 发现插件、检查标识/版本/API/平台/依赖；外部包在 Q3 决定前不执行 | M1/P0/A；Q3 为 O |
| F09 | 可启用、停用、查看版本与状态；停用确认正在执行的任务；卸载默认保留数据；升级可暂存至重启生效 | M1/P0/A |
| F10 | 扩展点含视图、命令、设置、服务、Job 类型和资源打开器；仅提供受控导航位置，不允许任意改宿主结构 | M1/P0/A，补足 Q4 |
| F11 | 业务服务独立于视图；无视图时仍可提醒或处理；按需激活，后台需求由插件声明 | M1/P0/C |
| F12 | 统一 Job 状态、进度、结果和取消入口；支持幂等键；失败与状态未知分开；不要求任意任务可暂停/续传 | M1/P0/A |
| F13 | 关闭窗格不等于停用插件；切换工作区不等于结束 Job；退出应用时明确处理未完成工作，不承诺退出后执行 | M1/P0/C+A |
| F14 | 通过有名称、有版本、有参数约束的服务接口协作；必需/可选依赖分开；依赖失效时降级或报可解释错误 | M1/P0/C |

首版默认允许重启完成安装/更新，不要求热替换运行中的插件。处理任务的“取消”只有在实际确认后才进入 cancelled；仅停止等待远端响应不能被显示为已经取消远端任务。

### 6.3 数据与系统能力

| ID | 要求与边界 | 阶段/状态 |
|---|---|---|
| F15 | 宿主与插件数据分开；插件拥有业务结构与迁移；禁止以读取其他插件私有表作为公共接口；数据默认本地保存 | M1/P0/A |
| F16 | 支持版本化资源引用与打开器；文件、会话、URL 的定位与授权分离；来源失效时可重定位或回到原入口 | M1/P0/A |
| F17 | 宿主提供可查询的文件选择、系统打开、通知、剪贴板、凭据及平台适配入口；不支持的能力有明确返回 | M1/P0/A |
| F18 | 记录插件信任及能力声明；宿主接口执行范围检查、参数校验和身份绑定；可信代码模式不宣称恶意代码安全隔离 | M1/P0/A；Q3 为 O |
| F19 | 工作区导出/导入不自动安装插件或授予权限；备份、恢复先校验并保持原数据；凭据、原始文件副本不默认随布局导出 | M1/P0/A |
| F24 | 插件错误有归属、重试和诊断入口；安全模式禁止非核心插件执行；默认不上传遥测；日志不得包含令牌和原文正文 | M1/P0/A |
| F25 | 外部网页与文件内容不继承宿主特权；默认网页门户为资源链接；真正嵌入网页须采用单独隔离设计 | M1/P0/A |

### 6.4 默认业务能力

| ID | 要求与边界 | 阶段/状态 |
|---|---|---|
| F20 | 独立日程插件：无需外部账户即可创建、编辑、查询和删除事件，提供日历视图、持久化与基本提醒 | M2/P0/C；细项为 A |
| F21 | 独立待办插件：无需外部账户即可管理清单与事项，完成/恢复、到期查看、编辑和持久化 | M2/P0/C；细项为 A |
| F22 | Whisper 插件：配置已有服务、文件输入、任务状态、结果查看/导出；不自动安装模型或替换用户服务 | M2/P0 或 P1/A |
| F23 | OCR 插件：配置已有服务、文件输入、任务状态、结果查看/导出；具体支持格式由适配器声明 | M2/P0 或 P1/A |

M2 必须使 F22/F23 中至少一个真实接通，另一项至少完成不同服务能力的契约验证。两项均完整实接是建议目标，不假定用户已确认所有端点与格式。校园、项目和资料插件的细节在各自阶段讨论；资源引用与系统接口为它们预留通用接入点。

## 7. 关键交互规则

**保存语义。**布局变更自动保存；编辑业务数据以插件提交成功为准，界面必须区分“保存中/失败”。显式切换或退出应完成必要的状态刷盘。拖动中允许短暂防抖，拖动结束立即落盘。

**工作区与数据。**工作区只决定看见什么；同一用户配置下的日程、待办和任务记录不因切换工作区而变成独立副本。未来多账户/数据域另行设计。

**时间意图。**“今天”“本周”按当前时间重新计算；固定日期按所选日期恢复。全天事件保留日期语义，不简单转成零点 UTC。具体时区和重复规则由日程插件实现。

**关闭与退出。**A 基线：macOS 关闭主窗口后应用仍在运行，可继续应用内 Job；Cmd+Q 为退出。退出时有工作则提示“取消退出 / 停止并退出”，不得标注为继续在后台执行。外部服务可能独立继续，但只显示确知状态。

**插件内部导航。**插件自行管理内部标签、筛选与子页面，必须通过恢复状态接口保存有价值的导航。它们不应绕过宿主新增顶级窗口或抢占全局快捷键。

## 8. 非功能需求

以下预算均为 A，需在 M0/M1 实测后冻结，未在本文声称已达到。

| ID | 需求/建议阈值 | 测量与边界 |
|---|---|---|
| N01 | 参考机器 Apple Silicon、32GB；发布构建冷启动至可操作 ≤3秒，8窗格恢复 ≤5秒；暖工作区切换 p95 ≤500ms | 30次启动、100次切换；不包含模型载入或远端响应；单列冷/热缓存 |
| N02 | 常规布局拖动 p95 帧耗时 ≤32ms；空工作台全进程 RSS ≤500MB，8个轻量视图 ≤900MB | 以30分钟空闲及8工作区压力场景记录；包括宿主与插件进程，不含独立模型服务 |
| N03 | 已确认保存的数据在强制终止测试后可恢复；损坏布局不覆盖原件；可离线使用本地日程与待办 | 断电式测试、迁移失败、磁盘满、服务断连；不承诺尚未持久化输入零丢失 |
| N04 | 键盘可完成工作区切换、视图选择、聚焦、关闭与命令；可辨焦点，支持主题、缩放和系统辅助功能基础语义 | 手工辅助技术检查；插件自定义 UI 也遵守最低标准 |
| N05 | 核心数据与 SDK 不依赖 macOS 路径/系统对象；平台能力可检测；缺失能力可降级 | 当前仅验收 macOS；Windows/Linux 先做核心单测；移动端不设首版交付目标 |
| N06 | 最小权限接入、凭据保护、无默认遥测、外部内容不执行、错误可定位；锁定依赖并有升级检查 | 安全检查与威胁模型验证；可信代码的恶意行为不在权限隔离承诺内 |

## 9. 发布门槛

M1 要求全部核心 P0 通过、支持真实关闭/重启/插件失败场景，并验证新增示例插件不修改宿主业务分支。M2 还须通过日程、待办及真实工具闭环；不得用全为模拟数据的演示作为产品验收。

发布必须交付安装包、默认插件、配置与数据位置说明、已知限制、备份恢复说明。第三方安装、强沙箱、云同步等尚未决定能力不得通过 UI 暗示已经支持。

## 10. 尚未冻结的事项

Q3 信任等级、Q4 扩展点建议、技术栈、性能预算以及默认插件详细基线为待审项。02/08 文档给出影响与门槛。它们不是重复询问已明确需求，也不要求现在设计所有业务插件。

本文不绑定 Dockview 等具体组件，也不把某个库的私有序列化格式当作工作台公共数据格式。


---

<a id="trust"></a>

# Q3 专题：插件信任、权限与运行边界

**版本：v1.0 评审稿｜2026-11-18｜状态：Q3 尚未最终选择**

这份文件回答的不是“插件是不是开源”，而是：允许谁的代码进入应用、代码获得哪些实际权限、发生错误或恶意行为时能够限制到哪一步，以及为此愿意承担多少实现成本。

## 1. 四个相互独立的问题

| 维度 | 需要区分的含义 | 常见误解 |
|---|---|---|
| 来源与信任 | 第一方、自写、审查后第三方、未知来源 | “开源”不等于已审查；AI 生成也不等于可信 |
| 分发 | 随附、开发目录、本地包、在线仓库/市场 | 支持插件系统不等于必须做插件市场 |
| 故障隔离 | 一段代码报错、卡死或崩溃是否拖垮其他部分 | 独立进程可以改善故障边界，但不自动限制文件与网络权限 |
| 权限隔离 | 是否能阻止代码执行未授权操作 | Manifest 声明、开发约定或样式隔离不是完整安全边界 |

VS Code 官方说明其 Extension Host 拥有与应用相同的权限，扩展可访问文件、网络和外部进程。因此不能因“参考 VS Code 的 Extension Host”就声称插件受严格沙箱限制。[S01]

## 2. A / B / C 方案展开

### A. 仅第一方及用户自写插件

**产品含义：**日程、待办、OCR 等都通过同一插件接口接入，但只执行随附、自己写或自己审查过的代码。不开放第三方包安装作为日常功能。

**实现收益：**可以复用宿主 UI 组件，直接调用明确的业务服务接口，用独立进程处理需要退出/重启的后台工作；无需先完成公共市场和恶意插件防御平台。

**仍然需要的保护：**远端网页不获得宿主权限；文件与网页输入不能执行脚本；日志不记录令牌；有备份、迁移失败保护和错误归属。自写插件仍可能包含依赖漏洞、路径错误或意外删除逻辑。

**不承诺：**把恶意自写代码放进宿主后还能保护宿主全部数据。代码进入受信任执行环境，本身就是一个信任决定。

**适用：**首要目标是为自己持续增加功能，不急于使用不认识的人发布的二进制插件。

### B. 支持用户明确信任的第三方插件

**产品含义：**允许安装外部包，但安装时清楚告知来源、版本、变更、所需能力及“此插件运行于可信代码模式”。用户主动授权后执行，不以“点击了文件”视为授权。

**额外成本：**包格式、完整性校验、来源与信任记录、依赖关系、更新风险提示、重启启用、卸载与数据保留、诊断和恢复。每个新版本可能改变依赖或请求更广能力，不能只信任一次后无限升级。

**推荐边界：**通过宿主 SDK 的调用仍检查命名空间和范围；插件后台进程按身份绑定通信通道。它们有助于减少误用、追踪操作和未来迁移，但如果后台拥有 Node.js/原生执行能力，其绕开 SDK 的行为不能仅靠 API 检查阻止。

**不承诺：**用户安装的恶意第三方插件无法窃取文件或其他插件数据。必须把这一剩余风险写在安装与开发文档中，而不是只写“最小权限”。

**适用：**后续有少量可信作者或自己审过代码的插件，希望复用，而不建设浏览器级扩展沙箱。

### C. 允许不可信第三方代码，在运行时强制约束

**产品含义：**即使作者有恶意，也期望插件只能访问已授予的文件、网络目标和服务。需要明确威胁模型、可信计算基、沙箱逃逸风险和安全测试。

**必要的架构变化：**不可把未知 UI 模块直接导入宿主同一 JS 环境；不能给未知后台代码完整 Node.js/原生 API；需要独立受限执行环境、不能伪造的调用方身份、资源额度和受控系统代理。纯 UI、Web Worker/WASM、原生扩展具有不同边界，不能都叫“沙箱插件”。

**成本不仅是多一个进程：**还包含网络出口、文件句柄、进程创建、跨插件授权传递、后台任务、更新链、依赖供应链、资源耗尽及各平台差异。原生/Python 工具不能直接继承纯 Web 插件的安全承诺。

Node.js 官方明确指出 `node:vm` 不是安全机制，不应用它运行不可信代码。[S05] Electron 的 renderer 沙箱和 context isolation 是重要防护，但仍需安全的 preload/IPC；暴露过宽的桥接接口会破坏边界。[S02][S03][S04]

**适用：**产品已明确要接收未知开发者的代码，并愿意把安全平台作为首版核心工程，而不是后续附加开关。

## 3. 对本项目的推荐：A 起步，预留 B，不宣称已经拥有 C

这是建议，不是用户已确认的 Q3 答案。

| 时点 | 建议运行策略 | 允许推进的工作 |
|---|---|---|
| Q3 未决定 / M0 | 只执行第一方和用户自写插件；外部安装入口关闭 | 需求、通用契约、布局、持久化和第一方验证插件 |
| M1/M2 默认基线 | 同 A；按 SDK 建立清楚的生命周期与能力记录 | 完成日程、待办、本地工具的真实使用 |
| 用户明确选择 B 后 | 增加外部包安装、信任确认、审计与升级流程 | 使用经过信任决策的第三方插件 |
| 用户明确选择 C 后 | 先修改 ADR 与运行协议，独立受限 UI/后台验证通过后才开放 | 不以现有可信插件架构直接“开启安全模式” |

建议的原因：本项目目前明确需求是自己组合工具和日常功能，没有明确提出公开市场或执行任意来历代码。先完成真正可用的个人工作台，更符合当前目标。保留串行化接口、能力检测和插件身份，为后续迁移降低成本，但不保证迁移 C 无需重写。

## 4. 可信模式也必须做的控制

### 4.1 插件安装与更新

本地包只包含预构建资源、Manifest 与依赖说明；安装阶段不运行 `postinstall` 或联网下载并执行脚本。校验解压路径、符号链接、包大小、重复路径、API 兼容和内容哈希，再暂存至下次启动。

包哈希能检测内容变化，只有经过可信分发渠道或签名验证才能进一步证明来源；二者均不能证明代码没有恶意。插件不得通过自己的 Manifest 自封为“已信任”，信任记录由宿主保存。

启用新版本前备份其业务数据和迁移元数据。代码回滚不等于数据库回滚；已经升级的数据若不向后兼容，要恢复对应备份或保持插件停用，不能拿旧代码硬读新库。

### 4.2 系统能力与调用方身份

对宿主代理提供文件选择、文件授权引用、凭据句柄、通知、网络、外部进程等能力。Host 依据实际通道/运行实例绑定 caller；不能相信 RPC 参数里的任意 `pluginId`。

可信插件共享 renderer 时，插件间并没有强身份隔离：恶意脚本可能干预同一 JS 上下文。此处的名称空间与令牌主要防止误用，不能作为对未知 UI 代码的防护承诺。

后台进程通道、插件实例世代号和服务调用来源应一并记录。服务调用不能隐式把高权限提供者变成低权限调用者的任意文件读取器；跨插件委托必须显式传递授权范围，必要时再次向用户确认。

### 4.3 文件、网络与凭据

文件路径不是授权。文件选择生成宿主管理的引用和范围；打开时仍处理文件搬移、权限撤销、符号链接和路径逃逸。对 broker 操作重新核验真实目标；该检查不等于限制可信原生代码自行读文件。

网络请求记录目标来源与用途。重定向不能扩大已授权目标；loopback 连接精确到协议/主机/端口，不把“本地服务”视为任意内网访问许可。密钥不进入 renderer 的视图状态、工作区导出或日志。

macOS 凭据可以通过 OS 保护机制实现。Electron safeStorage 的保护语义依平台而异；其文档指出 Linux 的 `basic_text` 后端不提供等同安全的保护。因此未来 Linux 支持不得静默降级为明文或固定密码保护。[S14]

### 4.4 远端内容与校园登录

网页门户首版默认打开系统浏览器；校园插件采用专门认证与数据读取逻辑。外部 HTML、课件内容、模型结果都按不可信输入处理，不以 `innerHTML` 或动态脚本方式直接塞入高权限宿主环境。

以后嵌入网页时，应采用无宿主桥接的独立浏览上下文、受控导航/新窗口/下载和独立会话配置。系统浏览器不能嵌入的页面不通过关闭站点安全策略强行显示。Electron 的官方安全建议包括关闭远端内容 Node 集成、启用上下文隔离、验证 IPC 来源等。[S02]

## 5. 威胁与责任矩阵

| 风险 | A/B 基线措施 | 能否声称完全防御 |
|---|---|---|
| 插件普通异常 | 错误边界、任务失败归属、后台进程重启、保留数据 | 否；无限循环和 renderer 崩溃仍可能影响同进程 UI |
| 恶意可信原生插件 | 安装前信任、来源与升级检查、提示剩余风险 | 否；不承诺强沙箱 |
| 外部网页利用宿主桥接 | 不授予桥接、独立上下文、导航/IPC 校验 | 降低风险，仍需保持依赖更新 |
| 文件/工作区导入攻击 | Schema、路径/大小检查、纯数据导入，不自动执行插件 | 应通过专门负面测试 |
| 误删或迁移失败 | 事务、备份、数据保留和失败停用 | 提供恢复路径，不承诺所有硬件损坏均可恢复 |
| 密钥进入日志或备份 | 凭据句柄、脱敏、默认排除凭据、导出预览 | 需自动扫描与人工核查 |
| 本地服务冒充或接口变更 | 显式端点、健康检查、认证支持、版本能力检测 | 不把回环地址等同可信身份 |
| OS/框架或依赖漏洞 | 依赖锁定、更新审查、最小暴露与发布检查 | 不承诺抵御所有零日漏洞 |

Tauri 的 capability 系统也不能防护恶意 Rust 代码、过宽 scope、错误检查和供应链攻击；更换框架本身不会替代本项目的信任模型设计。[S06]

## 6. 只需由用户决定的核心选项

最终需要选择的是：首版仅面向自写/第一方代码，还是也开放用户主动信任的第三方包；是否真的要求对未知代码强制隔离。其余如错误提示、哈希校验、记录来源和备份，不应因选 A 就省略。

**建议答复可为：“首版 A，接口预留 B，C 不纳入当前产品承诺”。**若选择 B，外部安装和更新流程进入首版验收；若选择 C，运行环境与 UI 执行边界必须先重评，不能照搬本文的可信模式实现计划。

来源编号对应 08 文档；本文件中的方案选择、职责划分与风险取舍为项目设计建议。


---

<a id="architecture"></a>

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


---

<a id="sdk"></a>

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


---

<a id="plan"></a>

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


---

<a id="tests"></a>

# 验收计划、测试矩阵与发布证据

**版本：v1.0 评审稿｜2026-11-18｜测试尚未执行**

本文件定义未来的软件验收，不是测试报告。文档包的链接/Schema 校验只能证明交付材料内部一致，不能证明应用功能通过。

## 1. 测试层次与样本

单元测试覆盖布局变换、ID/引用完整性、状态机、契约校验和日期逻辑；集成测试覆盖后台进程、服务通信、持久化与系统代理；E2E 覆盖真实窗口和跨插件闭环；人工验证覆盖原生权限、通知、辅助技术和打包后的 OS 行为。

固定样本包括：8个工作区、12窗格复杂布局、同视图多实例；纯 UI/后台 Job/可选服务三个 fixture 插件；具备 query/cancel 与仅同步返回两类工具服务；多种版本的 workspace/view state/database；含密钥样本标记但不含真实密码的敏感数据检测集。

工具网络测试默认使用受控本地 fixture，不连接校园真实账户。最终工具 E2E 必须补充真实服务与脱敏文件证据。时间测试固定 Clock 与时区数据库版本，覆盖全天、跨日、夏令时转换、月末和重复例外，不依赖测试运行当天。

## 2. 功能追踪矩阵

每行至少实现表中正常及异常断言；AT 编号与 PRD ID 绑定。若变更需求，先同步本表，再修改测试。

| 验收 ID / 需求 | 操作与应有结果 | 必须覆盖的异常 | 实施任务 |
|---|---|---|---|
| AT-F01 / F01 | 启动恢复最后工作区；首次进入默认工作区 | 当前工作区被删除/记录损坏时保留原件并回退 | T02/T03/T08 |
| AT-F02 / F02 | 新建/命名/复制/切换/删除均持久；副本 ID 独立、引用相同 | 删除最后工作区仍有空入口；业务表计数和 Job 数不改变 | T02/T08 |
| AT-F03 / F03 | 横竖递归切分、比例调整、关闭合并正确 | 空间不足、非法比例、关闭最后格均不丢入口 | T02/T03 |
| AT-F04 / F04 | 拖动移动和同视图多实例独立筛选 | 无效拖放还原；一个实例销毁不释放另一实例订阅 | T02/T03 |
| AT-F05 / F05 | 每格只有一个宿主视图；插件内部标签正常 | 宿主无标签组入口；内部标签状态不会写坏布局树 | T03 |
| AT-F06 / F06 | 自定义 UI 使用主题/缩放；常用组件可复用 | 插件样式误用不污染其他视图；键盘焦点可辨 | T03/T13 |
| AT-F07 / F07 | 布局、配置、版本化 state 重启恢复 | 草稿拒绝关闭、snapshot 报错、旧版本 payload 保留且降级 | T03/T08 |
| AT-F08 / F08 | 合法 Manifest 发现、兼容检查、按需载入 | 扫描不执行代码；冲突 ID/依赖环/外部包信任不足被拒绝 | T01/T04/T09 |
| AT-F09 / F09 | 启停、版本显示、待重启升级、卸载保留数据 | 活动 Job 确认；升级失败不清库；卸载后业务数据仍可恢复 | T04/T08/T09 |
| AT-F10 / F10 | 视图/命令/设置/服务/Job/资源按声明注册 | 未声明贡献、注册冲突、任意导航注入被拒绝 | T01/T04/T05 |
| AT-F11 / F11 | 关闭全部视图后后台服务仍 active | 纯 UI 插件不启动无用后台；重复激活只发生一次 | T04/T07 |
| AT-F12 / F12 | 任务中心追踪 Job、结果与取消请求 | 幂等键冲突、未确认取消、未知状态、重启不重复提交 | T07/T12 |
| AT-F13 / F13 | 关格/切区不停止 Job；Cmd+Q 明确结束策略 | 拒绝退出保留工作；超时标 interrupted/unknown 而不是成功 | T07/T08 |
| AT-F14 / F14 | 服务版本匹配、必需与可选依赖、正常协作 | 依赖缺失/重启、多提供者、超时与委托授权不扩权 | T05/T06 |
| AT-F15 / F15 | 宿主/插件存储分离，本地离线可用 | 默认插件不能 import 宿主私有 DB；其他插件私有表不作为接口 | T01/T08/T10/T11 |
| AT-F16 / F16 | 引用打开正确视图；工作区保存 opaque 引用 | 文件搬移、来源插件缺失、对象消失均可解释，不把路径当授权 | T05/T06 |
| AT-F17 / F17 | 文件、通知、剪贴板、凭据等通过适配器使用 | 用户拒绝/平台不支持返回明确状态，不能伪成功 | T06/T13 |
| AT-F18 / F18 | 信任/能力记录及 API 检查生效，调用身份来自通道 | 伪造 pluginId、越界句柄拒绝；安装文案不宣称强沙箱 | T06/T09 |
| AT-F19 / F19 | 布局导出导入、备份恢复、重复导入不覆盖原件 | 导入不执行插件；凭据不导出；损坏备份拒绝且保留现有数据 | T08 |
| AT-F20 / F20 | 无 Apple 账户离线完成事件 CRUD、视图与提醒 | 全天/跨时区/重复例外、通知拒绝、重启和保存失败 | T10 |
| AT-F21 / F21 | 无 Reminders 账户完成清单/事项、完成恢复与筛选 | 日期无时间语义、清单移动不复制、重启和数据删除确认 | T11 |
| AT-F22 / F22 | Whisper 输入→真实服务→Job→结果→导出 | 无查询/取消接口、断连、重复点击、输出时间戳缺失 | T12 |
| AT-F23 / F23 | OCR 输入→服务→Job→文字→导出 | 不支持格式、多页部分失败、空结果、用户取消 | T12 |
| AT-F24 / F24 | 错误来源、重试、日志、安全模式正常 | 恶性重启循环受限；日志无 token/正文；安全模式不运行插件 | T04/T09/T13 |
| AT-F25 / F25 | 网页门户安全外开；不可信内容不获得 bridge | 恶意 scheme、远端脚本、跨 frame IPC、HTML 注入拒绝 | T06/T13 |

## 3. 非功能追踪

| 验收 ID / 需求 | 方法与门槛 | 证据 | 实施任务 |
|---|---|---|---|
| AT-N01 / N01 | 发布构建冷启动30次、切区100次；按 PRD 的 A 类预算评估 | 原始计时、硬件/OS/构建/数据量、p50/p95 | T00/T13 |
| AT-N02 / N02 | 8工作区/8活动轻量视图/3后台服务；拖动与30分钟空闲 | 全进程 RSS、CPU、帧耗时曲线；独立模型另列 | T00/T13 |
| AT-N03 / N03 | 强杀、磁盘满、权限撤销、损坏 JSON、迁移失败与离线 | 不变量断言、原数据保留位置、恢复记录 | T08/T10/T11 |
| AT-N04 / N04 | 全程键盘完成核心动作，主题/缩放/系统辅助技术检查 | 手工检查记录与截图；不只依赖自动可访问性扫描 | T03/T13 |
| AT-N05 / N05 | contracts/workspace/domain 单测在多 OS CI；能力缺失模拟 | CI 与平台适配结果；macOS 打包手测 | T01/T06/T13 |
| AT-N06 / N06 | 权限、桥接、脱敏、导入、依赖边界、默认无遥测检查 | 安全负面测试、依赖锁文件、已知限制 | T06/T09/T13 |

N01/N02 的数值是拟议预算，未确认前不作为已冻结 SLA。若实测调整预算，必须同时修改 PRD 与 ADR，保留原始结果。

## 4. 必须单列的故障注入

### 4.1 远端接受之后，本地记录之前崩溃

先让 fixture 服务记录已接受的请求，再在本地 externalId 持久化前终止插件进程。重启后，若有端到端幂等键则查询/对账；若不能判断则展示 unknown，不再次自动提交。确认远端请求计数没有因宿主重启增加。

### 4.2 关闭、停用与退出

开始一个30秒 fixture Job，关闭该窗格并切换工作区；Job 继续。选择停用插件时提示受影响任务；取消操作则继续；确认停止则等待真实确认。Cmd+Q 取消退出应保留窗口和任务；确认退出后不得展示“后台继续”误导用户。

### 4.3 视图状态损坏与业务数据保护

把某视图 stateVersion 改为未知高版本，确保宿主加载其他窗格，异常视图保留原始 payload 与恢复入口。不得清空插件业务库。删除工作区也不能影响事件、待办和 Job 数据量。

### 4.4 数据库迁移失败

在迁移中途抛错、模拟磁盘满和失败校验。原数据仍可读取或从验证过的备份恢复；旧代码不得直接打开不兼容的新 schema；升级失败不以空库伪成功。

### 4.5 外部内容与可信插件边界

以不可信网页、HTML 结果、工作区导入包和越界路径分别尝试调用宿主能力，应被拒绝。另行记录“可信 Node 插件可绕过 broker”的剩余风险，不把本项目未承诺的 C 类防御写成通过或不适用而隐藏。

### 4.6 多实例与资源泄漏

同类视图开两个实例，连续100次切换/关闭/重开，检查实例订阅数、后台进程数和 Job watch 数。结束后回到预期稳态；一个视图 dispose 不影响另一视图。使用内存时间序列判断增长，不只比较两次截图。

## 5. 三条端到端验收脚本

**E2E-A 工作区。**新建“日常”和“工具”两区；日常放日程与待办，工具放两个不同配置工具视图；调整并复制工作区；重启恢复；删除副本；检查业务数据和任务仍在。全程无宿主标签组。

**E2E-B 个人安排。**离线创建一个定时和一个全天事件，创建待办、安排日期、标记完成再恢复；换视图、重启；到点提醒；应用未运行期间只展示真实错过状态，不承诺已发送。

**E2E-C 文件处理。**用真实服务处理脱敏文件；处理中关闭视图并切区；从 JobCenter 找回结果；导出；资料插件存在时登记引用，不存在时仍能完成。断连重试不制造无提示重复任务。

## 6. 发布完成定义

M1：全部核心 P0、AT-F01–F19、AT-F24/F25 及适用 N 项通过；默认外部安装关闭；三个 fixture 插件证明多实例、后台与显式协作；宿主无日程/待办业务分支。

M2：在 M1 基础上 AT-F20/F21 全通过，F22/F23 至少一个真实实接且另一个完成不同能力的契约验证；若承诺两个均实接则二者都必需真实证据。默认工作区、安装包、备份指南和已知限制交付齐全。

任何数据丢失、未授权代码执行、静默副作用重放、退出语义不实、凭据泄漏均阻断发布。非阻断缺陷需列明影响和绕行办法。

## 7. 测试报告模板

每次执行记录：构建号/提交、依赖版本、测试平台与样本、需求 ID、测试 ID、通过/失败/阻塞、复现步骤、实际结果、证据路径、相关缺陷、审核者。未执行写“未执行”，不写“待验证通过”。

本次交付只进行文档包与契约样例一致性验证，结果在根目录 `DOCUMENT_VALIDATION.md` 中记录；不得将其误读为上述软件测试结果。


---

<a id="plugins"></a>

# 默认插件的产品 MVP 基线

**版本：v1.0 评审稿｜2026-11-18｜状态：A 类建议，独立日程/待办目标为 C**

本文件不是提前替你决定所有业务插件细节，而是为“完整可用”提供可讨论、可验收的最低边界。核心架构不依赖这些业务对象；具体交互设计与扩展范围在插件开工前进一步确认。

## 1. 优先级总表

| 插件 | 当前地位 | 产品 MVP 建议 |
|---|---|---|
| 日程 | 已确认独立可用、作为插件 | 必交付；不依赖 Apple Calendar |
| 待办 | 已确认独立可用、作为插件 | 必交付；不依赖 Reminders |
| Whisper / OCR | 已明确希望整合已有服务 | 至少一个真实完整闭环；另一个验证扩展，均完整实接为目标 |
| 项目 | 有需求，形态待讨论 | 后续独立规格；可先提供资源入口验证，不先建立复杂项目系统 |
| 资料入口 | 轻量管理/归档 | 不阻塞核心；可作为工具结果的可选消费者 |
| 校园 | 明确后续集成目标 | 按来源、认证和数据更新逐步增加，不假定单接口覆盖全部 |
| Apple 集成 | 当前数据来源与交互参考 | 导入/只读连接/双向同步分别评估，不作为独立功能前提 |

## 2. 日程插件

### 2.1 建议必需能力

本地创建与管理多个日历，名称、颜色、显示开关可配置。事件可创建、查看、编辑、删除，支持标题、说明、地点、开始/结束、全天/定时、所属日历和基本提醒。至少提供月、周与日程列表视图，日视图可作为周视图聚焦实现。

支持最常用重复规则：按日、周、月、年及间隔，结束条件为从不/截止日期/次数；支持修改/删除本次或整个序列。复杂 RRULE 全量编辑、邀请会议、参与者协作、自然语言解析与“本次及之后”拆分可以后续增加。

“完整”指能独立完成个人基础日程管理，不表示复制 Apple Calendar 的所有功能。重复规则是否全部进入 M2，应在日历插件立项时确认；未确认前不把复杂同步与全部历法规则加入核心。

### 2.2 建议数据边界

```text
Calendar: id, name, color, visible
Event: id, calendarId, title, description, location,
       temporalSpec, recurrenceSpec, reminderSpec,
       createdAt, updatedAt, revision
OccurrenceException: seriesId, occurrenceKey, override / excluded
```

`temporalSpec` 区分全天日期范围和带时区的定时事件；不把全天事件转换成固定 UTC 零点。重复事件按本地墙上时间和时区规则计算，不通过固定秒数累加生成全部实例；跨夏令时、月末和闰年边界必须有固定测试。

建议对月度的无对应日期默认跳过而非截断，界面说明；夏令时不存在/歧义时间需要提示或有明确策略。数据层规则先与库的实际行为核对，不能让 UI 和持久化使用不同解释。

### 2.3 提醒与应用生命周期

提醒服务独立于日历视图，应用运行时按计划触发；用户关闭所有日历窗格后仍有效。应用退出期间不承诺提醒送达，重新启动展示错过提醒的摘要，避免一次性大量重复弹窗。

系统通知拒绝时保留应用内提醒状态。提醒标识按 event/occurrence/reminder 组合，防止视图多实例或服务重启导致重复通知。后台权限和定时精度不在本 PRD 中做未验证的系统级保证。

### 2.4 关键验收

离线新建事件、重启后仍在；两个视图看到同一修改；全天事件切时区不变日期；重复单次修改不改变其他实例；关闭日历视图仍可提醒；保存失败不显示成功；删除工作区不删除事件。

Apple Calendar 对接、ICS 导入/导出、外部订阅是独立适配层。第一轮可以不做双向同步，后续必须处理来源标识、冲突、删除传播和幂等，而不是简单定期覆盖。

## 3. 待办插件

### 3.1 建议必需能力

清单的创建、命名、排序、归档；事项创建、修改、完成、恢复和删除；标题、备注、所属清单、截止日期/可选时间、优先级；支持今天、计划内、已完成以及自定义清单视图。支持基本排序筛选、应用内提醒和本地持久化。

建议提供一层子任务或检查清单，但属于待审范围；多层层级、复杂依赖、协作指派、工时、自动化规则和复杂重复任务不进入默认首版承诺。标签和重复任务可以按实际频率决定是否前移。

### 3.2 建议数据边界

```text
TaskList: id, name, order, archived
TodoItem: id, listId, title, notes, status,
          dueDate?, dueTime?, timeZone?, priority,
          parentId?, order, completedAt?, createdAt, updatedAt, revision
```

无时间的截止日期与精确截止时间分开表达；用户手动标记完成与外部平台“已提交”不能混成同一字段。提醒并不自动把任务变成日历时间块。

### 3.3 关键验收

不连接 Reminders 也可完成完整流程；完成后可恢复；移动清单不复制事项；两个视图各自筛选但共享业务修改；重启后顺序和状态保持；截止日期跨时区不意外变更；删除工作区不影响事项。

日历联动是可选服务：用户可把某项任务安排到某时段，但截止日期不自动等同工作安排。日历插件不存在时待办仍可运行。

## 4. 本地工具插件：Whisper 与 OCR

### 4.1 共同流程

配置已存在的服务 → 检查连接与能力 → 选择文件 → 设置参数 → 提交 Job → 查看状态 → 查看/修订/导出结果 → 可选登记到资料插件。

插件不接管模型下载和服务安装，除非后来明确增加。也不假设 Whisper/OCR 的 HTTP 路径、认证、异步任务或结果格式一致；用适配器声明：支持输入格式、同步/异步、查询能力、取消能力、输出类型与大小限制。

### 4.2 Whisper 建议范围

音频/视频支持取决于现有服务；基础语言参数和输出文本；有时间戳时可导出 SRT/VTT，没有则仅提供文本并解释限制。结果编辑需要草稿保护。服务没有异步 taskId 时不能声称重启后一定能续传或重连。

### 4.3 OCR 建议范围

图片输入与文字结果是最低闭环；多页 PDF、版面坐标、表格和可搜索 PDF 仅在后端提供且经过适配验证时暴露。不同页面可失败，但应保留已完成结果与失败页信息，不整批静默丢弃。

### 4.4 关键验收

关闭视图、切换工作区不取消处理；服务离线与认证失败区分；未知进度不用虚假百分比；没有取消能力时不假装远端已停止；导出路径由用户选择；文件结果不进入工作区 JSON；重复点击不创建重复远端任务。

至少一个工具必须使用真实本地服务和脱敏测试文件完成 E2E。另一个可以先用契约服务验证扩展，但发布说明必须说明哪些已经实接，哪些仍是适配示例。

## 5. 项目、资料与常用页面：预留而不抢先定型

项目可能是资源入口集合，也可能管理目标、阶段、进度和任务；当前尚未选择。不能以“支持项目插件”为由把 projectId 强塞进每个宿主对象。

可以先验证三类资源：文件/目录引用、Agent Session 引用、网页门户引用。未来项目插件记录这些 ResourceRef，调用提供者打开，不解析它们的私有格式。Agent Session 的“入口”不等于保证恢复某个第三方 Agent 的运行过程，需要专门适配。

资料插件默认引用原文件，归档副本是明确操作。文件搬移应支持重新定位；索引记录不冒充原始内容备份。OCR/Whisper 在资料插件缺失时仍可导出自己的结果。

## 6. 校园与 Apple 集成的后续规格要点

校园作业、课件、课程表和考试安排逐项确认来源；认证、会话过期、更新频率、去重、来源跳转和数据缓存分别定义。只读信息展示与提交作业/修改资料等写操作分开，不能默认代理用户执行后者。

Apple 集成区分单次导入、持续只读与双向同步。每一层有独立验收，不把“可访问系统日历”当作已经实现冲突处理。平台不可用时本地业务插件仍工作。

## 7. 单个插件立项模板

每个正式插件规格至少包含：使用场景与非目标、视图/命令、业务数据所有权、持久化和迁移、系统能力与敏感信息、服务依赖、任务和关闭行为、离线与异常、导入导出、恢复状态、验收用例、支持平台及已知限制。模板不要求所有插件都提供所有扩展点。


---

<a id="decisions"></a>

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


---

<a id="validation"></a>

# 文档与契约一致性校验

日期：2026-11-18。范围仅为本交付文档与契约样例；不是应用软件测试结果。

- 通过：plugin-manifest.schema.json: schema有效，whisper.manifest.json 通过结构校验。
- 通过：workspace.schema.json: schema有效，workspace.json 通过结构校验。
- 通过：Manifest 负例：父目录、绝对路径、网络入口、反斜杠入口均拒绝（5项）。
- 通过：Manifest 负例：插件自带 trusted 标记被拒绝。
- 通过：Workspace 负例：非法分隔比例被拒绝（4项）。
- 通过：Workspace 示例语义：pane/实例 ID 唯一，引用完整，活动 pane 存在。
- 通过：9份 Markdown：围栏配对、显式相对链接指向存在文件。
- 通过：需求追踪：31项（25功能+6非功能）全部有对应验收行。
- 通过：来源编号：18个使用编号全部在18项官方来源清单中定义。
- 通过：TypeScript 声明：tsc --noEmit --strict --lib ES2022,DOM 通过（仅接口声明）。

- 通过：离线阅读版以 Chromium 内存载入渲染，180 个唯一锚点与 45 个内部链接无缺失；11 个章节、24 个表格、16 个代码块均进入 DOM；无 JavaScript 错误。
- 通过：1440px 桌面与 390px 窄屏无全页横向溢出；桌面首页、验收章节与窄屏布局已目视检查。
- 环境说明：容器浏览器限制 file URL 导航，因此视觉核查使用同一 HTML 的内存载入，不包含各用户系统的本地文件策略测试。

未执行：Electron/Tauri 原型、布局组件运行、本地服务连接、校园对接、性能、安全渗透、默认插件功能及任何产品验收测试。实现计划中的命令是未来执行入口，不是本次测试日志。


---

<a id="appendices"></a>

# 附录：契约与样例

这些是声明和校验样例，不包含应用或插件运行代码。

## contracts/plugin-api.d.ts

```typescript
/** Design contract v0.1.0. Declarations only: no runtime implementation. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Disposable { dispose(): void | Promise<void> }
export interface ResourceRef {
  providerId: string;
  kind: string;
  resourceId: string;
  version: number;
  label?: string;
}
export interface ViewSnapshot { version: number; payload: Json }
export type CloseReason = 'pane-close' | 'workspace-switch' | 'plugin-disable' | 'app-quit';
export type CloseDecision = { allow: true } | { allow: false; message: string };
export interface CallOptions {
  timeoutMs?: number;
  signal?: AbortSignal; // Local SDK only; transport converts to cancellation messages.
  idempotencyKey?: string;
}
export interface ServiceClient {
  call<T extends Json = Json>(method: string, params: Json, options?: CallOptions): Promise<T>;
  dispose(): void;
}
export interface ServicesApi {
  resolve(serviceId: string, versionRange: string, options?: { optional?: boolean }): Promise<ServiceClient | null>;
}
export interface ViewContext {
  readonly pluginId: string;
  readonly workspaceId: string;
  readonly instanceId: string;
  readonly config: Json;
  readonly restoredState: ViewSnapshot | null;
  readonly resource: ResourceRef | null;
  readonly services: ServicesApi;
  readonly jobs: JobsApi;
  readonly capabilities: CapabilityApi; // UI-safe subset enforced by the host.
  saveConfig(value: Json): Promise<void>;
  saveState(value: ViewSnapshot): Promise<void>;
  reportError(error: { code: string; message: string; traceId?: string }): void;
}
export interface ViewController extends Disposable {
  snapshot(): Promise<ViewSnapshot>;
  canClose(reason: CloseReason): Promise<CloseDecision>;
  updateConfig(config: Json): Promise<void>;
  setVisible(visible: boolean): void;
  resize(width: number, height: number): void;
}
export interface ViewFactory {
  mount(container: HTMLElement, context: ViewContext): Promise<ViewController>;
}
export interface UiRegistrationContext {
  registerView(viewType: string, factory: ViewFactory): Disposable;
}
export interface PluginUiModule {
  register(context: UiRegistrationContext): void | Disposable | Promise<void | Disposable>;
}
export type JobStatus = 'queued' | 'running' | 'cancel_requested' | 'succeeded' |
  'failed' | 'cancelled' | 'interrupted' | 'unknown';
export interface JobRecord {
  id: string;
  pluginId: string;
  jobType: string;
  status: JobStatus;
  progress: number | null; // [0, 1]; null = unknown progress.
  idempotencyKey: string;
  externalId?: string;
  resultRefs: ResourceRef[];
  error?: { code: string; message: string; retryable: boolean };
}
export interface JobsApi {
  submit(jobType: string, input: Json, options: { idempotencyKey: string }): Promise<JobRecord>;
  get(jobId: string): Promise<JobRecord>;
  cancel(jobId: string): Promise<JobRecord>;
  watch(jobId: string, listener: (record: JobRecord) => void): Disposable;
}
export interface JobExecutionContext {
  readonly jobId: string;
  readonly idempotencyKey: string;
  readonly signal: AbortSignal;
  checkpoint(value: { externalId?: string; progress?: number | null; metadata?: Json }): Promise<void>;
}
export interface JobOutcome {
  status: 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  resultRefs?: ResourceRef[];
  error?: { code: string; message: string; retryable: boolean };
}
export interface JobHandler {
  execute(input: Json, context: JobExecutionContext): Promise<JobOutcome>;
  reconcile?(record: JobRecord): Promise<JobOutcome | null>;
}
export interface ServiceCallContext {
  readonly requestId: string;
  readonly callerPluginId: string;
  readonly signal: AbortSignal;
  readonly delegatedGrantIds: readonly string[];
}
export interface ServiceRegistration {
  id: string;
  version: string;
  methods: Record<string, (params: Json, context: ServiceCallContext) => Promise<Json>>;
}
export type CapabilityStatus = 'supported' | 'unsupported' | 'needsAuthorization' | 'denied';
export interface CapabilityApi {
  status(name: string): Promise<CapabilityStatus>;
  invoke<T extends Json = Json>(name: string, input: Json): Promise<T>;
}
export interface StorageTransaction {
  get(key: string): Promise<Json | undefined>;
  set(key: string, value: Json): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface PluginStorage {
  transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>;
  dataDirectory(): Promise<string>; // Trusted backend only. Not passed to UI.
}
export interface DataStoreLifecycle {
  readonly schemaVersion: number;
  beforeBackup(): Promise<void>;
  exportSnapshot(destinationDirectory: string): Promise<Json>;
  afterBackup(success: boolean): Promise<void>;
  migrate(fromVersion: number, toVersion: number): Promise<void>;
}
export interface PluginContext {
  readonly pluginId: string;
  readonly services: ServicesApi;
  readonly jobs: JobsApi;
  readonly capabilities: CapabilityApi;
  readonly storage: PluginStorage;
  registerCommand(id: string, handler: (params: Json) => Promise<Json>): Disposable;
  registerService(definition: ServiceRegistration): Disposable;
  registerJobType(id: string, handler: JobHandler): Disposable;
  registerResourceOpener(kind: string, handler: (ref: ResourceRef) => Promise<{ viewType: string; config: Json }>): Disposable;
}
export interface DataPreparationContext {
  readonly pluginId: string;
  readonly dataDirectory: string;
}
export interface PluginServiceModule {
  prepareData?(context: DataPreparationContext): Promise<DataStoreLifecycle>;
  activate(context: PluginContext): Promise<void | Disposable>;
}
```

## contracts/plugin-manifest.schema.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Workbench plugin manifest, design revision 1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "name",
    "version",
    "hostApi",
    "platforms",
    "entrypoints",
    "activationEvents",
    "contributes"
  ],
  "properties": {
    "schemaVersion": {
      "const": 1
    },
    "id": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$"
    },
    "name": {
      "type": "string",
      "minLength": 1
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "hostApi": {
      "type": "string",
      "minLength": 1
    },
    "platforms": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": {
        "enum": [
          "macos",
          "windows",
          "linux"
        ]
      }
    },
    "entrypoints": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": false,
      "properties": {
        "ui": {
          "type": "string",
          "pattern": "^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*\\\\)[A-Za-z0-9_./-]+$"
        },
        "service": {
          "type": "string",
          "pattern": "^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*\\\\)[A-Za-z0-9_./-]+$"
        }
      }
    },
    "activationEvents": {
      "type": "array",
      "uniqueItems": true,
      "items": {
        "type": "string",
        "pattern": "^(onAppStart|on(View|Command|Service|Job):[a-z][a-z0-9.-]+)$"
      }
    },
    "requestedCapabilities": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "name",
          "reason"
        ],
        "additionalProperties": false,
        "properties": {
          "name": {
            "type": "string"
          },
          "reason": {
            "type": "string",
            "minLength": 1
          },
          "scope": {
            "type": "object"
          }
        }
      }
    },
    "dependencies": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "required": {
          "type": "object",
          "additionalProperties": {
            "type": "string"
          }
        },
        "optional": {
          "type": "object",
          "additionalProperties": {
            "type": "string"
          }
        }
      }
    },
    "contributes": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "views": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "id",
              "title"
            ],
            "additionalProperties": false,
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$"
              },
              "title": {
                "type": "string",
                "minLength": 1
              },
              "minWidth": {
                "type": "integer",
                "minimum": 120
              },
              "minHeight": {
                "type": "integer",
                "minimum": 80
              },
              "configSchema": {
                "type": "object"
              }
            }
          }
        },
        "commands": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "id",
              "title"
            ],
            "additionalProperties": false,
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$"
              },
              "title": {
                "type": "string"
              },
              "inputSchema": {
                "type": "object"
              }
            }
          }
        },
        "jobs": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "id",
              "title"
            ],
            "additionalProperties": false,
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$"
              },
              "title": {
                "type": "string"
              },
              "inputSchema": {
                "type": "object"
              }
            }
          }
        },
        "services": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "id",
              "version",
              "methods"
            ],
            "additionalProperties": false,
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$"
              },
              "version": {
                "type": "string",
                "pattern": "^\\d+\\.\\d+\\.\\d+$"
              },
              "methods": {
                "type": "object",
                "minProperties": 1,
                "additionalProperties": {
                  "type": "object",
                  "required": [
                    "inputSchema",
                    "outputSchema"
                  ],
                  "additionalProperties": false,
                  "properties": {
                    "inputSchema": {
                      "type": "object"
                    },
                    "outputSchema": {
                      "type": "object"
                    }
                  }
                }
              }
            }
          }
        },
        "resourceKinds": {
          "type": "array",
          "uniqueItems": true,
          "items": {
            "type": "string",
            "minLength": 1
          }
        },
        "settingsSchema": {
          "type": "object"
        }
      }
    }
  }
}
```

## contracts/workspace.schema.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Workbench workspace, design revision 1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "name",
    "revision",
    "layout",
    "views",
    "activePaneId"
  ],
  "properties": {
    "schemaVersion": {
      "const": 1
    },
    "id": {
      "type": "string",
      "minLength": 1
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "revision": {
      "type": "integer",
      "minimum": 0
    },
    "layout": {
      "$ref": "#/$defs/node"
    },
    "activePaneId": {
      "type": "string",
      "minLength": 1
    },
    "views": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "pluginId",
          "viewType",
          "config",
          "stateVersion",
          "state"
        ],
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "pluginId": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$"
          },
          "viewType": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$"
          },
          "config": {},
          "stateVersion": {
            "type": "integer",
            "minimum": 1
          },
          "state": {},
          "resource": {
            "$ref": "#/$defs/resource"
          }
        }
      }
    }
  },
  "$defs": {
    "node": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "type",
            "paneId"
          ],
          "properties": {
            "type": {
              "const": "leaf"
            },
            "paneId": {
              "type": "string",
              "minLength": 1
            },
            "viewInstanceId": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "type",
            "axis",
            "ratio",
            "first",
            "second"
          ],
          "properties": {
            "type": {
              "const": "split"
            },
            "axis": {
              "enum": [
                "horizontal",
                "vertical"
              ]
            },
            "ratio": {
              "type": "number",
              "exclusiveMinimum": 0,
              "exclusiveMaximum": 1
            },
            "first": {
              "$ref": "#/$defs/node"
            },
            "second": {
              "$ref": "#/$defs/node"
            }
          }
        }
      ]
    },
    "resource": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "providerId",
        "kind",
        "resourceId",
        "version"
      ],
      "properties": {
        "providerId": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$"
        },
        "kind": {
          "type": "string"
        },
        "resourceId": {
          "type": "string"
        },
        "version": {
          "type": "integer",
          "minimum": 1
        },
        "label": {
          "type": "string"
        }
      }
    }
  }
}
```

## examples/whisper.manifest.json

```json
{
  "schemaVersion": 1,
  "id": "local.whisper",
  "name": "Whisper 本地转写",
  "version": "0.1.0",
  "hostApi": ">=0.1.0 <0.2.0",
  "platforms": [
    "macos",
    "windows",
    "linux"
  ],
  "entrypoints": {
    "ui": "dist/ui.js",
    "service": "dist/service.js"
  },
  "activationEvents": [
    "onView:local.whisper.main",
    "onCommand:local.whisper.open",
    "onJob:local.whisper.transcribe"
  ],
  "requestedCapabilities": [
    {
      "name": "files.readSelected",
      "reason": "读取用户主动选择的音频文件"
    },
    {
      "name": "network.request",
      "reason": "连接已配置的本地转写服务",
      "scope": {
        "userConfiguredEndpoint": true
      }
    },
    {
      "name": "files.writeSelected",
      "reason": "将结果保存到用户选择的位置"
    }
  ],
  "dependencies": {
    "optional": {
      "workbench.resource-catalog": "^1.0.0"
    }
  },
  "contributes": {
    "views": [
      {
        "id": "local.whisper.main",
        "title": "音频转写",
        "minWidth": 320,
        "minHeight": 240
      }
    ],
    "commands": [
      {
        "id": "local.whisper.open",
        "title": "打开音频转写"
      }
    ],
    "jobs": [
      {
        "id": "local.whisper.transcribe",
        "title": "转写音频",
        "inputSchema": {
          "type": "object",
          "required": [
            "fileRef"
          ],
          "properties": {
            "fileRef": {
              "type": "string"
            }
          }
        }
      }
    ],
    "resourceKinds": [
      "transcript"
    ]
  }
}
```

## examples/workspace.json

```json
{
  "schemaVersion": 1,
  "id": "workspace-study",
  "name": "日常工作",
  "revision": 0,
  "layout": {
    "type": "split",
    "axis": "horizontal",
    "ratio": 0.6,
    "first": {
      "type": "leaf",
      "paneId": "pane-calendar",
      "viewInstanceId": "view-calendar"
    },
    "second": {
      "type": "split",
      "axis": "vertical",
      "ratio": 0.5,
      "first": {
        "type": "leaf",
        "paneId": "pane-todo",
        "viewInstanceId": "view-todo"
      },
      "second": {
        "type": "leaf",
        "paneId": "pane-whisper",
        "viewInstanceId": "view-whisper"
      }
    }
  },
  "views": [
    {
      "id": "view-calendar",
      "pluginId": "core.calendar",
      "viewType": "core.calendar.week",
      "config": {
        "anchor": {
          "mode": "relative",
          "value": "thisWeek"
        }
      },
      "stateVersion": 1,
      "state": {}
    },
    {
      "id": "view-todo",
      "pluginId": "core.todo",
      "viewType": "core.todo.list",
      "config": {
        "filter": "open"
      },
      "stateVersion": 1,
      "state": {}
    },
    {
      "id": "view-whisper",
      "pluginId": "local.whisper",
      "viewType": "local.whisper.main",
      "config": {},
      "stateVersion": 1,
      "state": {}
    }
  ],
  "activePaneId": "pane-calendar"
}
```
