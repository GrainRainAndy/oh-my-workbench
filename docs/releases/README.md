# 包体归档与轮转

首次正式发布前的旧包均为临时构建。首次清理清单保留当时的大小、时间来源、测试证据线索和保留原因；旧包的源码关联未确认。历史 QA 记录中的本地包路径表示当时的测试对象。[首次清理清单](pre-release-inventory.json)

- 临时包位于 `release/macos-*`。打包完成后写入 `build.json` 并执行轮转，保留最近五个完整包。当前预览说明所指的包及正在运行的包额外受保护，解除保护后可在下一轮回收。无法读取进程清单时保留包体。
- `python3 scripts/release-store.py plan` 预览；`clean` 执行。`plan --report <路径>` 输出带大小的清单。未知条目保留，使用版数据和历史 QA 截图在轮转范围以外。
- 从干净提交构建 DMG 后，执行 `python3 scripts/release-store.py checkpoint <构建目录名> --summary "变更摘要"`。归档前核对源码与校验值，运行 npm test 和包内无窗口回归。镜像、构建信息与测试日志放入 `release/checkpoints/`，保留最近三个。
- 首次正式发布创建对应 Git 标签，执行 `python3 scripts/release-store.py milestone <构建目录名> --tag v1.0.0 --summary "首版发布"`（以实际版本替换示例）。`release/milestones/<标签>/` 独立保留。发布时上传 DMG、build.json、tests.log 到同标签的 GitHub Release 或指定外部存储，再下载 DMG 并比对 build.json 中的 SHA-256。
- 候选版沿用里程碑归档，使用 `vX.Y.Z-rc.N` 标签，在 GitHub 标记为预发行版。[v0.1.0-rc.1 说明](v0.1.0-rc.1.md)
