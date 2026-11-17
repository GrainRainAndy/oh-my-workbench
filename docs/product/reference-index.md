# 原始资料逐文件索引

2026-11-18；26个文件，均已盘点。文本按分文档/源码审阅，重复合并版检查内容对应，PNG逐张目视审阅。无压缩文件；v0.9正文未提供。

| 文件 | 阅读结果 | SHA256（前12位） |
|---|---|---|
| [references/personal-workbench-v1/COMPLETE.md](../../references/personal-workbench-v1/COMPLETE.md) | 合并正文；已检查8份分文档、3份契约、2份样例逐字包含，非独立新版本。 | 9f47e8db2d3e |
| [references/personal-workbench-v1/DOCUMENT_VALIDATION.md](../../references/personal-workbench-v1/DOCUMENT_VALIDATION.md) | 历史文档校验结果，不是产品验收；本轮未冒充重跑。 | 08d99d6f1938 |
| [references/personal-workbench-v1/README.md](../../references/personal-workbench-v1/README.md) | 导航、确认状态与使用优先级；Q2的A是选项字母。 | 6896c750826f |
| [references/personal-workbench-v1/SHA256SUMS.txt](../../references/personal-workbench-v1/SHA256SUMS.txt) | 原交付内容哈希清单；本轮核对完整性。 | b64d6b2d87ba |
| [references/personal-workbench-v1/contracts/plugin-api.d.ts](../../references/personal-workbench-v1/contracts/plugin-api.d.ts) | 声明而非实现；发现reconcile/cancel/状态迁移/订阅缺口。 | a2c769491019 |
| [references/personal-workbench-v1/contracts/plugin-manifest.schema.json](../../references/personal-workbench-v1/contracts/plugin-manifest.schema.json) | 严格结构、入口正则与贡献；语义/路径/信任需运行校验。 | a1b5b3b25388 |
| [references/personal-workbench-v1/contracts/workspace.schema.json](../../references/personal-workbench-v1/contracts/workspace.schema.json) | 二叉布局与独立views；缺configVersion；引用完整性需语义校验。 | 481a4a9f4181 |
| [references/personal-workbench-v1/docs/01_PRD.md](../../references/personal-workbench-v1/docs/01_PRD.md) | 25功能+6非功能；工作区语义、分阶段、日程待办目标。 | 2a7ed53f6f84 |
| [references/personal-workbench-v1/docs/02_PLUGIN_TRUST.md](../../references/personal-workbench-v1/docs/02_PLUGIN_TRUST.md) | Q3 A/B/C、可信代码风险、安装/能力/外部内容边界。 | 6df1ca00abee |
| [references/personal-workbench-v1/docs/03_ARCHITECTURE.md](../../references/personal-workbench-v1/docs/03_ARCHITECTURE.md) | 模块、进程、布局、Job状态与迁移；Electron仅建议。 | a4c6c61a6884 |
| [references/personal-workbench-v1/docs/04_PLUGIN_CONTRACT.md](../../references/personal-workbench-v1/docs/04_PLUGIN_CONTRACT.md) | 六扩展点、UI/后台生命周期、RPC、能力与数据挂钩。 | 309abc1027fb |
| [references/personal-workbench-v1/docs/05_IMPLEMENTATION_PLAN.md](../../references/personal-workbench-v1/docs/05_IMPLEMENTATION_PLAN.md) | T00–T13建议路径/测试；阶段需重映射。 | ecc6c4cabc1a |
| [references/personal-workbench-v1/docs/06_ACCEPTANCE_TESTS.md](../../references/personal-workbench-v1/docs/06_ACCEPTANCE_TESTS.md) | 31项矩阵、六故障注入、三E2E；未执行产品测试。 | b38f1abfee79 |
| [references/personal-workbench-v1/docs/07_PLUGIN_BASELINES.md](../../references/personal-workbench-v1/docs/07_PLUGIN_BASELINES.md) | 业务最低集仍建议；保留独立可用目标，重复/子任务待冻结。 | dcad24283913 |
| [references/personal-workbench-v1/docs/08_DECISIONS_AND_SOURCES.md](../../references/personal-workbench-v1/docs/08_DECISIONS_AND_SOURCES.md) | D01–D12、ADR建议、18官方来源；不得把建议升格确认。 | 84fa89c41ea0 |
| [references/personal-workbench-v1/examples/whisper.manifest.json](../../references/personal-workbench-v1/examples/whisper.manifest.json) | 仅包声明，dist并不存在；请求文件和网络能力。 | f3aa818f2bb1 |
| [references/personal-workbench-v1/examples/workspace.json](../../references/personal-workbench-v1/examples/workspace.json) | 横竖组合三实例，relative:thisWeek；示例非业务实现。 | 835fb13ca8d7 |
| [references/personal-workbench-v1/index.html](../../references/personal-workbench-v1/index.html) | PRD HTML阅读版：章节、代码附录、样式和IntersectionObserver导航；非应用。 | d1d057b4cd92 |
| [references/workbench-demo/README.md](../../references/workbench-demo/README.md) | Demo使用、数据与测试限制，视觉方案未冻结。 | 3d546ecd5d0f |
| [references/workbench-demo/index.html](../../references/workbench-demo/index.html) | 完整CSS/静态容器/JS与事件流程审阅；详见review。 | 8d505784287f |
| [references/workbench-demo/previews/preview-dark.png](../../references/workbench-demo/previews/preview-dark.png) | 已目视：同布局深色主题。 | 9925b3fb8f9c |
| [references/workbench-demo/previews/preview-light.png](../../references/workbench-demo/previews/preview-light.png) | 已目视：日常浅色四窗格。 | 9b6a1c19aebf |
| [references/workbench-demo/previews/preview-plugins.png](../../references/workbench-demo/previews/preview-plugins.png) | 已目视：六类插件视图选择器。 | 2aee35f0f733 |
| [references/workbench-demo/previews/preview-research.png](../../references/workbench-demo/previews/preview-research.png) | 已目视：笔记/待办/资源研究布局。 | 785cc7365adf |
| [references/workbench-demo/test-results.json](../../references/workbench-demo/test-results.json) | 历史23通过、runtime_errors为空；非本轮执行。 | ae7b485e5fec |
| [references/workbench-demo/test_demo.py](../../references/workbench-demo/test_demo.py) | 23组Playwright交互测试，内存storage替身，脚本会回写原目录。 | 1273f74e1ecb |
