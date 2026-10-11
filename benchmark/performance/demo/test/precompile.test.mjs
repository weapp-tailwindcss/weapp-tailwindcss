import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { compileString } from 'sass'
import { stripGeneration, stripSourceGeneration } from '../precompile.mjs'

it('真实 uni.scss 的变量与行注释逐字保留', async () => {
  const source = await readFile(new URL('../../../../demo/uni-app-vite-tailwindcss-v4/src/uni.scss', import.meta.url), 'utf8')
  expect(stripSourceGeneration(source, 'uni.scss')).toBe(source)
})

it('SCSS 移除生成指令后仍由 Sass 编译，保留作者变量、嵌套和插值语义', () => {
  const authored = '$color: red; // 作者颜色\n$name: panel;\n.#{$name} { color: $color; &:hover { color: blue; } }'
  const source = `@import "weapp-tailwindcss";\n${authored}\n.panel { @apply p-4; }`
  const stripped = stripGeneration(source, 'scss')
  expect(stripped).toContain('// 作者颜色')
  expect(stripped).not.toContain('@apply')
  expect(stripped).not.toContain('weapp-tailwindcss')
  expect(compileString(stripped).css).toBe(compileString(authored).css)
})

it('按 SFC 每个样式块的 lang 处理，保留模板、脚本和样式属性', () => {
  const source = '<template><view>@apply text</view></template>\n<script setup>const text = "@apply"</script>\n<style scoped lang="scss">@import "tailwindcss";$c:red;//注释\n.a{color:$c;@apply p-4;}</style>\n<style>.b{@apply p-4;color:blue}</style>'
  const expected = source.replace('@import "tailwindcss";', '').replaceAll('@apply p-4;', '')
  expect(stripSourceGeneration(source, 'App.vue')).toBe(expected)
})
