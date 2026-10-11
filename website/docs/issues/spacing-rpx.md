---
title: 微信小程序 --spacing 与 rpx 计算限制
description: 说明 Tailwind CSS 4 的 --spacing 使用 rpx 时，微信小程序的 calc 尺寸偏差、cssCalc 预计算限制和运行时主题取舍。
keywords:
  - weapp-tailwindcss
  - Tailwind CSS 4
  - 微信小程序
  - spacing
  - rpx
  - calc
  - cssCalc
  - CSS 变量
---

# 微信小程序 --spacing 与 rpx 计算限制

Tailwind CSS 4 允许在 `@theme` 中设置 `--spacing: 1rpx`，但微信小程序中生成了合法 WXSS，不代表最终尺寸一定与直接写 `rpx` 相同。依赖该基数的尺寸、内外边距等工具类可能保留运行时乘法：

```css
@theme {
  --spacing: 1rpx;
}
```

```css title="未静态化时的声明示例"
.w-32 { width: calc(var(--spacing) * 32); }
.p-4 { padding: calc(var(--spacing) * 4); }
```

相关复现、环境和修复进度见 [Issue #1214](https://github.com/sonofmagic/weapp-tailwindcss/issues/1214)。下面分别说明微信运行时的限制和库侧构建链路的修复；包含该修复的版本发布后，仍应检查实际产物。

## 默认自动适配与显式配置

当前源码新增 `cssCalc: 'auto'`：明确识别为微信小程序且使用 Tailwind CSS 4 时，未配置 `cssCalc` 默认采用此模式。Vite 微信构建在完整 CSS 产物作用域内，将固定 rpx 主题直接计算为最终长度，无需额外配置：

```css
/* @theme { --spacing: 1rpx; } */
.w-32 { width: 32rpx; }
.p-4 { padding: 4rpx; }
```

这是相对 5.5.10 的行为变更；5.5.10 默认仍保留运行时 calc。只有包含本次变更的版本才具备新的默认行为，请核对安装版本和最终产物。

自动模式只接受可完全归约为 rpx 长度的 calc，包括安全别名及 `@theme inline` 产生的字面量。它不会展开普通 `var()`，不会顺便计算 px、rem、百分比或混合单位。已有 `true`、变量白名单和对象配置仍按显式选择执行；嵌套 `cssOptions.cssCalc` 优先于顶层兼容字段。

**默认不会同时把 rpx 和 px 间距都固定化。** 下表使用普通 `@theme`，目标为微信小程序、Tailwind CSS 4，Vite 已取得完整样式上下文且变量无已知覆盖；未额外开启单位转换或自定义插件改写。表中展示最终声明，忽略格式化差异：

| 主题配置 | `cssOptions.cssCalc` | `mt-2` | `gap-2` |
| --- | --- | --- | --- |
| `--spacing: 1rpx` | 未配置或 `'auto'` | `margin-top: 2rpx` | `gap: 2rpx` |
| `--spacing: 1px` | 未配置或 `'auto'` | `margin-top: calc(var(--spacing) * 2)` | `gap: calc(var(--spacing) * 2)` |
| `--spacing: 1px` | `true` | `margin-top: 2px` | `gap: 2px` |
| `--spacing: 1rpx` 或 `1px` | `false` | `margin-top: calc(var(--spacing) * 2)` | `gap: calc(var(--spacing) * 2)` |

`true` 也可以计算其他符合条件的单位；`false` 关闭本插件的计算，并不阻止其他插件展开变量或改写表达式。若存在局部覆盖、条件覆盖或不完整上下文，rpx 变量也会保留表达式。需要运行时更新时，参见下方动态变量示例。

Vite 在作者 PostCSS 插件完成后，根据产物图收集样式，再计算、转换单位。小程序宿主可以共同加载没有 CSS 导入边的页面或组件样式，因此自动模式保守纳入同轮全部 CSS 资产；即使实际互相隔离，冲突值也会阻止自动计算。显式配置继续使用既有入口及导入作用域。局部覆盖、条件规则、多来源冲突、循环、未知依赖和 `@property` 会阻止变量静态化。导入样式不在产物图内时，不把上下文当成完整；其他尚未提供完整作用域的适配器只化简字面量，不凭单文件冻结变量。主题、候选、导入或作者 CSS 改变后，watch 会从原始表达式重新判断。

:::warning 动态主题必须显式退出
默认自动模式将通过上述分析的 rpx 主题视为固定值。静态分析无法预测未来 JavaScript 或内联样式的覆盖；已经生成的 `width: 32rpx` 不会再响应 `--spacing` 更新。需要这种动态行为时请配置：

```ts
WeappTailwindcss({
  cssOptions: { cssCalc: false },
})
```

退出后仍保留微信运行时的 rpx calc 限制；可以由业务直接提供最终 rpx 尺寸。自动模式不修改微信内部换算算法。H5、原生 App、其他小程序及未知平台不会默认启用本适配。
:::

## 构建期风险提示

:::warning 建议性诊断，不代表构建失败
当生成目标为 `weapp`，且配置或框架环境明确识别为微信小程序时，插件会收集 Tailwind CSS 4 输入中的 `@theme` / `@theme inline` 的 rpx 主题变量。构建器完成样式计算和单位转换后，仅当输出中仍存在相关变量的 `calc` 或内联 rpx 的 `calc` 时，才输出 `[tailwindcss@4][rpx-theme]` warning。

因此，默认配置下 `--spacing: 1rpx` 已生成 `width: 32rpx` 等静态长度时不再提示；未使用的 rpx 主题变量也不会触发警告。局部或条件覆盖、未知导入以及显式关闭计算等情况仍可能保留运行时表达式，此时提示检查最终样式。

H5、普通 Web、其他小程序和无法确认平台的构建不提示。诊断复用生成阶段的主题来源信息和构建器产物，不额外扫描业务源码，不修改 CSS、类名集合或退出状态。

同一构建会话最多输出一次实际风险警告。首轮静态化成功不会占用额度，后续 watch/HMR 新增覆盖导致运行时 calc 时仍可提示；已经提示后不重复刷屏。沿用 `logLevel`：`'warn'` 保留，`'silent'` 或 `'error'` 隐藏，无需新增配置。
:::

Vite 在最终资产的 calc 和单位转换之后检查，Webpack 在最终 CSS 资产收尾阶段检查，Gulp 在 `transformWxss` 或 `adaptWxss` 完成后检查；单独 `generateWxss` 不提前提示。

| 最终样式检查结果 | 行为 |
| --- | --- |
| 已归约为静态 rpx，或未使用相关表达式 | 不警告 |
| 仍含相关变量或内联 rpx 的运行时 `calc` | 输出一次风险提示 |
| 当前 CSS 无法解析 | 跳过该资产，不中断构建，也不占用提示额度 |

没有警告不等于所有作用域和设备已经验证。后续自定义插件仍可能改写产物；动态主题应显式设置 `cssOptions.cssCalc: false` 保留运行时语义，并在目标设备验证微信自身的 rpx 计算限制。

## 微信对 rpx 的换算可能放大基数误差

在无 Tailwind 的原生 WXSS 对照中，`calc(1rpx * 32)` 测得 `32px`，直接 `32rpx` 测得 `16px`。该对照使用微信开发者工具 `2.02.2608070`、基础库 `3.17.3`，模拟器窗口宽度为 `390`、DPR 为 `3`。

在同一 DevTools 环境补测了不同基数和单位位置：

| 表达式 | 实测宽度 |
| --- | --- |
| `calc(1rpx * 8)` | `8px` |
| `calc(3rpx * 8)` | `8px` |
| `calc(2rpx * 8)` | `8px` |
| `calc(1 * 8rpx)` | `4px` |
| `calc(8 * 1rpx)` | `8px` |
| 直接 `8rpx` | `4px` |
| 直接 `16rpx` | `8px` |
| 直接 `24rpx` | `12px` |
| 直接 `4px` | `4px` |
| 直接 `8px` | `8px` |

用户此前也反馈 `calc(1rpx * 8) = 8px`、`calc(1 * 8rpx) = 4px`；本次已在上述环境独立复测，并补充了 `3rpx`。这些结果支持“带单位的操作数先独立换算或量化，再参与乘法，误差被乘数放大”的解释。以窗口宽度 390 为例，`1rpx` 的理论比例约为 `0.52px`，但不能据此确认微信内部一定采用 `0.5px` 后四舍五入成 `1px`；具体算法和取整阶段仍未公开确认。不能把表中的 px 数值当作所有设备上的固定换算比例。

`calc(3rpx * 8)` 为 `8px`，而直接 `24rpx` 为 `12px`，说明把最终结果写成直接长度可以避开这次中间量化。偶数基数也不能保证安全：此前原生对照中，`calc(2rpx * 32)` 与直接 `64rpx` 分别测得 `32px` 和 `33px`。

`calc(1 * 8rpx)` 改变了携带单位的数值，并非只交换左右顺序；不能据此认为 `calc(8 * 1rpx)` 可以修复。

## cssCalc 的能力与已知限制

微信 v4 的默认 `'auto'` 只处理固定 rpx。需要显式选择变量（也包含其他可计算单位）时，可以配置：

```ts
WeappTailwindcss({
  cssOptions: {
    cssCalc: ['--spacing'],
  },
})
```

这个配置的目标是把已知的 `calc(1rpx * 32)` 归约成 `32rpx`，让微信只换算最终长度。使用时需要注意：

- **预计算需要固定的变量上下文。** 当前构建链路保留 Tailwind v4 的有效主题和完整原始声明，按共同样式作用域判断固定变量；Vite 构建延后到最终 CSS 产物阶段计算。`--spacing: 1rpx` 配合 `cssCalc: ['--spacing']` 可以输出 `32rpx` 等最终长度。已知动态覆盖、来源冲突、无法解析或未选择的变量保留表达式，也不会仅因存在 `var()` fallback 就被冻结。
- **保留原声明是独立选择。** `cssCalc: true` 和数组形式默认直接替换可求值的 `calc()`；对象形式的 `preserve: true` 会保留原始声明，后面的有效表达式可能覆盖静态结果。`cssCalc` 不再隐式开启 `cssPresetEnv` 的全局变量展开；用户显式开启该独立功能时，应另行核对其输出和动态主题语义。
- **单位转换不等于乘法预计算。** 开启 `rem2rpx`、`px2rpx`，或确认最终变量已变成 `rpx`，都不能单独证明运行时 `calc` 已消除。

构建后应检查工具类的最终属性值，以及同一属性后面是否还有会覆盖它的表达式。只确认 `--spacing: 1rpx` 和类名存在还不够。

## @theme inline 与自动模式

微信 v4 自动模式会归约 `@theme inline { --spacing: 1rpx; }` 产生的 `calc(1rpx * 32)`，输出 `32rpx`。显式关闭计算时，inline 本身不会消除乘法，微信运行时偏差仍可能发生。

显式 `cssCalc: ['--spacing']` 继续经过原有计算路径。需要变量在运行时变化时，不应使用 inline 或静态计算；请显式关闭自动模式并自行提供最终尺寸。

## 固定尺寸与运行时主题如何选择

对需要精确参与 `calc` 的固定尺寸，优先使用 `px`，或在构建期直接合并成最终长度。若必须保留 `rpx` 基数，可以优先尝试较大或偶数基数，但是否改善取决于设备换算比例，仍需在目标设备上验证；偶数 `rpx` 不是严格保证。当前最稳妥的写法是直接写最终 `rpx` 值，例如：

```html
<view style="width: 32rpx; padding: 4rpx"></view>
```

也可以使用 `w-[32rpx]`、`p-[4rpx]` 等任意值，并检查最终 WXSS 是否输出相应的直接长度。例如固定像素间距可以设置 `@theme { --spacing: 1px; }`，并检查最终 WXSS 中仍保留 `px`，没有被 `px2rpx` 转回 `rpx`。这会改成固定像素尺度，不再随窗口宽度按 `rpx` 缩放。不要按某台设备的比例把 `rpx` 预转为 `px`，也不要添加经验补偿系数。

如果需要在页面、组件或主题切换时覆盖 `--spacing`，静态化会改变行为：已经生成的 `width: 32rpx` 不会再随 `--spacing` 更新。将固定值通过 `@theme inline` 内联也会失去对该变量的运行时引用。只对构建期固定的变量启用这种策略；动态场景可以改为运行时计算最终尺寸并更新样式，避免继续放大一个很小的 rpx 基数。

### 动态修改 px spacing

下面的 uni-app Vue 示例通过内联样式更新普通 `@theme` 变量。`'auto'` 本身不会固定化 px 变量；这里显式设置 `cssCalc: false`，明确保留运行时计算，同时关闭 `px2rpx`，保持固定像素单位。不要额外配置把 px 转回 rpx 的单位转换规则。

```ts title="vite.config.ts 中的插件配置"
WeappTailwindcss({
  cssEntries: ['./src/tailwind.css'],
  cssOptions: {
    cssCalc: false,
    px2rpx: false,
  },
})
```

```css title="src/tailwind.css"
@import 'tailwindcss';

@theme {
  --spacing: 4px;
}
```

```vue title="页面组件"
<script setup lang="ts">
import { ref } from 'vue'

const spacing = ref(4)
</script>

<template>
  <view :style="{ '--spacing': `${spacing}px` }">
    <view class="mt-2 flex gap-2">
      <view>A</view>
      <view>B</view>
    </view>
    <button @click="spacing = spacing === 4 ? 8 : 4">
      切换间距
    </button>
  </view>
</template>
```

`mt-2` 和 `gap-2` 保留对 `--spacing` 的引用，间距随基数从 `4px` 切换为 `8px` 而从 `8px` 变为 `16px`。变量作用于绑定节点及继承它的后代。这里应使用普通 `@theme`，不要改成把固定值内联到工具类的 `@theme inline`，否则运行时修改 `--spacing` 不会影响已内联的值。

### 动态提供最终 rpx 长度

需要随窗口宽度缩放时，可以沿用上面的插件配置和 Tailwind 入口，在 JS 中计算最终 rpx 长度，再交给 CSS 变量直接使用：

```vue title="页面组件"
<script setup lang="ts">
import { ref } from 'vue'

const spacing = ref(1)
</script>

<template>
  <view>
    <view
      class="w-[var(--box-width)] p-[var(--box-padding)]"
      :style="{
        '--box-width': `${spacing * 32}rpx`,
        '--box-padding': `${spacing * 4}rpx`,
      }"
    >
      动态尺寸
    </view>
    <button @click="spacing = spacing === 1 ? 3 : 1">
      切换尺寸
    </button>
  </view>
</template>
```

工具类直接使用 `width: var(--box-width)` 和 `padding: var(--box-padding)`。基数为 `1` 时，变量值为 `32rpx`、`4rpx`；切换为 `3` 后变为 `96rpx`、`12rpx`。微信只需换算最终长度，无需在 CSS 中对小 rpx 基数做乘法。单纯设置 `cssCalc: false` 并继续使用 `calc(var(--spacing) * N)`，仍可能遇到微信运行时的 rpx 计算偏差。

## 验证范围

- 同时检查最终 WXSS 和实际尺寸，比较 `calc(1rpx * 8)`、`calc(1 * 8rpx)`、`calc(8 * 1rpx)` 与直接 `8rpx`；补充 `3rpx`、偶数、小数及负值对照。
- 修改主题值后重新验证开发模式和生产构建，确认没有使用旧的预计算值。
- 记录设备窗口宽度、DPR、基础库和渲染后端。现有独立运行时证据覆盖上述 DevTools 环境，尚未验证 Android/iOS 真机或 Skyline；不能直接推广到 H5 或其他小程序平台。

配置说明见 [CSS 变量计算模式](../multi-platform.md#css-变量计算模式)。
