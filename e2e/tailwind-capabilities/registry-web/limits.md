# Web utility 参考语义与固定引擎限制

注册表中的“Tailwind 能编译”与“浏览器接受该 CSS 值”是两个合同。运行时见证不再使用 `contain-[17px]` 等无类型任意值，也不使用 CSS Grid 禁止的第 0 条网格线。默认补全清单保持完整，修订的 7 个见证及声明已显式更新 inventory。

`limits.ts` 在运行前按案例和引擎登记下表；固定版本为 Chromium 156.0.8078.4、Firefox 157.0、WebKit 27.2。每项保留原候选及案例 ID。升级后版本断言失败，必须重新审查；不能由本轮官方参考无效果增加限制。

| 候选 | Chromium | Firefox | WebKit | 独立依据 |
| --- | --- | --- | --- | --- |
| `break-before-all`、`break-after-all` | 语法负向 | 语法负向 | 语法负向 | CSS Fragmentation 定义 `all`，固定版本尚未实现 |
| `justify-baseline` | 语法负向 | 语法负向 | 语法负向 | CSS Box Alignment 的 `justify-content` 值域不包含 `baseline` |
| `mix-blend-plus-darker` | 语法负向 | 语法负向 | 正向 | 固定 Chromium / Firefox 未实现该混合运算 |
| `break-before/after-column`、`break-before/after-avoid-page` | 正向 | 语法负向 | 正向 | 固定 Firefox 未实现对应分栏 / 分页值 |
| `text-pretty` | 正向 | 语法负向 | 正向 | 固定 Firefox 未实现 `pretty` |
| `forced-color-adjust-auto/none` | 正向 | 正向 | 语法负向 | 固定 WebKit 未实现该属性 |
| `mask-clip/origin-fill/stroke/view` | 正向 | 正向 | 语法负向 | 固定 WebKit 未实现对应 SVG geometry-box 值 |
| `place-content-baseline` | 正向 | 正向 | 语法负向 | 固定 WebKit 未实现该值 |
| `antialiased`、`subpixel-antialiased` | 正向 | Linux 上为 computed 缺失负向；macOS 正向 | 正向 | `-moz-osx-font-smoothing` 文档明确仅适用于 macOS |

每个语法负向案例必须同时取得 `CSS.supports=false`、独立 `CSSStyleDeclaration` 拒绝声明、官方参考与无类对照保持相同，以及产品与参考样式 / 几何相同的证据。产品原始 CSS 仍须在该候选选择器下保留准确声明。字体的 Linux 负向案例则明确要求语法接受但不暴露 computed value。任何证据缺失、声明开始被接受、产品丢失声明或版本变化均失败。

规范 / 文档 URL 随各项限制写入合同并参与 fixture hash。每批测量保存独立声明解析记录；截图和原始 CSS 与本轮 run ID、版本和 hash 绑定。

Firefox 的 `scrollbar-auto/none/thin` **保持正向合同**。Playwright Juggler 在后台模式注入 `scrollbar-width:none !important` 的 UA stylesheet，优先级覆盖所有 author 样式。仅这 3 例使用 Playwright 内置的 WebDriver BiDi，启动同一库存、同一版本的 Firefox，保存三帧测量及单独截图。额外浏览器保持 `headless:true`，只使用任务临时 profile，并在 `finally` 关闭；不改浏览器文件或用户配置。其余案例继续复用主会话。

`registry.css` 纳入 `pnpm e2e:tailwind:static:update`。语义基线明确避开默认值与别名重合，`::placeholder` 使用空 input 并读取对应伪元素，分栏断点使用真实 block 与 multicol 上下文，overflow 的正交轴保持 visible。这些修改不降低参考有效性或产品等价判定。
