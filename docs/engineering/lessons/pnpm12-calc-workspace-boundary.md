---
status: verified
issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1170
baseline: cc83aba0452fd8ea3326e33f527f4e60a8403b0d
regressions:
  - packages/postcss/test/workspace-install.test.ts
  - e2e/issue-1166-webpack-radius.test.ts
verification:
  - claim: 原始 main 在 pnpm 12 下无法冻结安装
    kind: integration
    status: failed
    sha: cc83aba0452fd8ea3326e33f527f4e60a8403b0d
    environment: macOS，Node 24.18.0，pnpm 12.3.4，未修改的基线
    command: pnpm install --frozen-lockfile
  - claim: 移除失效的 calc 别名与全局替换后，干净工作树冻结安装通过
    kind: integration
    status: passed
    sha: cc83aba0452fd8ea3326e33f527f4e60a8403b0d
    environment: macOS，Node 24.18.0，pnpm 12.3.4，基线加本次未提交的 manifest、workspace 与锁文件修复
    command: pnpm install --frozen-lockfile
  - claim: 本地计算器与第三方计算器保持独立的解析边界
    kind: integration
    status: passed
    sha: cc83aba0452fd8ea3326e33f527f4e60a8403b0d
    environment: macOS，Node 24.18.0，pnpm 12.3.4，基线加本次工作区修复和新增回归
    command: CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/workspace-install.test.ts --update=none
---

# pnpm 12：移除失效的 calc 链接与全局替换

## 症状

复核 #1170 的最新 main 时，标准冻结安装在进入构建前报 `ERR_PNPM_OUTDATED_LOCKFILE`：
`packages/postcss` 的 `postcss-calc` 锁定声明为 `link:../postcss-calc`，
应用根 override 后的声明却是 `link:packages/postcss-calc`。
单独重新生成锁文件后再冻结安装，仍出现同一错误。

这是安装问题，不能替代 #1170 已定位的 SFC 生命周期故障，也不能据此推断样式修复失效。

## 根因与纠正

版本 12.3.4 的 pnpm 在生成锁文件和校验直接依赖时，对根 `link:` override 的相对路径处理不一致。
独立离线小工作区能够复现；将消费包从 `packages/postcss` 移至更深目录后，错误中的相对路径随之变化。
这确认问题涉及链接解析边界，不是漏跑一次锁文件更新。

继续搜索生产代码、测试与配置后发现：所有本地计算器消费均已使用
`@weapp-tailwindcss/postcss-calc`，并已有 `workspace:*` 生产依赖。
无命名空间的 `postcss-calc` devDependency 是无消费方的旧别名，因此直接删除，无需再增加 workspace alias。

根 `postcss-calc` override 还把四代 cssnano preset 声明的上游计算器统一替换为本地包，
使仓库内行为偏离普通消费者。移除该 override 后，第三方依赖分别恢复上游 8.2.4、9.0.1、10.1.1；
本项目生产代码继续显式使用自身计算器。
`jiti: 2.7.0` 与本次故障无关，保留其版本约束，不将缺少历史说明视为可以直接删除的证据。

锁文件取 pnpm 12 生成的 calc 相关记录，排除全量重解析引入的无关 React Native/Nuxt peer 变化。
语义比较确认只改变旧别名、calc override、四个 cssnano preset 的 calc 指向及三个上游包的元数据/依赖记录。
不手改 integrity，不升级其它包，不使用 `--ignore-manifest-check` 作为修复。

## 验证

以下验证均在 macOS、Node 24.18.0、pnpm 12.3.4 上完成。frontmatter 的 SHA 是修复前基线，
通过记录明确包含本次工作区补丁，不把基线本身写成安装通过。原始日志位于忽略的
`e2e/.artifacts/pnpm12-frozen/`。

- 修复前：两种目录布局的真实 pnpm 回归均在冻结安装阶段失败，错误与原始主仓库一致。
- 修复后：原有工作树和没有 node_modules 的独立完整工作树均执行 `pnpm install --frozen-lockfile` 通过。
- 新增回归在中文、空格、`&` 临时路径运行真实 pnpm；先生成锁文件，再冻结安装，删除测试拥有的 node_modules 后再次冻结安装，锁文件内容始终不变。本地直接依赖与第三方包内依赖的实际 Node 解析各自正确。
- `pnpm --filter weapp-tailwindcss... run build`：主包及依赖实际构建通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss --filter @weapp-tailwindcss/postcss-calc exec vitest run --update=none`：917 项通过，6 项既有跳过。
- `CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1166-webpack-radius.test.ts e2e/issue-1144-static.test.ts --update=none`：4 项通过，覆盖真实上游 calc 8.2.4 的 Webpack Web/小程序交接，以及 Options/setup 的生产样式；既有基线无变化。

最初临时诊断目录没有固定正确的包管理器入口，意外落到全局 pnpm 9，该结果已丢弃。
持久回归从仓库启动 pnpm，再通过 `--dir` 指向临时项目，沿用仓库选定版本。
测试不下载上游算法包，而用本地 file 包检查解析隔离；算法兼容由 #1166 的真实依赖集成补充。

## 适用边界

本次未新增或修改 demo、样式 fixture 或产品转换逻辑，无需生成新 static 基线；没有新增 change intent。
冻结安装的实际新证据来自 macOS，Windows/Linux 可运行同一回归，但未在本轮取得实际安装结果。
不将删除 calc override 推广为删除全部 override；每项都需核对消费链和兼容性。

## 规则评估

不新增 AGENTS 规则。现有依赖消费链检查与跨平台路径边界要求足够；以真实安装回归防止旧别名或全局替换重新引入。
