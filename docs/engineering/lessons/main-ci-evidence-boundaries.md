---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39799325536
baseline: 49b61ded489ea0656e7112670ede55259ee01382
regressions:
  - e2e/react-native-android-environment-entry.test.ts
  - e2e/uni-app-vite-tailwindcss-v4.test.ts
  - e2e/mpx-tailwindcss-v4.test.ts
  - e2e/gulp-tailwindcss-v4.test.ts
  - e2e/pnpm-environment.test.ts
  - packages/weapp-tailwindcss/test/ci/pnpm-exec-windows.test.ts
  - e2e/lynx-decoder-rebuild.test.ts
  - packages/weapp-tailwindcss/test/watch-hmr-subpackage-style.unit.test.ts
  - e2e/demo-workflow-short-process.test.ts
  - e2e/tailwind-report-clock.test.ts
---

# 合并后 CI 的执行入口与证据边界

## 症状

main 的 Static Gate 在 RN Android 环境入口测试和 uni-app、Mpx、Gulp v4 静态快照失败。旧 main 的夜间运行还暴露了 Windows 活动 pnpm 被 PATH 版本替换、tar 链接边界误判、短进程测试没有命中真实采集边界，以及 Mpx 分包把 webpack JS 交给 CSS 解析器的问题。

Ubuntu 夜间日志另有刚写入的 `generated.css` 被报告门禁判为旧产物；原日志没有时间数值，不能量化该次偏差。

## 根因与纠正

- RN 入口新增身份和收尾协议，旧测试整体 mock 遗漏导出、named 文件写入和连接清理。部分 mock 保留真实身份逻辑，并断言原始异常、环境恢复及收尾回执。
- 来源追踪改为压缩后保留的重要注释，普通 uni-app static 基线遗漏同步。限定重建主包与两个分包，137 处差异逐项归一化后与旧快照完全相同，均只有 `/*tokens:` 到 `/*! tokens:` 的变化。
- Mpx 与 Gulp 也遗漏了来源追踪基线。Mpx 的 146 条注释升级为重要注释；Gulp 转义任意类补齐来源，主包追踪注释 32→61，两个分包各 1→4。只移除来源协议注释后，四份产物的 AST 逐节点一致，包括选择器、声明、条件、层级与顺序。
- Windows 环境键不区分大小写，展开成普通对象后失去该语义。环境合并、入口选择和实际子进程统一使用同一份规范化环境；显式删除和禁止继承继续生效。显式入口不存在时保留 `ENOENT`，禁止换版本继续。
- tar 的 Windows 读取器先归一化路径，校验普通原始头与 PAX/GNU 原始元数据后才消费有效路径。固定源码归档只接受 POSIX 元数据。保留原压缩格式识别、分块读取和相对链接物化，不修改 decoder 产物。
- Mpx 的 JS 样式载体和 CSS 入口承担不同证据角色。CSS 签名只读取已配置的 `globalStyleCandidates` 及其导入闭包；JS 仍参与 marker、热更新和回滚验证。错误或丢失声明仍必须失败。
- 短进程生命周期测试改为跨平台注入同一 observer，实际触发 2200ms 身份查询，保留 5000ms 采集预算和关闭断言。
- 产物 `mtime` 与 `Date` 不能混合作执行先后判据。启动前从产物所在文件系统的独占临时标记采样时间，单独保存内部 `artifactStartedAt`；原生报告的 wall clock 身份检查保持原义。原报告版本、摘要、归属、旧文件拒绝规则和误差均不变；采样或清理失败直接阻断，禁止退回 `Date`。

## 验证

以下验证针对基线加本轮未提交改动，macOS、Node 24.18.0、pnpm 12.14.0；不代表原始基线已经包含修复。

- RN 四个入口回归先失败后通过；覆盖 setup/listen 原始异常、连接清理与设置/端口恢复。
- pnpm 环境反例和 tar Windows 反例先失败后通过。tar 另覆盖大于 64KiB 的 gzip/Brotli、合法 PAX/GNU 链接与完整正文。
- Mpx 混合 JS/CSS 调用回归先报 `Unknown word self`；修复后有效声明通过，错误/丢失声明拒绝。`CI=1 E2E_WATCH_MINI_PROGRAM_ONLY=1 pnpm --filter @weapp-tailwindcss/scripts test:watch-hmr -- --case mpx-tailwindcss-v4 --mini-program-scope subpackages --skip-build` 的普通与独立分包 template、style、main-style 及回滚均通过，源文件由原 runner 恢复。
- `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-vite-tailwindcss-v4.test.ts -u` 限定生成 static；审查后以相同命令的 `--update=none` 替换 `-u` 重跑通过。微信 IDE 未执行。
- `CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/mpx-tailwindcss-v4.test.ts e2e/gulp-tailwindcss-v4.test.ts --update=none` 复现两份失配；仅同两项目以 `-u` 重建，经有序 CSS AST 独立审查后再以 `--update=none` 验证。
- `CI=1 E2E_PROJECT_FILTER='^taro-webpack-react-tailwindcss-v4$' E2E_GENERATOR_PLATFORM_FILTER='^web-compact$' pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/apps-generator-mode-compare.test.ts --update=none` 通过当前基线；旧运行没有原始 CSS，不能据此声称已解释旧 +532 字节的根因。
- 时钟回归模拟 `Date` 超前一分钟，直接报告和提前启动路径均先失败后通过；提前启动在报告创建前生成产物并复用启动下界，旧一分钟产物仍被拒绝，采样与清理错误同时保留。已复现同类跨时钟误判，原 Ubuntu 失败的具体时钟偏差仍未确认。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-native-adapter.test.ts --update=none` 的 31 项原生报告适配回归通过；只验证报告与证据门禁，不代表设备验收。

## 适用边界

旧夜间的 Windows 冷准备仍存在 15 秒预算耗尽：原始请求读入到 JSON 事件耗时 11402ms，再查询身份 3519ms。现有证据无法区分模块加载与宿主调度，不能宣称根因消除，也不增加预算。macOS Web 内存探针的 `ps` 被终止后未在原预算确认关闭，宿主根因同样未明。两者没有通过反复重跑抹去。

本地全面预检仍被既有微信保护租约及 Android 空 UI 阻塞；本轮只有定向回归和普通 hosted CI。原生完整 served bundle/HMR 等全面验收缺口仍保持 partial，CI 成功不能代替设备验收。

## 规则评估

不新增 AGENTS 规则。已有根因回归、跨平台路径、static 同步、预算与证据门禁约束足够；本次补齐执行边界和持久测试。
