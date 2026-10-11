---
status: partial
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1241
baseline: b0497c9ea3e8c8032fb85ee14ba65bb3942e1bca
regressions:
  - e2e/issue-1241.test.ts
  - e2e/issue-1241-watch.test.ts
  - e2e/issue-1241-layout.test.ts
  - e2e/issue-1241-ide.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-deferred-css-source.test.ts
  - packages/weapp-tailwindcss/test/bundlers/multi-source-ownership.integration.test.ts
  - packages/postcss/test/mini-program-theme-history.test.ts
---

# 多 CSS 入口与文件型 @source 的来源归属

## 症状

Refs #1241。关联背景：[原始尺寸问题 #1214](https://github.com/sonofmagic/weapp-tailwindcss/issues/1214)、[#1174](https://github.com/sonofmagic/weapp-tailwindcss/issues/1174)。

两个由 `main.ts` 导入的 CSS 都包含 `@import 'tailwindcss' source(none)`、相对于各自目录的文件型 `@source` 和 `@theme`。uni-app 将它们合并为一个 WXSS 资产后，页面 WXML 保留 `w-32` 等类，但 WXSS 缺少对应规则。两个主题值相同也会复现；不是主题冲突才会丢类。

本次基于执行开始时最新 `origin/main`（上面的 baseline）建立独立工作树。该基线相关产品代码与 5.5.9 发布提交无差异。此前独立 npm 安装的 5.5.6 / 5.5.9 均复现丢类；本轮改动前的真实构建也失败，保存为 `e2e/.artifacts/issue-1241/baseline-tests.json`。完整可运行最小工程和精确依赖见 Issue 正文。本地修改不表示 npm 已发布修复。

依赖固定为 Tailwind 4.3.3、Vite 5.2.8、Vue 3.5.42；`@dcloudio/uni-app`、`uni-components`、`uni-mp-weixin`、`vite-plugin-uni` 均为 `3.0.0-5010520260709002`。Node 24.18.0、pnpm 12.6.0。没有通过升级框架消除差异。

## 根因与纠正

原发行包调查中的“扫描有 8 个有效候选，日志 candidates=0”只证明最终生成集合为空。旧日志的 `candidates` 实际是 `generated.classSet.size`，不能单凭这一行认定生成器输入为空。本记录纠正上一轮 `published-5-5-9-issues-1238-1214.md` 中把这行日志直接解释为输入为空的推断；原工作树和证据保留。

本轮沿管线取得了进一步证据：

1. uni-app 合并的资产没有 `originalFileName` / `originalFileNames`，两个相似入口无法通过内容唯一匹配。
2. 生成管线退回产物文件身份，文件型 `@source './pages/index.vue'` 被解析到临时项目的 `dist`，不是 CSS 声明所在目录。
3. 此时全局运行时集合包含 8 个工具类和普通 `scope` 字符串，但每入口范围过滤后传入生成器的集合确实为空。这个输入结论来自本轮独立插桩，不来自旧 `candidates=0` 日志。

修复在 transform 阶段为延后生成的 CSS 记录来源标记。标记跟随合并资产，generateBundle 只查询生命周期缓存恢复每个真实入口；缺缓存时报明确错误，不读输出目录推断源文件，也不回退全局候选。标记在消费后从最终 CSS 移除。

各入口继续独立解析 source 范围，再与输出作用域相交；来源目录、顺序、候选签名和调试来源映射均按入口保留。合并生成结果不会把不同目录的相对 source 路径统一解释成首入口或产物目录。缓存签名包含每个入口的候选归属，不能只比较候选合集。

回归还暴露并修复了两个边界：

- `[]` 表示显式空扫描范围。生成准备和 bundle markup 候选收集原先分别跳过空范围或把它当作全匹配，现在保留空范围；两个 `source(none)` 空入口不会消费页面上的类。
- 小程序主题归并原先只留下每个变量的末值，导致后续 cssCalc 看不到多入口冲突。现在保留不同值的声明顺序，并去掉连续同值重复；同值主题可静态计算，冲突主题及作者覆盖保持动态表达式。

文件型 `@source` 引用的文件可能不在 Vite 模块图中。扫描会话将已确认的文件及声明依赖交给 Rollup `addWatchFile`，由现有 `watchChange` 更新候选；没有新增后置扫描。

watch 的进一步插桩还确认了一个独立缓存缺口：外部文件删除 `w-32` 后，扫描源和入口候选签名已变化，CSS 缓存命中了先前不含该类的正确结果；但回放只更新 bundle，没有更新框架样式注入贡献，后续合并再次注入上一轮 `w-32`。新生成与缓存回放现在共同提交样式贡献，严格删除回归可通过。增量构建省略 CSS 资产时的 remembered replay 也保留各来源与候选签名，覆盖候选合集不变但归属互换的情况。

## 验证

[真实构建回归](../../../e2e/issue-1241.test.ts)覆盖单入口、同目录双入口、同值/冲突主题、作者覆盖，以及改名且位于不同目录的文件、glob、inline、排除、空范围和重叠范围。断言包含目标类存在、范围外类不泄漏和来源标记不进入最终资产。

[生成服务回归](../../../packages/weapp-tailwindcss/test/bundlers/multi-source-ownership.integration.test.ts)在同一会话中迁移候选归属，检查合并和独立输出的不同自定义工具类值，并验证显式空范围。[来源回归](../../../packages/weapp-tailwindcss/test/bundlers/vite-deferred-css-source.test.ts)覆盖顺序、导入移除/恢复、缓存缺失，以及 POSIX、根目录、相对路径、Windows 反斜杠和盘符。Windows 用例是路径语义测试，不代表本轮运行过 Windows 原生构建。

[watch 回归](../../../e2e/issue-1241-watch.test.ts)复用同一个进程，按编译成功时间和每轮新 marker 等待，并与同状态干净构建的可达 WXSS 对比。同进程 16 轮覆盖主题变化、候选增删、source 清空/改指向/恢复、第二入口导入移除/恢复、作者覆盖导入增删和外部候选回滚；每轮均通过。严格删除验收显式使用已有 `generator.hmr.preserveDeletedCss: false`；产品默认值仍为 true，默认 HMR 保留已删除工具类的行为不能当成严格删除通过。

[布局 static 基线](../../../e2e/issue-1241-layout.test.ts)与 [DevTools 探针](../../../e2e/issue-1241-ide.test.ts)共用双入口页面。微信 DevTools 2.02.2608070、基础库 3.16.3、WebView、窗口宽 390px、DPR 3 下，1/2/3/8rpx 的工具类与直接最终 rpx 的宽高、padding、正负 margin、gap 同批矩形测量通过，容差 0.000001px。每次加载均核对随机 marker、项目路径和渲染后端；四张截图位于 `e2e/.artifacts/issue-1241/workspace/ide/`。

最终复测时间为 2026-09-24 17:55 UTC。可审查的[矩形测量记录](./evidence/issue-1241/devtools.json)和截图：[1rpx](./evidence/issue-1241/layout-1.png)、[2rpx](./evidence/issue-1241/layout-2.png)、[3rpx](./evidence/issue-1241/layout-3.png)、[8rpx](./evidence/issue-1241/layout-8.png)。下表两列数值均为工具类 / 直接 rpx 的实测 px：

| 基数 | 宽/高 | padding、正 margin、gap | 负 margin |
| --- | --- | --- | --- |
| 1rpx | 16 / 16 | 2 / 2 | -2 / -2 |
| 2rpx | 33 / 33 | 4 / 4 | -4 / -4 |
| 3rpx | 49 / 49 | 6 / 6 | -6 / -6 |
| 8rpx | 133 / 133 | 16 / 16 | -16 / -16 |

这些值验证与直接 rpx 的一致性；DevTools 返回值本身存在量化，不表示等于未量化的理论浮点 px。原始矩形、理论偏差和对照容差一并保留。

测试项目创建于系统临时目录。默认通过 pnpm 安装上述精确框架版本；可用 `E2E_ISSUE_1241_DEPENDENCIES` 复用安装目录，测试会核对所有直接依赖版本。产品始终显式链接当前工作树构建包，并断言实际解析路径。`identity.json`、`framework-pnpm-lock.yaml`、每项目的 `project.json` 和构建日志记录实际依赖与产物身份。保留了旧 npm 包失败证据，未混写成本地修复已发布。

主要命令（仓库根目录）：

```sh
pnpm --filter weapp-tailwindcss... run build
CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1241.test.ts e2e/issue-1241-layout.test.ts e2e/issue-1241-watch.test.ts --update=none
E2E_IDE=1 E2E_PREFLIGHT_WECHAT_CLI='<官方 CLI 路径>' CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1241-ide.test.ts --update=none
pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.build.json --noEmit --noCheck false --pretty false
pnpm architecture:check
pnpm agents:check
pnpm release check
pnpm release status
git diff --check
```

static 基线的首次创建及扩展单独使用同一组 Issue 定向测试加 `-u`，审查后再用 `CI=1 --update=none` 复验。没有启动全仓或全端验收。受影响生成、Vite、隔离、PostCSS 单测及检查的原始日志保存在 `e2e/.artifacts/issue-1241/`。

最终本地结果：

- 通过：主包定向 30 文件 / 388 测试，PostCSS 定向 8 文件 / 221 测试；两包构建与声明生成；主包严格类型检查；架构、AGENTS、repoctl change intent、ESLint（0 错误）和 diff 检查。
- 通过：11 个真实 uni-app 构建场景、4 个布局 static 基线、1 个包含 16 轮的连续 watch 测试，均使用 `CI=1 --update=none`；微信 DevTools 4 个基数尺寸对照及截图。
- 失败：PostCSS 额外严格源码类型检查，83 条既有诊断，详见下面边界。
- 跳过：复现设施自安装依赖的单场景抽验使用名称过滤，跳过其余 10 个场景；正式 11 场景运行无跳过。仓库 ESLint 配置忽略包内测试文件，已如实保留警告。
- 阻塞：本轮定向构建与 DevTools 无环境阻塞；Android/iOS 真机、Skyline、其他框架与 Windows 原生构建未验证。

类型检查边界：主包严格源码检查和两包正常构建/声明生成通过。额外执行 PostCSS `tsc -p tsconfig.build.json --noEmit --noCheck false` 失败；同命令在未修改基线和修复工作树各得到完全相同的 83 条源码诊断，无新增诊断。该包原构建配置为 `noCheck: true`，不能把正常声明生成描述为严格类型检查通过。本次未扩展修复这些既有类型错误。

## 适用边界

DevTools 的通过结论只覆盖上述 WebView 模拟器。Android/iOS 真机、Skyline 和其他框架未做本轮运行时验收。默认 cssCalc 关闭和动态变量的微信运行时尺寸限制仍按 #1214 的边界处理。

本修复针对来源归属、候选隔离及其失效链路，不变更公开配置默认值或主题级联顺序。未自动合并、发布或关闭 Issue；本地验证不替代尚未执行的环境，也不等待远端 CI。

## 规则评估

不新增 AGENTS 规则。现有“来源从构建图和生命周期缓存取得”“样式输出只能经过 bundler API”“路径边界必须跨平台”“复现必须生成 static 基线”已覆盖本问题，本次将缺口固化为可运行回归。
