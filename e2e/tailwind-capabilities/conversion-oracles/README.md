# 已审查转换合同

`reviewedWeappOracles(candidates, officialReferenceCss)` 只接收隔离官方参考 CSS。它不导入产品 escape、PostCSS 转换器，也不接收本轮 WXSS，因此无法把本轮结果反推为预期。

当前 `weapp-keyword-compatibility-v2` 显式替代原字面量合同，范围为默认生成器配置、单类选择器、独立冻结的 ASCII 类名编码、无条件或 `print/screen/all` 媒体条件，以及 `properties.ts` 明确列出的输入。`compatibility.ts` 独立冻结默认兼容规则；其余输入必须逐字保留。默认不启用 rem2rpx，长度的值与单位必须完整保留；`!important`、声明顺序和全部条件也必须保留。任意一项未知则整个候选没有 oracle，不能仅对已知部分通过。

变量和全局初始化依赖、未审查逻辑属性、复杂函数、现代颜色、媒体范围、supports/container、关系及状态选择器和极大圆角仍保留缺口。不能从转换失败推导 unsupported，不能自动接受转换产物为基线。

`reviewedWeappOracleCoverage()` 返回候选去重后的合同覆盖及缺口原因。它不接收转换观察，也不输出通过率。`oracle.support: supported` 仅是 `encoding` 层的预期；编译器保留声明不证明小程序运行时或像素支持。

固定 Tailwind 4.3.3 的 23,286 个 completion 中，当前有 848 个完整候选属于本合同，22,438 个仍缺少独立转换合同；本轮增加 358 个完整候选。另有 36 个字面量示例与 17 个兼容转换示例，共 53 个独立任意属性案例，不加入 completion 总数。三个仅含已知会被裁剪的 WebKit 声明的输入没有非空正向合同，也缺少候选级诊断，继续保留缺口；带标准声明的完整候选则核对裁剪后的全部声明。

| 语法族 | 明确登记的范围 | 仍保留的缺口 |
| --- | --- | --- |
| 控件与交互 | `appearance:auto/none`、四种 `resize`、36 个 `cursor` 关键字、`user-select`、三种无变量 `touch-action`、简单 `will-change` | URL 游标、复合手势和变量依赖 |
| 边框与盒子 | 单值边框样式及物理边、outline 样式、`box-decoration-break` | 多值样式、逻辑属性、带 `--tw-*` 初始化的完整候选 |
| 文本与分页 | 换行、断词、hyphens、文本包裹、分页关键字、caption 位置、普通数字、固定字体伸缩值、数字 tab-size | 变量、函数、未登记的新关键字及组合值 |
| 布局与定位 | 单值 `flex`、列数、网格线整数和 auto、静态网格流及大小关键字、单组 place 对齐、物理 inset、固定背景/对象/变换原点、`aspect-ratio:auto/1 / 1` | 复杂网格、分数/函数、未审查的 place 双组语法 |
| 溢出与效果 | overflow、overscroll、scrollbar 关键字、0–100% opacity、固定 none 值、简单 contain/field-sizing、固定 transition 关键字 | 遮罩组合、现代颜色、时间函数、初始化依赖和复杂效果 |

审查以 [CSS UI](https://www.w3.org/TR/css-ui-4/)、[CSS Text 3](https://www.w3.org/TR/css-text-3/)、[CSS Text 4](https://www.w3.org/TR/css-text-4/)、[CSS Backgrounds](https://www.w3.org/TR/css-backgrounds-3/)、[CSS Flexbox](https://www.w3.org/TR/css-flexbox-1/)、[CSS Grid](https://www.w3.org/TR/css-grid-2/)、[CSS Alignment](https://www.w3.org/TR/css-align-3/)、[CSS Overflow](https://www.w3.org/TR/css-overflow-3/)、[CSS Fragmentation](https://www.w3.org/TR/css-break-3/)、[CSS Fonts](https://www.w3.org/TR/css-fonts-4/) 和 [CSS Transforms](https://www.w3.org/TR/css-transforms-1/) 的明确语法为边界。某属性允许一个字面量，不代表其余值或同一候选的其它声明也被允许。例如包含 `--tw-border-style:solid` 初始化的 `border-solid` 仍整体保留缺口。

以下规则在执行产品前单独冻结，来自现有默认配置与标准语义，不从本轮产物推导：

| 已启用的默认策略 | 独立完整预期 |
| --- | --- |
| `postcss-replace-overflow-wrap` 默认 replace | `overflow-wrap` 改为标准兼容别名 `word-wrap`，保留值 |
| `postcss-opacity-percentage` | 百分比除以 100，生成等价数字 |
| `postcss-logical` 默认 LTR | 仅已审查 `text-align:start/end` 映射 left/right；不外推 RTL |
| `postcss-logical` 物理 inset | 单值展开为 top/right/bottom/left，原简写移除 |
| `postcss-place` 默认 preserve | 生成 align、justify 后保留原简写；safe 值组不可拆散，content 基线缺省 justify 为 start |
| `postcss-page-break` | 列相关值不添加分页别名；其余按已有策略补 page-break 前置声明，page→always、avoid-page→avoid，并保留原声明 |
| `postcss-font-variant` | normal 数字变体前置 `font-feature-settings:normal` |
| v4 autoprefixer 与小程序前缀策略 | background-clip:text 前置 WebKit text 回退；裁剪 user-select、hyphens、box-decoration-break 的 WebKit 同名声明 |

对应产品配置入口为 `packages/postcss/src/defaults.ts`、`autoprefixer.ts`、`compat/mini-program-prefixes.ts` 和 `plugins/preset-env.ts`。既定的分页回退保留行为不等于旧宿主实际支持所有新分页值；此合同只核对编码。

定向回归先固定独立完整预期，逐合同验证声明丢失、错误值及多余覆盖等反例，再执行产品生成器的真实 `weapp` 内存转换。848 个 completion 合同和 53 个任意属性示例均逐候选核对全部声明、顺序、条件和 important。另保留任意值、负值、小数、important 和 print 条件回归。该审查发现了 `postcss-place@11.0.1` 将 `safe center` 拆成两个方向值的缺陷，产品修复独立于 oracle；详细记录见 [place 值组复盘](../../../docs/engineering/lessons/place-alignment-value-groups.md)。

接入时先编译官方参考，将 `attempt.oracle` 同时传给 `conversionCaseContract` 和 `conversionCaseResult`；没有 oracle 的候选继续保留 `not-run`。声明预期必须在执行目标转换前固定，并随 fixture/expectations identity 记录。

验证命令：`CI=1 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/tailwind-weapp-conversion-oracle.test.ts --update=none`。入口仅运行协议回归与纯内存编译，不启动浏览器或微信 IDE，不代表设备 E2E 验收。E2E 精确 alias 指向当前 checkout 的 PostCSS transform/syntax/plugin 源码，避免旧 dist 掩盖源码变化。
