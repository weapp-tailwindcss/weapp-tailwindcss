import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)

it('Babel preset 精确绑定当前 Expo SDK，不能读取其它 demo 提升的旧版 preset', () => {
  const configure = require('../babel.config.js') as (api: { cache: (value: boolean) => void }) => { presets: string[] }
  const expo = createRequire(require.resolve('expo/package.json'))
  expect(configure({ cache: () => {} }).presets).toEqual([expo.resolve('babel-preset-expo')])
  expect(expo('babel-preset-expo/package.json').version).toMatch(/^54\./)
})
