---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/commit/2fae4ce9a0fc8cfde64e4029b343327e081eee13
baseline: baf8a7320d49ca3c5ae936d0cb6fe6de11e5704b
regressions:
  - website/scripts/homepage-css.test.ts
---

# 首页字体简写被生产压缩器删除

## 症状

中英文网站构建都出现 Css Minimizer 的 `Missing font size ... Ignoring.` 警告。首页 `.home-support__anchor-values strong` 原本指定 `font: 650 0.94rem / 1.4 ui-monospace, ...`，最终 CSS 却只保留颜色。桌面丢失字号、行高、等宽字体及字重，窄屏媒体查询只补回字号。此前多轮全面测试日志已包含相同警告，因此不是此次构建缓存修复引入。

## 根因与纠正

Docusaurus 3.10.2 默认依次执行 CSSNano 和 clean-css 5.3.3。后者 `font` 简写解析器的字重白名单仅接受整百数字，将合法的 `650` 误当字号，产生警告并标记整条声明未使用，随后删除。压缩插件直接使用该输出，没有回退到原声明。普通 CSS 变量会进入另一条动态值路径，与此次问题无关。

保留原 `font` 简写的字号、行高和字体族，将 `650` 移到后置 `font-weight`。CSSNano 不合并字体长属性，clean-css 的同一旧白名单也阻止将 `650` 重新合并进简写，因此当前完整生产压缩链能保留两条声明。没有更改设计值、全局压缩配置或第三方依赖。

只改成四个字体长属性会失去简写隐含的重置语义。保留简写也保留 `font-style`、`font-variant`、`font-stretch` 及 kerning、feature/variation settings 等字体子属性的初始值，避免继承祖先未来的字体设置。`font-palette` 和 `font-synthesis` 本来就不由该简写重置；范围以 [CSS Fonts 4 的 font 定义](https://www.w3.org/TR/css-fonts-4/#font-prop)为准。

## 验证

- `pnpm exec cross-env CI=1 pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/homepage-css.test.ts --update=none`：修复前 1 项失败、1 项通过，重现 `Missing font size at homepage.css:1:6037. Ignoring.` 及缺失的字体声明；修复后 2 项通过。
- `pnpm exec cross-env CI=1 pnpm --filter @weapp-tailwindcss/website exec vitest run --update=none`：13 个文件、66 项测试通过。
- `pnpm exec eslint website/scripts/homepage-css.test.ts`：通过。
- `pnpm exec cross-env CI=1 pnpm --filter @weapp-tailwindcss/website build`：完整依赖构建及英文、中文网站构建通过。重新生成 `website/build` 与 `website/build/zh-cn` 的静态产物；两份最终 CSS 都保留字号、行高、完整字体族与 `font-weight:650`，构建日志中不再出现 `Missing font size` 或 Css Minimizer 警告。
- `pnpm agents:check`、`git diff --check`：通过。
- 扩展检查 `pnpm exec cross-env CI=1 pnpm --filter @weapp-tailwindcss/website typecheck` 发现既有文件的 14 条类型诊断，涉及 API 文档生成、Docusaurus 类型入口和 Playwright 用例；本次新增回归文件没有诊断。首次输出保存为 `.tmp/website-typecheck-first.log`，后续通过[内容元数据契约修复](website-content-metadata-contracts.md)单独解决。

持久回归直接编译实际首页 SCSS，再从网站安装的 Docusaurus core 解析 bundler，复用 `getMinimizers` 的选项和 CssMinimizer 生产执行入口。断言压缩错误与警告为空、实际产物保留完整字体族/字号/行高、后置 650 字重不被简写重置，以及窄屏仍仅覆盖字号。使用 PostCSS AST 兼容压缩器合并选择器，不依赖文本搜索或 jsdom 对字体重置的不完整模拟。

## 适用边界

这是私有文档站样式修复，不改变公开包 API，也不需要 change intent。回归覆盖真实生产压缩链，不代表浏览器截图或设备视觉验收。没有新增或修改 demo，网站构建产物由对应网站构建重新生成。

核对 clean-css 实际实现后，按 `Missing font size` 和 `variable font` 检索上游 Issue，未找到直接对应此非整百字重缺口的记录。本次没有发布上游消息或引入依赖 patch。后续升级 Docusaurus 或压缩器时应继续运行该回归；如更换压缩 API 或其输出表示，应重新核对实际字体语义与重置顺序。

## 规则评估

不新增 AGENTS 规则。现有“失败回归先行、沿转换链定位首次偏离、重新生成受影响产物”的要求足够；用真实压缩产物断言弥补此前仅检查页面布局和文案的测试缺口。
