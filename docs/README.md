# 工作台工程设计评审入口

当前阶段为 M0 插件核心验证。Electron 预览包已支持工作区、递归窗格、插件后台任务和备份恢复。完整 M0 验收与 M1 产品开发进度见[实施计划](plans/implementation.md)，已执行的测试与限制见[运行验证记录](qa/evidence/runtime-progress.md)。

本轮以最新用户要求为准；仅找到 v1.0 原稿，v0.9 正文缺失，因此这是可评审的暂定基线，不声称完成双版本合并。

- [资料索引与证据](product/reference-index.md)
- [差异、缺口与 Demo 审阅](product/review.md)
- [校准 PRD](product/prd.md)
- [需求决策记录](product/decisions.md)
- [整体架构与生命周期](architecture/overview.md)
- [插件运行与信任](architecture/plugin-trust.md)
- [SDK 契约与可运行的插件示例](architecture/sdk.md#在预览包中运行-sdk-示例)
- [框架选型 ADR](adr/001-desktop-runtime.md)
- [其他关键 ADR](adr/002-core-boundaries.md)
- [分阶段实施计划](plans/implementation.md)
- [Spike 计划](plans/spikes.md)
- [需求测试矩阵](qa/traceability.md)
- [本轮文档检查](qa/document-review.md)

标记：C＝本轮用户明确确认；H＝旧稿记载为已确认但本轮未重述；L＝旧稿未确认建议；P＝本轮方案建议；O＝需要用户决定。H 保留，不静默删除。P/L 不因写入文档就成为已批准要求。

阶段统一为 M0 插件核心、M1 产品 MVP；旧稿 M0 验证归入 M0 前置 Spike，旧 M1→新 M0，旧 M2→新 M1，旧 M3→后续。架构方向已获批准，先执行前置技术验证，再依据证据冻结框架并推进核心；业务细项在相应插件开工前冻结。

当前实施进度：[T00 首轮技术验证](qa/evidence/runtime-progress.md)。

## 启动与插件故障恢复

项目根目录运行 `npm start`。工作台菜单栏的「以安全模式重新启动」可暂时暂停插件，打开插件管理页排查故障。应用已退出时也可运行 `npm start -- --safe-mode`。原工作区与启停偏好保留；明确停用有问题的插件后，在菜单栏选择「重新正常启动」。
