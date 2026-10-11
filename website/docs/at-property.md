---
title: at property
description: at property，提供核心概念、配置说明与实践示例。
keywords:
  - at
  - property
  - at property
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
  - mpx
---
在 CSS 里，`@property` 是一个 **注册自定义属性（CSS Custom Properties）** 的新特性，它解决了原先 `--var: value` 那种“纯字符串变量”的一些缺陷。它主要提供了 **类型约束、初始值、继承控制** 等能力，让浏览器能更高效地处理这些变量，从而带来性能优化。

---

## 1. `@property` 的基本作用

在传统 CSS 里，定义变量只能这样：

```css
:root {
  --main-color: red;
}
```

但浏览器只把它当成字符串，无法提前知道这个变量是“颜色”还是“长度”。这会带来两个问题：

- 无法做类型推断或插值优化（比如动画中间值计算）。
- 每次变量被使用时需要重新解析，性能开销更大。

而 `@property` 可以注册一个有类型的自定义属性：

```css
@property --main-color {
  syntax: '<color>';
  inherits: false;
  initial-value: red;
}
```

这样浏览器就能：

- 知道 `--main-color` 必须是一个颜色；
- 有默认值 `red`；
- 明确是否继承。

---

## 2. 为什么它能优化性能

1. **类型约束 → 加快渲染**
   浏览器不需要把字符串再解析成数值或颜色，而是直接使用已经注册好的类型。

2. **动画性能提升**
   原本 CSS 变量无法参与动画插值，例如：

   ```css
   :root { --size: 10px; }
   div { width: var(--size); transition: width 1s; }
   ```

   这是无效的。但使用 `@property` 注册后，浏览器知道它是 `<length>`，就能平滑插值：

   ```css
   @property --size {
     syntax: '<length>';
     inherits: false;
     initial-value: 10px;
   }
   ```

3. **避免 FOUC/回退渲染**
   有了 `initial-value`，在变量未设置时浏览器不用等到计算阶段才决定默认值，从而减少首次绘制闪烁。

---

## 3. 示例场景

### 动画数值

```css
@property --angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

.box {
  transform: rotate(var(--angle));
  transition: --angle 1s;
}

.box:hover {
  --angle: 360deg;
}
```

👉 盒子会平滑旋转，而不是瞬间跳转。

---

### 渐变颜色

```css
@property --gradient-color {
  syntax: '<color>';
  inherits: false;
  initial-value: blue;
}

.button {
  background: linear-gradient(var(--gradient-color), white);
  transition: --gradient-color 0.5s;
}

.button:hover {
  --gradient-color: red;
}
```

👉 按钮背景色在 hover 时会有渐变过渡。

---

### 响应式尺寸

```css
@property --radius {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}

.card {
  border-radius: var(--radius);
  transition: --radius 0.3s;
}

.card:hover {
  --radius: 20px;
}
```

👉 hover 时圆角平滑过渡。

---

## 4. 小结

- `@property` 是 **注册型 CSS 自定义属性**。
- 带来性能优化的核心原因：**浏览器能提前知道类型和初始值，减少解析和重绘开销**。
- 实用场景：**动画过渡、主题变量、响应式设计**。

---

确实大多数人提到 `@property` 都会联想到 **transition / animation**，因为这是最直观的刚需。但其实它的用途远不止于动画，这里我给你整理一些 **非动画场景下的“刚需”案例**：

---

## 1. **防止变量未定义时的 FOUC（闪烁）**

普通自定义属性如果没定义，会导致样式不生效甚至回退为 `unset`，页面可能闪烁。
`@property` 可以通过 `initial-value` 提供一个强制的默认值，避免在首次渲染时出现意外。

```css
@property --page-bg {
  syntax: '<color>';
  inherits: true;
  initial-value: white;
}

body {
  background: var(--page-bg);
}
```

👉 即使主题系统的 JS 还没注入 `--page-bg`，页面一开始也会用 **white**，不会闪黑/闪透明。

---

## 2. **保证变量输入合法性**

普通 CSS 变量是字符串，随便写都会被吃掉。
但注册后，浏览器会进行 **语法校验**，错误值会被忽略而回退到 `initial-value`。

```css
@property --spacing {
  syntax: '<length>';
  inherits: false;
  initial-value: 1rem;
}

.card {
  padding: var(--spacing);
}
```

👉 如果有人错误地设置了 `--spacing: "abc";`，不会让布局崩掉，而是安全地回退到 `1rem`。

---

## 3. **在继承/不继承上的精细控制**

普通变量默认会继承，往往带来意料之外的问题。
例如定义主题色时，子元素继承了错误的值。
用 `@property` 就能控制是否继承。

```css
@property --border-color {
  syntax: '<color>';
  inherits: false;
  initial-value: gray;
}

.card {
  border: 1px solid var(--border-color);
}
```

👉 即使父元素设置了 `--border-color: red;`，子元素也不会继承，确保边框始终有稳定表现。

---

## 4. **与容器查询（Container Query）结合**

当你写响应式时，可能用变量去驱动不同尺寸的布局。
如果变量是注册过的，浏览器能更高效地重新计算，而不是“字符串再解析”。

```css
@property --col-gap {
  syntax: '<length>';
  inherits: false;
  initial-value: 1rem;
}

@container (width > 800px) {
  .grid {
    --col-gap: 2rem;
  }
}

.grid {
  display: grid;
  gap: var(--col-gap);
}
```

👉 Gap 会随着容器变化自动稳定更新，而不会因为未定义或错误值导致渲染异常。

---

## 5. **保证动态主题系统更鲁棒**

在“暗黑模式 / 多主题”里，用 `@property` 可以确保每个变量有定义，不会因为缺值导致奇怪的 UI。

```css
@property --theme-accent {
  syntax: '<color>';
  inherits: true;
  initial-value: #0066cc;
}

[data-theme="dark"] {
  --theme-accent: #ffcc00;
}

button {
  color: var(--theme-accent);
}
```

👉 即使某个主题忘了定义 `--theme-accent`，也能回退到默认蓝色，而不是无色。

---

## ✅ 总结

除了 `transition`/`animation`，`@property` 在这些场景也算“刚需”：

1. **提供默认值，避免首屏闪烁**
2. **校验输入合法性，保证健壮性**
3. **控制继承，避免子元素样式污染**
4. **容器查询/响应式布局下提升渲染效率**
5. **多主题系统下保证 fallback 值**
