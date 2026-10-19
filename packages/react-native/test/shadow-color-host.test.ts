import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileNativeStylesheet } from '../src/compiler'

const appRequire = createRequire(path.resolve(import.meta.dirname, '../../../examples/react-native-expo/package.json'))

describe('阴影颜色使用真实宿主解析器验证', () => {
  it.each(['react-native', 'react-native-web'])('%s 接受编码后的透明颜色，不依赖现代 rgb slash 支持', (host) => {
    const hostRequire = createRequire(appRequire.resolve(host))
    const normalizer = hostRequire('@react-native/normalize-colors') as ((color: unknown) => unknown) | { default: (color: unknown) => unknown }
    const normalizeColor = typeof normalizer === 'function' ? normalizer : normalizer.default
    const manifest = compileNativeStylesheet('.shadow { box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1); }')
    const layers = manifest.rules.shadow?.[0]?.style.boxShadow as Record<string, unknown>[]
    expect(layers[0]?.color).toBe('rgba(0, 0, 0, 0.1)')
    expect(normalizeColor(layers[0]?.color)).toBe(26)
  })
})
