---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/issues/1319
baseline: e769e69b97c88b379a80d3cabca4fa20330b999a
regressions:
  - packages/weapp-tailwindcss/test/uni-app-x/compiled-border-preflight.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-template-assets.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-html-processing.unit.test.ts
  - packages/weapp-tailwindcss/test/bundlers/vite-css-transform-task.unit.test.ts
  - e2e/issue-1319-static.test.ts
  - e2e/issue-1319-mini-static.test.ts
verification:
  - claim: 编译后宿主补齐边框基础类，配置、缓存及已有 uni-app x 回归通过
    kind: unit
    status: passed
    sha: 56aee0671509d20b034891ad96f241d499bc824e
    environment: macOS，Node 24.18.0、pnpm 12.14.0；测试工作区随后原样提交为该 SHA
    command: pnpm exec cross-env CI=1 pnpm --filter weapp-tailwindcss exec vitest run test/ci/architecture-contract.test.ts test/ci/framework-boundaries.test.ts test/uni-app-x test/bundlers/vite-html-processing.unit.test.ts test/bundlers/vite-template-assets.unit.test.ts test/bundlers/vite-css-transform-task.unit.test.ts test/bundlers/vite-bundle-state.unit.test.ts test/source-line-limit.test.ts --update=none
  - claim: H5 实际 HTML 宿主匹配零宽基础规则，方向、组合、覆盖及 1160 静态回归通过
    kind: integration
    status: passed
    sha: 56aee0671509d20b034891ad96f241d499bc824e
    environment: macOS，npm uni-app 编译器 3.0.0-alpha-5020220260725001，Playwright Chromium headless；测试工作区随后原样提交为该 SHA
    command: pnpm exec cross-env CI=1 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1319-static.test.ts e2e/issue-1160-static.test.ts --update=none
  - claim: 微信 IDE 页面截图和真实计算样式仍待验收
    kind: native
    status: pending
    sha: 56aee0671509d20b034891ad96f241d499bc824e
    environment: macOS，用户已开启的微信 IDE；通过受保护 Launcher 连接
    reason: IDE 服务被另一任务的服务租约锁占用，保护器拒绝并发打开项目；未删除其他任务的锁，未启动或重启 IDE，未改变登录态
---

# Issue 1319：编译后宿主与边框重置的归属

## 症状

Issue 的 `div.border-t-[1px].border-solid` 在微信小程序中出现额外三边框。原片段使用 uni-app x、weapp-tailwindcss 5.6.3、Tailwind CSS 4.3.3。需求是顶部 1px、右下左三边 0，作者配置的全边框及覆盖仍然生效。

本次在独立分支增加 VDOM demo 页面，保留原片段及九个方向/组合探针。源码只读转换已复现基础类遗漏；新回归在修复前失败。后续真实 H5 验收又发现相同视觉症状，不能用仅存在 utility 的静态证据宣称修复。

## 根因与纠正

小程序的 SFC 转换只给源码 `view/text` 添加 `weapp-tw-border`。DCloud 编译器随后把 `div` 映射为 `view`，这个宿主没有匹配组件已有的零宽重置。`border-solid` 于是暴露其他方向的默认边宽。

修复在现有 Vite 框架产物策略增加内部模板挂点。uni-app x 适配器只在模板对应的唯一样式资产确实包含基础规则时授权注入，按编译后的实际 `view/text` 处理，不维护 HTML 标签别名表，不回读源码或写输出目录。样式关联来自产物身份，后缀来自实际资产；增量缺省、删除、输出目录切换及缓存策略都有回归。脚本块、动态和空 class、重复转换保持原语义。

H5 的首次偏离发生在 bundle CSS 任务：缓存源码的 Tailwind root import 已由占位符替代，只剩 `@source/@config/@reference` 等上下文。原资产包含全局 `border:0 solid`，却被宽泛的 root 指令判断授权再次生成。排查时原 CSS 为 44,834 字节，重生成结果仅 2,159 字节且没有基础重置。修复改用真正的 Tailwind root import 判断，保留已完成的模块生成结果；真实入口的候选更新继续原路径。没有通过增加 `div` 重置或扩大控件范围掩盖问题。

## 验证

- 受影响构建闭包（含 debug-uni-app-x）、类型检查、修改源码及 E2E 的 ESLint、architecture:check、release status、git diff --check 通过。351 项定向 Vitest 通过。
- H5 的 #1319 与 #1160 static 使用 `--update=none` 通过。新增检查从真实 render 调用读取宿主标签，并验证零宽基础选择器真正匹配 `div`；作者 class 规则和条件规则不能充数。
- H5 使用确认根目录身份的本轮生产输出。Chromium 390×844 实测原片段 `[top,right,bottom,left]=[1,0,0,0]`，颜色为 `rgb(226,232,240)`；九个探针通过，无页面异常。截图与计算样式位于忽略目录 `e2e/.artifacts/issue-1319/`，浏览器、临时 HTTP 服务均已关闭。
- 微信静态验收使用 HBuilderX 正式版 5.33.2026102401 编译，确认 `div -> view`，基础类与零宽声明先于 utility，#1160 及 #1319 mini-static 均通过。
- 微信运行验收在打开项目之前被另一任务的租约锁阻断，不能将编译成功当成微信截图或原生验收通过。未执行本地全面验收或 App/Vapor 设备验收，未使用旧预检报告放行。

限定 VDOM 项目生成了 #1319 H5/微信、通用 static 基线。新增组件改变候选排列，使 #1160 mini 基线中方向宽度、style、color 的顺序变化；逐项核对值未变，零宽仍在最前，显式顶部覆盖仍在全边框之后。基线单独更新后以禁止更新模式复验，没有通过排序隐藏级联差异。

```sh
pnpm exec cross-env E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_ISSUE_1319_MINI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1319-static.test.ts e2e/issue-1319-mini-static.test.ts -u
pnpm exec cross-env E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_SKIP_OPEN_AUTOMATOR=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/uni-app-x-vdom-tailwindcss-v4.test.ts -u
pnpm exec cross-env E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_ISSUE_1160_MINI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1160-mini-static.test.ts -u
pnpm exec cross-env CI=1 E2E_PROJECT_FILTER=uni-app-x-vdom-tailwindcss-v4 E2E_SKIP_OPEN_AUTOMATOR=1 E2E_ISSUE_1160_MINI=1 E2E_ISSUE_1319_MINI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1160-mini-static.test.ts e2e/issue-1319-mini-static.test.ts e2e/issue-1160-static.test.ts e2e/issue-1319-static.test.ts --update=none
```

## 适用边界

沿用 `.uvue/.nvue` 支持范围及内部框架策略。小程序默认只补齐实际 `view/text`，不会扩展到 button/input/label；`cssPreflight:false`、自定义边框默认值和 `cssPreflightRange:'all'` 保持语义。H5 保留输入本身已经生成的 Tailwind preflight，没有合成新的默认规则。没有新增公开配置或导出 API。

源码 PR 使用 `Refs #1319`，不包含合并、发布或关闭 Issue。远端验收以 PR 最新 head 的全部启用检查为准，Windows HBuilderX 专项工作流仅由手动 dispatch 启用，不能计为自动执行成功。

## 规则评估

不新增 AGENTS 规则。已有的构建图归属、生命周期处理、定向基线更新、微信会话保护与证据分层约束已经覆盖本次风险；把边界固化为测试比重复添加规则更有效。
