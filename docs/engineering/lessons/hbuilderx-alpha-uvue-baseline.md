---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1269
baseline: 12e31928b8b78af33d5a2a3376809a7cfe4552dc
regressions:
  - e2e/uni-app-x-vdom-tailwindcss-v4.test.ts
  - e2e/project-build-hbuilderx-cleanup.test.ts
---

# HBuilderX Alpha 恢复编译后的官方样式基线

## 症状

先前全面测试的 uni-app x 小程序编译与项目关闭分别静默超时。本轮在已解锁的 macOS、HBuilderX Alpha `5.31.2026093020-alpha` 上定向复测，打开项目、编译、严格关闭均正常完成；约 12 秒后测试停在第 17 次快照断言，只有 `main.wxss` 不匹配。

## 根因与纠正

当前 Alpha 自带的 `uniapp-cli-vite/node_modules/@dcloudio/uni-mp-vite/lib/uvue.css` 将 `video` 放入非支付宝条件块，并从公共 flex 组件列表移除 `rich-text`。官方插件读取该 CSS、按平台预处理后输出到主包与独立包。当前产物的选择器变化与官方输入一致；该规则的 13 条声明、其它规则和 Tailwind 工具类均未改变。`rich-text` 的隐藏规则和独立行高声明仍保留，本 demo 没有使用该组件。

限定 `uni-app-x-vdom-tailwindcss-v4` 重新生成 static 基线，审查后只有 `main.wxss` 发生上述三处行变化，另外 16 份快照字节未变。没有修改样式转换代码或测试断言。

## 验证

运行前显式设置本机已核对的 `HBUILDERX_CLI_PATH`、`HBUILDERX_HOST`，避免其它实例覆盖 Alpha 选择。真实命令预算仍为 120 秒，构建输出每轮重建：

```sh
pnpm exec cross-env CI=1 HBUILDERX_CHANNEL=alpha E2E_SKIP_HBUILDERX=0 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_SKIP_BUILD=0 E2E_IDE_HBUILDERX_DEV_BUILD_TIMEOUT_MS=120000 E2E_PROJECT_FILTER=^uni-app-x-vdom-tailwindcss-v4$ pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-x-vdom-tailwindcss-v4.test.ts --update=none --bail=1
```

- 首次保留失败：1 项快照失败，日志 `.tmp/hbuilderx-alpha-retest-12e31928b.log`。
- 单独将更新参数换为 `-u` 生成该项目基线；1 项通过，17 份重建，仅 1 份实际变化，日志 `.tmp/hbuilderx-alpha-baseline-12e31928b.log`。
- 恢复 `--update=none` 后重新编译：1 项通过、无跳过，耗时 11.73 秒，日志 `.tmp/hbuilderx-alpha-verified-12e31928b.log`。
- 原生 IDE 可访问性树确认本轮唯一 alias 曾出现，严格关闭后已从项目列表移除，临时 alias 目录也已释放。没有关闭用户其它项目或操作微信登录态。

## 适用边界

本轮证实该 Alpha 版本的小程序编译、静态比较与项目收尾可用，不证明此前挂起的首发原因，也不能把恢复归因于解锁或清理修复。官方日志在成功运行时仍有 QObject timer 与 RPC 无客户端警告，它们不能单独作为挂起判据。

未执行设备运行、HMR 或完整 46 阶段验收。此次仅同步实际工具链的测试基线，无公开包行为修改，不新增 change intent。

## 规则评估

不新增 AGENTS。沿用限定项目生成、审查差异、禁止更新模式复验及严格项目收尾规则。
