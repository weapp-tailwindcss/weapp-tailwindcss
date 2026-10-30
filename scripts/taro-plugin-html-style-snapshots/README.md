# Taro plugin-html 样式基线

入口为 `pnpm exec tsx scripts/taro-plugin-html-style-snapshots.ts`。设置 `WEAPP_TW_VERIFY_TARO_PLUGIN_HTML_SNAPSHOTS=1` 后，按原流程重新构建并逐字比较暂存样式与当前基线，不修改基线；`WEAPP_TW_KEEP_TARO_PLUGIN_HTML_SNAPSHOTS` 只控制定向更新范围。

需要保留本轮证据时，设置可选的 `WEAPP_TW_TARO_PLUGIN_HTML_ARTIFACT_DIR` 为独立、尚未使用的归档目录。每个项目的 `with-plugin-html/`、`without-plugin-html/` 分别保存同次原命令的完整合并 stdout/stderr、退出状态、结构化报告，以及在下一模式清理前复制的真实 `dist`。归档不参与基线比较，临时样式目录仍会清理；未设置时不采集来源或创建归档。

归档根报告保存源码提交、实际工作树状态、Node 身份、运行结果及各模式索引。构建失败可记录缺失的 dist；构建成功但 dist 缺失、复制失败、旧模式目录或写入失败都会使入口失败。归档证明 CLI 构建与样式比较，不代表设备或 HMR 验收。
