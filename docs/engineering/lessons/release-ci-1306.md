---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1306
baseline: 5ead35348ecc31825bd444311767d1abb9da54c5
regressions:
  - packages/postcss/test/tailwindcss-v4-modern-guard.test.ts
  - packages/weapp-tailwindcss/test/bundlers/generator-css-deferred-selectors.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-framework-universal.integration.test.ts
  - packages/weapp-tailwindcss/test/v5/web-target-official-parity.test.ts
  - e2e/react-native-declaration-evidence.test.ts
  - e2e/react-native-android-environment-entry.test.ts
---

# 依赖迁移后的版本 PR 验收恢复

## 症状

[Release 41980519245](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41980519245)
的八个平台原生产物全部成功，`Verify release` 在全仓单测阶段失败：26 个文件、64 项测试和 52 个快照。
同提交的 [CI 41980519171](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41980519171)
还报告 RN 静态证据、Android 生命周期 mock、Lynx、Taro 和 weapp-vite 输出基线失败。
自动 prepare 尚未执行，#1306 的旧 head 未包含本次依赖迁移。

## 根因与纠正

Tailwind CSS 4.3.4 将默认变量的能力探针从 `margin-trim: inline` 改成 `block`。
PostCSS 兼容层只识别前者，导致新版默认变量留在浏览器能力条件中。修复在原有共享兼容边界完整匹配这两种属性值，
仍要求四个探针同时存在；其他值、自定义属性和无关条件继续保留。新增实际引擎生成到完整样式处理的回归，
确认变量可以无条件到达小程序元素。修复后渐变默认值恢复原语义，不能把修复前的结果作为新基线。

RN 证据原先用正则提取 class，新版顶层 `:is(...)` 的右括号被误收进类名，导致 group/peer 被误报未生成。
改为复用 selector AST 读取器，继续通过 `generatedClassSet` 精确确认候选身份；祖先 marker 和属性字符串不能冒充候选。
Android 生命周期单测只隔离 static 生成边界，避免恒定返回文本的文件 mock 被误用于解析真实 JSON，生产执行顺序不变。

官方 Vite 对照插件仍锁在 4.3.3，与 4.3.4 的 PostCSS 对照不一致。将对照插件同步到 4.3.4 并由 pnpm 生成锁文件，
保留精确 parity。正式生成新的 inventory，实际 127 个 `@property` 注册与生产默认变量签名完全一致，无需改写映射。

其余预期迁移包括 banner、空 fallback 空格和 group/peer 的等价选择器改写。
原选择器已不再含冗余 `*`，因此保留新版形状回归，同时用显式包含 `*` 的候选继续覆盖 universal 替换。
快照按失败文件和项目定向生成，再禁止更新复验。前置快照失败使后续断言未执行而报告的 obsolete 键不能直接删除。
性能 watcher 仅更新静态 CSS 输出，不修改性能预算。

Lynx 示例的原生矩阵精确固定 Tailwind CSS 4.3.3，但缺少配套 `@tailwindcss/node`，
引擎实际回退到自身的 4.3.4，造成产物与证据身份不符。为示例补齐同版本编译器，保留这一旧版本兼容场景。
构建配置、catalog hash 和历史原生报告不变；真实重建的 118 项静态结果完全一致，仅刷新生成时间。
新增构建前置的产物 banner 核对及错版、缺失身份回归，阻止未来把回退编译器标记成示例版本。
独立诊断夹具仍消费当前 4.3.4，其两处选择器形状快照单独更新，编码拒绝状态不变。

## 验证

各修复在独立 worktree 安装依赖，使用仓库声明支持的 Node 24.22.1 与 pnpm 12.15.0。
定向测试均显式禁止更新快照；更新命令只用于已审查的指定基线。
本地验证记录如下，完整远端验收绑定后续修复提交和版本 PR 的准确 head：

- `pnpm install --frozen-lockfile`：通过；依赖目录与各子任务 worktree 独立。
- `pnpm --filter weapp-tailwindcss... --filter @weapp-tailwindcss/lynx build`：通过，包含 PostCSS 声明生成。
- PostCSS 定向回归与包内相关回归共 2222 项通过，3 项既有 NutUI 跳过；127 项变量签名的 2 项回归单独通过。
- 原失败的主包、typography、watcher 与官方输出 parity 共 23 个文件、220 项回归通过；watcher 连续保存并恢复后哈希一致。
- RN 示例、声明证据、Android 生命周期与静态入口等共 200 项定向回归通过；RN static 的 118 项状态计数不变，无新增失败。
- Taro static 6 项与 generator 11 项禁止更新复验通过；weapp-vite static 5 项通过，无需更新原基线。
- `pnpm e2e:lynx:static:update`：118 项真实重建，结果及 catalog hash 与原基线一致。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-rspeedy.test.ts e2e/lynx-versions.test.ts e2e/lynx-reports.test.ts e2e/lynx-static-evidence.test.ts --update=none --coverage.enabled=false`：4 个文件、123 项通过。
- 独立 Lynx 诊断夹具的真实双入口与 strict 模式 3 项通过，已审查两处 group 选择器快照差异。
- `pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false` 与 `pnpm --filter @weapp-tailwindcss/react-native typecheck`：通过。
- 修改的 TypeScript 文件显式 `eslint --no-ignore`、`pnpm agents:check`、`git diff --check` 与 `pnpm release status`：通过。

远端结果另以最终交付记录为准，本节不将排队、等待审批或条件跳过计为完整验收成功。

## 适用边界

修复先进入 main，由 Release 自动 prepare 重建受管版本分支，再批准当前 head 的 `version-pr-ci` 环境。
旧 run 的成功、等待登记和自动范围跳过均不能代替最新版完整验收。此任务不合并版本 PR，不发布 npm。
本地只运行有界回归，原 Harmony 原生停止状态未确认的现场继续保留；hosted CI 不能证明该本地原生验收已恢复。

另外，[Next 文档部署 41980519011](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/41980519011)
失败于线上 `/robots.txt`：Cloudflare Managed robots 将预期 302 覆盖成 200 并返回通用 `Allow: /`，并非单纯状态码差异。
官方 Bot Management 接口是 zone 级，调整可能影响生产域名的 AI 爬虫策略。用户确认本轮验收限 Release 与 #1306，
因此保留该外部配置问题，不修改 Cloudflare 策略或放宽禁爬校验。

## 规则评估

沿用现有根因回归、基线审查、worktree 隔离和版本 PR 审批规则，不新增或放宽 AGENTS 规则。
