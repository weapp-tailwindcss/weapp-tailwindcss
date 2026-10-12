---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1286
baseline: 63aab1677b4f452d87ac262df115aa0478fe8e18
regressions:
  - packages/postcss/test/mini-program-prefixes.test.ts
  - packages/weapp-tailwindcss/test/compiler/core-compiler-webkit-prefixes.test.ts
  - packages/weapp-tailwindcss/test/bundlers/webkit-prefixes.unit.test.ts
  - packages/weapp-tailwindcss/test/context/style-options-snapshot.test.ts
  - e2e/issue-1286-webkit-properties.test.ts
  - e2e/taro-webpack-react-tailwindcss-v4.test.ts
verification:
  - claim: 默认字体平滑、扩展名单、调用覆盖、缓存与 Web 分支边界通过定向回归
    kind: unit
    status: passed
    sha: 6a6ce93154f43df97f1d21bb902513ea4fd48c0c
    environment: macOS，Node 24.18.0，pnpm 12.9.1；包含本轮未提交修复，随后提交为 0990abd79a4dab69b0da229f37243a47bd5cfed4
    command: corepack pnpm --filter weapp-tailwindcss exec vitest run test/compiler/core-compiler-webkit-prefixes.test.ts test/bundlers/webkit-prefixes.unit.test.ts test/context/style-options-snapshot.test.ts --update=none --coverage.enabled=false
  - claim: 微信严格构建、最终 WXSS 和对应 static 基线通过
    kind: integration
    status: passed
    sha: 6a6ce93154f43df97f1d21bb902513ea4fd48c0c
    environment: macOS，Node 24.18.0，pnpm 12.9.1，Taro 4.2.1，Tailwind CSS 4.3.3；包含随后提交为 0990abd79a4dab69b0da229f37243a47bd5cfed4 的未提交修复
    command: env CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER='^taro-webpack-react-tailwindcss-v4$' corepack pnpm exec vitest run --update=none -c e2e/vitest.e2e.config.ts e2e/taro-webpack-react-tailwindcss-v4.test.ts
  - claim: 支付宝严格构建后的实际 ACSS 保留作者与生成样式的声明
    kind: integration
    status: passed
    sha: 0990abd79a4dab69b0da229f37243a47bd5cfed4
    environment: macOS，Node 24.18.0，pnpm 12.9.1，Taro 4.2.1，Tailwind CSS 4.3.3
    command: env CI=1 E2E_ISSUE_1286_PLATFORM=alipay E2E_SKIP_BUILD=1 corepack pnpm exec vitest run --update=none -c e2e/vitest.e2e.config.ts e2e/issue-1286-webkit-properties.test.ts
  - claim: 主包源码类型与构建后公共配置声明通过
    kind: integration
    status: passed
    sha: 0990abd79a4dab69b0da229f37243a47bd5cfed4
    environment: macOS，Node 24.18.0，pnpm 12.9.1
    command: corepack pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false && corepack pnpm --filter weapp-tailwindcss tsd
  - claim: 微信及支付宝 IDE、设备中的字体渲染
    kind: native
    status: pending
    sha: 0990abd79a4dab69b0da229f37243a47bd5cfed4
    environment: 微信开发者工具、支付宝开发者工具及小程序设备
    reason: 本轮范围为定向测试和真实构建产物，未连接 IDE 或设备，不能由声明存在推断各宿主的视觉表现
---

# Issue 1286：字体平滑与 WebKit 属性保留

## 症状

排查基线为实施开始时的远端最新 `main`，完整 SHA 见 frontmatter。独立工作树使用 `codex/issue-1286`，原工作目录保持干净。修复实现和 static 基线最终提交为 `0990abd79a4dab69b0da229f37243a47bd5cfed4`；在该提交前运行的测试按当时的 HEAD 加未提交差异记录，不将原始 HEAD 当作已包含修复。

作者样式包含以下声明时，构建丢失 WebKit 字体平滑，Mozilla 声明仍然存在：

```css
.icon {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

构建后的 ESM/CJS handler、prune、finalize 六条路径均复现只剩 `.icon{-moz-osx-font-smoothing:grayscale}`。当时已有 87 项定向测试通过，说明缺少对应回归。新增 PostCSS 回归在修改前出现 30 项失败；新增主包透传回归出现 13 项失败。

## 根因与纠正

共享 WebKit 属性保留名单遗漏了 `-webkit-font-smoothing`。作者 CSS、Tailwind v4 生成、裁剪及最终产物清理都消费这项策略，因此仅修某个 bundler 的末端无法覆盖全部入口。

在 PostCSS 兼容策略中补充默认属性，并统一将扩展名单传给项目自身的声明清理。公开配置为：

```ts
cssOptions: {
  preserveWebkitProperties: ['-webkit-tap-highlight-color'],
}
```

扩展数组只追加默认名单；`[]` 不删除默认项。条目先去除首尾空白，再按大小写无关的完整属性名匹配，重复项去重，非法名称忽略，输入数组保持不变。保留下来的声明不改写属性大小写、值或 `!important`。legacy flex 属性清理也消费同一扩展名单；关键词值、transition 值和前缀 keyframes 继续使用既有规则。外部插件仍执行自己的兼容策略。

主包解析、compiler、普通和 Vue scoped preflight、延迟生成、Webpack 最终清理及来源追踪均透传配置。compiler 同一次异步调用对名单取快照，使样式处理和最终清理一致；调用级数组替换实例扩展数组，后续未覆盖调用恢复实例配置。Web 分支和 Web snapshot 不应用小程序扩展名单。

沿用现有配置内容指纹即可处理数组原位修改。曾把恢复 `[]` 后的 `cache.output === true` 判断为缓存未失效；复核确认其合法复用此前 `[]` 的结果，实际 CSS 与首次结果一致。回归改为验证声明移除及完整输出恢复，不改变缓存指标语义。

## 验证

以下命令从仓库根执行，shell 统一使用 `rtk proxy`。普通 Vitest 均设置 `CI=1` 和 `--update=none`；没有执行会改写 PostCSS fixtures 的整个 `test/v4.test.ts`，没有运行源码格式化命令或文档全量生成器。

### 依赖、包构建与类型

依赖按锁文件安装到本工作树，补齐核心、demo、文档、HBuilderX runner 和 E2E workspace。固定 Node 24.18.0、pnpm 12.9.1，没有锁文件差异。

```sh
corepack pnpm install --frozen-lockfile --offline --filter weapp-tailwindcss... --filter @weapp-tailwindcss-demo/taro-webpack-react-tailwindcss-v4 --filter @weapp-tailwindcss/website
corepack pnpm install --frozen-lockfile --offline --filter @weapp-tailwindcss/hbuilderx-runner...
corepack pnpm install --frozen-lockfile --offline --filter @weapp-tailwindcss/e2e...
corepack pnpm --filter weapp-tailwindcss... run build
corepack pnpm --filter @weapp-tailwindcss/postcss build
corepack pnpm --filter weapp-tailwindcss build
corepack pnpm --filter weapp-tailwindcss exec tsc -p tsconfig.typecheck.json --pretty false
corepack pnpm --filter weapp-tailwindcss tsd
```

构建与主包类型检查通过，[公共类型回归](../../../packages/weapp-tailwindcss/test-d/core.test-d.ts)接受数组及空数组，并拒绝字符串。PostCSS 默认构建沿用既有 `noCheck:true`；额外强制严格检查时，当前与基线在相同依赖环境下均有 86 个相同诊断，本次新增 0 个，不能报告 PostCSS 全量严格类型检查通过。

### 定向回归

```sh
env CI=1 corepack pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/mini-program-prefixes.test.ts test/cache-identity.test.ts test/options-resolver.test.ts test/mini-program-css.test.ts test/mini-program-generated-css.test.ts test/finalize-ast-reuse.test.ts test/call-options-defaults.test.ts test/handler-nested-defaults.test.ts --update=none --coverage.enabled=false
env CI=1 corepack pnpm --filter @weapp-tailwindcss/postcss exec vitest run test/post.test.ts test/generator-plugin.test.ts --update=none --coverage.enabled=false
env CI=1 corepack pnpm --filter weapp-tailwindcss exec vitest run test/compiler/core-compiler-banner.test.ts test/compiler/core-compiler-calc-cache.test.ts test/compiler/core-compiler-webkit-prefixes.test.ts test/bundlers/webkit-prefixes.unit.test.ts test/context/style-options-snapshot.test.ts --update=none --coverage.enabled=false
env CI=1 corepack pnpm --filter weapp-tailwindcss exec vitest run test/ci/architecture-contract.test.ts test/ci/generation-ownership.test.ts --update=none --coverage.enabled=false
```

全部通过。最后补充实例隔离和异步名单快照后，单独重跑 `mini-program-prefixes.test.ts`（35 项）与 `core-compiler-webkit-prefixes.test.ts`（11 项）通过。去重统计为 PostCSS 162 项、主包相关回归 27 项、架构契约 11 项。AST 用例的声明挂载到真实规则中，避免对游离节点调用 `remove()` 得出错误结论。

重建后还以原生 `node` 的 ESM import 和 CJS require 加载当前工作树公共 exports，未使用源码 alias。PostCSS 从包目录运行 `node --input-type=module` / `node`：每种模式验证 7 条路径 × 默认、空数组、扩展、非法名称四种配置，加单参数 helper 兼容，共 29 个场景、141 条断言，分别解析到 `dist/transform.js` / `dist/transform.cjs`。

主包通过 `corepack pnpm --filter weapp-tailwindcss exec node --input-type=module` 的内存脚本分别加载 ESM/CJS `weapp-tailwindcss/core`、`weapp-tailwindcss/generator`、`weapp-tailwindcss/postcss` 和 PostCSS facade：12 次字符串/Root 转换、6 次真实 utility 生成、4 次真实公开生成插件构建通过。覆盖实例配置、空数组覆盖、实例恢复、Root 输入保持、名单原位移除/恢复及两种字体平滑 utility；compiler 均在 `finally` 中释放。

### 真实构建与 static 基线

```sh
env CI=1 TARO_BUILD_STRICT=1 corepack pnpm --filter @weapp-tailwindcss-demo/taro-webpack-react-tailwindcss-v4 build:weapp
env CI=1 E2E_SKIP_BUILD=1 corepack pnpm exec vitest run --update=none -c e2e/vitest.e2e.config.ts e2e/issue-1286-webkit-properties.test.ts
env CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER='^taro-webpack-react-tailwindcss-v4$' corepack pnpm exec vitest run -u -c e2e/vitest.e2e.config.ts e2e/taro-webpack-react-tailwindcss-v4.test.ts
env CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER='^taro-webpack-react-tailwindcss-v4$' corepack pnpm exec vitest run --update=none -c e2e/vitest.e2e.config.ts e2e/taro-webpack-react-tailwindcss-v4.test.ts
env CI=1 TARO_BUILD_STRICT=1 corepack pnpm --filter @weapp-tailwindcss-demo/taro-webpack-react-tailwindcss-v4 build:alipay
env CI=1 E2E_ISSUE_1286_PLATFORM=alipay E2E_SKIP_BUILD=1 corepack pnpm exec vitest run --update=none -c e2e/vitest.e2e.config.ts e2e/issue-1286-webkit-properties.test.ts
```

微信、支付宝均真实编译成功，Taro 4.2.1 使用当前工作树主包产物与 Tailwind CSS 4.3.3。两个平台各 2 项最终声明断言通过，规则位于实际发现的 `app.wxss` / `app.acss` 及独立分包样式中；测试扫描真实后缀并解析四个目标规则，不把固定 app 文件名当作通用构建语义。`-webkit-appearance` 继续移除。

只更新 `taro-webpack-react-tailwindcss-v4` 的 static 项目；10 项用例通过后，以不更新模式重新构建并复验 10 项通过。14 份基线重新生成，实际 Git 差异仅两份 WXSS，共新增 32 行：字体平滑规则、自定义 utility、作者样式，以及显式名单使 NutUI 中两处 tap highlight 声明得以保留。其他基线没有差异。快照使用现有测试序列化器，不格式化源码或重写 PostCSS fixtures。

早期入口因筛选安装遗漏 `cross-spawn` 和 E2E 的 `@tailwindcss-mangle/config` 而未能加载；按冻结锁文件补齐 workspace 后恢复。另一次把 `E2E_SKIP_BUILD=1` 用于既有 static 套件，其初始化清理了 dist，导致 9 项 ENOENT；移除该选项、由入口严格构建后恢复。该套件不能用跳过构建来复用之前的 dist；独立产物读取用例可在显式平台构建后使用该变量。

构建仅报告既有体积与无异步 chunk 警告，微信另有 `punycode` 弃用警告，没有 guard 跳过或编译失败。

### 文档与规则

```sh
corepack pnpm --filter @weapp-tailwindcss/website check:config-docs
corepack pnpm --filter @weapp-tailwindcss/website check:docs-i18n
corepack pnpm change check
corepack pnpm agents:check
git diff --check
```

配置说明与 157 对中英文文档检查通过；PostCSS、主包的中文 patch change intent 通过 repoctl 检查，使用 `Refs #1286`。修改的生产源码通过定向 ESLint；提交 hook 使用 ESLint，未调用源码 Prettier。

## 适用边界

已通过：本地定向回归、包构建、主包类型和公共 ESM/CJS 入口、微信/支付宝严格构建、最终声明及对应 static 基线。

失败已恢复：隔离依赖缺失和 static 套件误用跳过构建。仍存在的非本次诊断：PostCSS 强制全量严格类型检查的基线错误。

未执行：IDE/设备渲染、HMR、其他小程序平台、Web 全站运行、原生 ABI、Windows/Linux 实机及全仓全面测试；未验证当前会话 computer use。没有启动、登录、重启或重置 IDE，没有创建浏览器资源，也未等待远端 CI。声明被保留不等于所有宿主都支持其视觉效果，因此记录保持 `partial`。

## 规则评估

不新增 AGENTS 规则。现有共享 CSS 策略归属、配置指纹、真实 AST 节点、非微信产物、static 基线及分层验收约束已覆盖本次问题；将行为固化在上述回归入口比增加属性特例规则更合适。包版本和发布联动继续由 repoctl 管理，本轮没有执行版本准备、发布或关闭 Issue。
