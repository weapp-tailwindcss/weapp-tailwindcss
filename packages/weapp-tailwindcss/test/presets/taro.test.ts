import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { taro } from '@/presets/taro'
import { setupEnvSandbox } from './helpers'

describe('taro preset', () => {
  const env = setupEnvSandbox()
  const originalTaroEnv = process.env.TARO_ENV

  afterEach(() => {
    env.restore()
    if (originalTaroEnv === undefined) {
      delete process.env.TARO_ENV
    }
    else {
      process.env.TARO_ENV = originalTaroEnv
    }
    vi.restoreAllMocks()
  })

  it('sets taro defaults and resolves cwd', () => {
    env.clearBaseEnv()
    process.env.PWD = '/Users/foo/taro-webpack-react-tailwindcss-v4'
    process.env.INIT_CWD = '/Users/foo/taro-webpack-react-tailwindcss-v4'
    const result = taro({
      base: '.',
      cssEntries: ['src/app.css'],
    })

    // 相对 base 基于 INIT_CWD resolve，Windows 下会带盘符
    expect(result.tailwindcssBasedir).toBe(path.resolve('/Users/foo/taro-webpack-react-tailwindcss-v4', '.'))
    expect(result.tailwindcss?.v4?.cssEntries).toEqual(['src/app.css'])
    expect(result.tailwindcss?.version).toBe(4)
  })

  it.each(['h5', 'harmony-hybrid'])('enables web compatibility for %s by default', (platform) => {
    env.clearBaseEnv()
    process.env.TARO_ENV = platform
    const result = taro({
      base: '/Users/foo/taro-vite-react-tailwindcss-v4',
    })

    expect(result.generator).toMatchObject({
      target: 'web',
      webCompat: true,
    })
  })

  it.each(['h5', 'harmony-hybrid'])('keeps explicit %s web compatibility overrides', (platform) => {
    env.clearBaseEnv()
    process.env.TARO_ENV = platform
    const result = taro({
      base: '/Users/foo/taro-vite-react-tailwindcss-v4',
      generator: {
        webCompat: false,
      },
    })

    expect(result.generator).toMatchObject({
      target: 'web',
      webCompat: false,
    })
  })

  it('keeps an explicit mini-program target in a Hybrid build', () => {
    env.clearBaseEnv()
    process.env.TARO_ENV = 'harmony-hybrid'
    const result = taro({ generator: { target: 'weapp', webCompat: false } })

    expect(result.generator).toMatchObject({ target: 'weapp', webCompat: false })
  })
})
