import assert from 'node:assert/strict'

// 预设把入口归入 Tailwind v4 配置；按公开配置位置读取，不能猜测项目目录。
export function cssEntries(options) {
  const entries = options.cssEntries ?? options.tailwindcss?.v4?.cssEntries ?? options.tailwindcssRuntimeOptions?.tailwindcss?.v4?.cssEntries
  assert.ok(Array.isArray(entries) && entries.length && entries.every(entry => typeof entry === 'string'), '静态基线需要构建配置声明 CSS 入口')
  return entries
}
