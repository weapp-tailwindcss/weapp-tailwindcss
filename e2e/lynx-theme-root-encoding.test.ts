import { expect, it } from 'vitest'
import { transformLynxCssCompat } from '../packages/postcss/src/compat/lynx-css'
import { encodeLynxCss } from './lynx/batch-encode'

it('真实 encoder 必须保留 Tailwind 组合根作用域中的动态主题定义', async () => {
  const input = ':root, :host{--color-brand:#f00}.theme-dark{--color-brand:#00f}.bg-brand{background-color:var(--color-brand)}'
  const original = await encodeLynxCss(input, { mode: 'wasm', applyCompatibility: false })
  expect(original.css).not.toContain('--color-brand: #f00')
  const output = await encodeLynxCss(transformLynxCssCompat(input), { mode: 'wasm', applyCompatibility: false })
  expect(output.css).toContain(':root { --color-brand: #f00; }')
  expect(output.css).toContain('background-color: {{--color-brand}}')
  expect(output.css).toContain('.theme-dark { --color-brand: #00f; }')
})
