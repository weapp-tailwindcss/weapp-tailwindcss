# Web variant 受控夹具

这里维护独立声明的 DOM、状态动作和 computed style 预期。受控场景与原有夹具在 Firefox/WebKit 合计覆盖 82 个 Tailwind 4.3.3 variant root；这两个引擎的其余 6 个 root 在覆盖矩阵中保留 `not-run`，限制逐项记录在 `gaps.ts`，具体补齐方案见 `../../web-context/remaining-variants.ts`。`fixture-defined` 只表示夹具存在，实际通过以本轮浏览器报告为准。

| 文件 | 场景 | 实际动作 |
| --- | --- | --- |
| `structural.ts` | first/last/only、odd/even、of-type、nth、empty | 增删指定类型的兄弟节点、改变文本；of-type 保留其它类型兄弟作为负控制 |
| `states.ts` | 表单状态、inert、direction、focus-within、has/in/not | 输入值、属性、原生 checkbox/focus 和真实鼠标动作 |
| `media.ts` | 五个主题断点、max、orientation、print、motion、container | 改变视口、媒体模拟和实际容器尺寸 |
| `combinations.ts` | 具名 group/peer/container、viewport+hover、container+data | 先触发错误作用域或分别满足单个条件，再满足完整条件 |
| `pseudo.ts` | 子代/后代、伪元素、键盘焦点、fragment、原生媒体选项 | 真实迁移节点、选中文本、打开模态、Tab 导航、改变 hash；伪元素额外核对宿主颜色不受影响 |

每个场景必须验证 `before → after → restored`。组合条件分别增加 `only-viewport` / `only-hover` 或 `only-container` / `only-data` 观测，缺失任一条件时均不能被判定为完整条件通过。具名作用域先在错误名称上执行真实动作，并要求目标仍保持原样。

动作实现位于 `../controls.ts`。初始化设置声明的前置环境，触发过程逐项执行真实动作；检查点在动作完成后读取目标并保存截图。触发中途失败时仍恢复已经改变的环境；恢复失败进入失败报告。

`e2e/tailwind-web-variants.test.ts` 固定剩余 `not-run` 清单，并拒绝不触发、无条件生效、部分条件提前生效、缺失中间观测和未恢复的报告。这些协议单测不启动浏览器。真实验证由统一入口运行，并为每个浏览器生成本轮截图和测量产物。

调整夹具后，在仓库根目录执行 `pnpm e2e:tailwind:static:update`，审查基线，再以 `CI=1` 和 `--update=none` 运行定向回归；本地浏览器调度须消费本轮扩展预检。

Chromium 另有 `native-media-contrast-less` 原生 CDP 夹具，检查 no-preference、less、more、custom 与恢复；使用独立 CSS 参考、未加 class 的对照和绑定 run/phase 的 PNG 像素。统一门禁复读 sidecar、CSS、PNG 后重算。Chromium 为 83/88 个 root 提供夹具，Firefox/WebKit 仍为 82/88；夹具存在不等于本轮运行通过。
