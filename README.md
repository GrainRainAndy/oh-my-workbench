# Oh My Workbench

面向 macOS 的本地插件工作台。一个工作区可以并排放置快捷入口、日程、待办等视图，也可以多次打开同一插件，分别保存各窗格的配置。

## 试用

Apple Silicon 用户可以从 [GitHub Release](https://github.com/GrainRainAndy/oh-my-workbench/releases/tag/v0.1.0-rc.1) 下载 v0.1.0 的首个候选版与 SHA-256 校验文件。安装和备份恢复见 [macOS 预览版说明](docs/preview-macos.md)。从源码生成安装镜像可运行 `npm ci` 和 `npm run package:mac -- --dmg`。

首次打开时选择「快捷入口」，用黄色加号添加「日程」，再右键选择「在旁边打开」。拖动两个窗格之间的分隔线，可以切换时间表的列数。浅色与深色界面预览见[工程入口](docs/README.md#试用工作台)。

## 开发与验证

- [实施计划与验收状态](docs/plans/implementation.md)
- [插件 SDK 与扩展示例](docs/architecture/sdk.md)
- [宿主与插件共用的设计规范](DESIGN.md)

在仓库根目录运行 `npm test` 检查类型、插件依赖边界和单元测试。打包后运行 `npm run test:headless -- "<生成的 .app 路径>"`，可在后台验证包内工作区、日程和任务恢复。实际执行范围见[预览版验证记录](docs/preview-macos.md#后台复核)。
