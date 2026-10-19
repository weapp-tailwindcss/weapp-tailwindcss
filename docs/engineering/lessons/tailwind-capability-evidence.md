---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss
baseline: da240e7778aa3d88d29bf94da4b3fad573d988ca
regressions:
  - packages/engine/test/v4.source-modules.test.ts
  - packages/react-native/test/tailwind-entries.test.ts
  - packages/postcss/test/native-typography.test.ts
  - packages/postcss/test/native-shadow.test.ts
  - packages/react-native/test/relative-line-height.test.ts
  - e2e/react-native-evidence-protocol.test.ts
  - e2e/tailwind-hmr.test.ts
  - e2e/tailwind-authoring-generation.test.ts
  - e2e/tailwind-web-variants.test.ts
  - e2e/lynx-source-boundary.test.ts
  - e2e/tailwind-report.test.ts
  - e2e/tailwind-web-layout.test.ts
  - e2e/tailwind-css.test.ts
---

# Tailwind 四端能力与证据边界

## 症状

同一套 Tailwind 4.3.3 候选在 Web、微信、React Native、Lynx 中不能仅靠“生成了 CSS”或“节点可见”判定有效。多入口样式、前缀、主题变量和共享扫描目录还会改变实际生成及编码结果。历史原生报告与本轮 static 使用不同的 catalog 身份，不能互相背书。

## 根因与纠正

- engine 拼接多个 CSS 入口时丢失入口目录，导致相对 `@config` / `@plugin` 从错误位置解析；现在在入口边界固定模块身份。
- RN 不能把独立前缀及主题的 CSS 合成一个 design system；现在逐入口生成、解析变量和编码，再按来源顺序合并 manifest。诊断用 raw CSS 的拼接不再参与二次编码。
- 共享 TS 数据包含独立 authoring/parity 资料，而且源码字符串的引号转义不是最终候选原文。应用只扫描 `compatibility-candidates.txt`，真实 Scanner 回归逐项核对文本与 catalog 完全一致。
- 字重的主题变量必须递归解析；未解析和循环变量产生诊断，不能把 `var(...)` 交给原生宿主。相对行高保留倍率元数据，在最终字号层叠后换算，不能输出 1.25px。多层阴影与 spread 必须完整编码，不能近似为首层；规则局部变量也不能污染全局默认值。
- 报告从每条 required assertion 的层级推导证据要求，视觉子断言必须有本例本轮截图。布局案例检查真实子项与几何，避免 preflight 默认值或未被布局消费的 computed property 掩盖失败。
- 扫描不能只检查 classSet：独立参考逐候选检查实际声明、条件、全局依赖和排除结果，产品候选只能来自真实源码。
- 原生负向结果必须有明确的候选诊断；空规则或静默丢失是失败，不能自动变为“不支持”。
- Web 状态在触发前、触发后和恢复后验证，具名作用域和组合条件增加中间负控制；源码 HMR 通过真实 Vite 服务连续增、替、删并刷新，保存标识、样式、WebSocket 消息和同页面身份共同验真。
- 候选规则同时比较选择器、条件和同一属性的声明顺序；另行检查完整官方参考中的全局变量、动画帧与 property 注册，避免只保留 class 声明的误报。

## 验证

定向验证使用 `CI=1` 和 `--update=none`：

- `pnpm e2e:tailwind:contract`：注册表、报告身份、语义、浏览器分组和反误报合同。
- `pnpm --filter @weapp-tailwindcss/engine exec vitest run test/v4.source-modules.test.ts --update=none`：来源模块的 Windows、POSIX 与网络共享路径。
- `pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/lynx-rspeedy.test.ts e2e/lynx-source-boundary.test.ts e2e/lynx-static-evidence.test.ts e2e/wechat-session-boundary.test.ts --update=none`：真实编码、扫描及微信登录态边界。

静态基线由 `pnpm e2e:tailwind:static:update`、`pnpm e2e:react-native:static:update`、`pnpm e2e:lynx:static:update` 分别显式更新，正常运行重新生成后与提交基线比较。基线更新只证明生成与编码产物，不能证明原生设备通过。

全面验收必须另取本轮 extended 预检、当前会话 computer use 与 verify，再运行 `pnpm e2e:tailwind --preflight-report <本轮报告>`。实际执行记录位于 `e2e/.artifacts/tailwind/<run-id>/index.md`，包含通过、失败、阻塞和未执行范围；没有本轮记录时，本复盘不声明四端通过。

## 适用边界

能力清单覆盖固定版本的注册项和有限补全，任意值按语法分支取样。runtime 夹具缺口、缺少独立转换 oracle、不可触发状态及设备阻塞均须保留，不能自动变成“不支持”，也不能用同属性的其他案例填充。第三方插件任意实现需另行登记。

## 规则评估

继续采用独立 worktree、精确候选、生成器单一归属、预检强门禁和微信登录态保护。无需放宽上级安全规则；新增共享目录和能力 runner 的领域规则已登记到规则索引。
