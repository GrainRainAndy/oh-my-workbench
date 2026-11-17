# 工作台工程设计评审入口

日期：2026-11-18。状态：用户已确认架构方向、技术验证路线和桌面行为；已进入 M0 前置技术验证；零依赖Node试验已执行，依赖下载限制已获授权解除，桌面运行验证正在推进，尚无同负载框架比较结论。

本轮以最新用户要求为准；仅找到 v1.0 原稿，v0.9 正文缺失，因此这是可评审的暂定基线，不声称完成双版本合并。

- [资料索引与证据](product/reference-index.md)
- [差异、缺口与 Demo 审阅](product/review.md)
- [校准 PRD](product/prd.md)
- [需求决策记录](product/decisions.md)
- [整体架构与生命周期](architecture/overview.md)
- [插件运行与信任](architecture/plugin-trust.md)
- [SDK 修订方案](architecture/sdk.md)
- [框架选型 ADR](adr/001-desktop-runtime.md)
- [其他关键 ADR](adr/002-core-boundaries.md)
- [分阶段实施计划](plans/implementation.md)
- [Spike 计划](plans/spikes.md)
- [需求测试矩阵](qa/traceability.md)
- [本轮文档检查](qa/document-review.md)

标记：C＝本轮用户明确确认；H＝旧稿记载为已确认但本轮未重述；L＝旧稿未确认建议；P＝本轮方案建议；O＝需要用户决定。H 保留，不静默删除。P/L 不因写入文档就成为已批准要求。

阶段统一为 M0 插件核心、M1 产品 MVP；旧稿 M0 验证归入 M0 前置 Spike，旧 M1→新 M0，旧 M2→新 M1，旧 M3→后续。架构方向已获批准，先执行前置技术验证，再依据证据冻结框架并推进核心；业务细项在相应插件开工前冻结。

当前实施进度：[T00 首轮技术验证](qa/evidence/runtime-progress.md)。
