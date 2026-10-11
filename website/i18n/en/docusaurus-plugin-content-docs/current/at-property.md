---
title: at property
description: 'at property: Current concepts, configuration guidance, and practical examples for weapp-tailwindcss users.'
keywords:
  - at
  - property
  - at property
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
---

In CSS, `@property` is a new feature of **registering custom properties (CSS Custom Properties)**, which solves some of the defects of the original "pure string variable" like `--var: value`. It mainly provides **type constraints, initial values, inheritance control** and other capabilities, allowing the browser to process these variables more efficiently, thus leading to performance optimization.

---

## 1. Basic functions of `@property`

In traditional CSS, the only way to define variables is:

```css
:root {
  --main-color: red;
}
```

But the browser only treats it as a string and cannot know in advance whether this variable is "color" or "length". This will bring about two problems:

- Unable to do type inference or interpolation optimization (such as animation intermediate value calculation).
- Each time the variable is used, it needs to be re-parsed, which has a greater performance overhead.

And `@property` can register a typed custom property:

```css
@property --main-color {
  syntax: '<color>';
  inherits: false;
  initial-value: red;
}
```

This way the browser can:

- Know that `--main-color` must be a color;
- Has default value `red`;
- Clarify whether to inherit.

---

## 2. Why it can optimize performance

1. **Type constraints → Speed up rendering**
   The browser does not need to parse the string into a numerical value or color, but directly uses the registered type.

2. **Animation performance improvement**
   Originally CSS variables cannot participate in animation interpolation, for example:

   ```css
   :root { --size: 10px; }
   div { width: var(--size); transition: width 1s; }
   ```

This is invalid. But after registering with `@property`, the browser knows that it is `<length>` and can interpolate smoothly:

```css
@property --size {
  syntax: '<length>';
  inherits: false;
  initial-value: 10px;
}
```

3. **Avoid FOUC/fallback rendering**
   With `initial-value`, the browser does not have to wait until the calculation phase to determine a default value when a variable is not set, thus reducing first draw flickering.

---

## 3. Example scenario

### Animation value

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

👉 The box will rotate smoothly instead of jumping instantly.

---

### Gradient color

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

👉 The button background color will have a gradient transition when hovering.

---

### Responsive size

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

👉 Smooth transition of rounded corners when hovering.

---

## 4. Summary

- `@property` is a **registered CSS custom property**.
- The core reason for performance optimization: **The browser can know the type and initial value in advance, reducing parsing and redrawing overhead**.
- Practical scenarios: **Animation transition, theme variables, responsive design**.

---

Indeed, when most people mention `@property`, they will think of **transition / animation**, because this is the most intuitive and rigid requirement. But in fact, its uses are far more than animation. Here I will compile some **"rigidly needed" cases in non-animation scenarios** for you:

---

## 1. **Prevent FOUC (flash) when variables are undefined**

If ordinary custom attributes are not defined, the style will not take effect or even fall back to `unset`, and the page may flicker.
`@property` A forced default can be provided via `initial-value` to avoid surprises on first render.

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

👉 Even if the JS of the theme system has not been injected with `--page-bg`, the page will use **white** at the beginning and will not flash black/transparent.

---

## 2. **Ensure the legality of variable input**

Ordinary CSS variables are strings, and they will be eaten if you write them casually.
However, after registration, the browser will perform **syntax verification**, and the error value will be ignored and fall back to `initial-value`.

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

👉 If someone sets `--spacing: "abc";` by mistake, the layout will not crash, but will safely fall back to `1rem`.

---

## 3. **Fine control on inheritance/non-inheritance**

Ordinary variables are inherited by default, which often leads to unexpected problems.
For example, when defining a theme color, child elements inherit the wrong value.
Use `@property` to control whether to inherit.

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

👉 Even if the parent element is set to `--border-color: red;`, the child element will not inherit it, ensuring that the border always has stable performance.

---

## 4. **Combined with Container Query**

When you write responsively, you may use variables to drive layouts of different sizes.
If the variable is registered, the browser can recalculate it more efficiently instead of "string re-parsing".

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

👉 Gap will be automatically and stably updated as the container changes, without rendering exceptions caused by undefined or wrong values.

---

## 5. **Ensure the dynamic theme system is more robust**

In "Dark Mode/Multiple Themes", use `@property` to ensure that each variable is defined and no strange UI will be caused by missing values.

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

👉 Even if a theme forgets to define `--theme-accent`, it can fall back to the default blue instead of colorless.

---

## ✅ Summary

In addition to `transition`/`animation`, `@property` is also considered “rigorously needed” in these scenarios:

1. **Provide default values to avoid first screen flickering**
2. **Verify the legality of input and ensure robustness**
3. **Control inheritance to avoid child element style pollution**
4. **Improve rendering efficiency under container query/responsive layout**
5. **Guaranteed fallback value under multi-theme system**
