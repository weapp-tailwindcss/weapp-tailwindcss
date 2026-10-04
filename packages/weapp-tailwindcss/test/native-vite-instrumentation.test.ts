import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { instrumentNative, measuredNativeCalls } from '../benchmark/oxc-vite/native'
import { getNativeBindingSuffix } from '../src/native/resolve'

describe('native Vite instrumentation lifecycle', () => {
  it('resolves and hashes without preloading, exercises self-check, and restores the native loader', () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'weapp-vite-native-hook-')))
    const require = createRequire(import.meta.url)
    type Extension = (module: { exports: unknown }, filename: string) => void
    const module = require('node:module') as { _extensions: Record<string, Extension> }
    const original = module._extensions['.node']!
    const suffix = getNativeBindingSuffix()!
    const core = path.join(root, 'packages', 'weapp-tailwindcss')
    const css = path.join(root, 'packages', 'postcss')
    const platform = path.join(root, 'node_modules', '@weapp-tailwindcss', `native-${suffix}`)
    const coreFile = path.join(platform, 'core.node')
    const cssFile = path.join(platform, 'css.node')
    let instrumentation: ReturnType<typeof instrumentNative> | undefined
    let loads = 0
    try {
      mkdirSync(path.dirname(coreFile), { recursive: true })
      mkdirSync(path.dirname(cssFile), { recursive: true })
      mkdirSync(css, { recursive: true })
      mkdirSync(path.join(core, 'node_modules', '@weapp-tailwindcss'), { recursive: true })
      symlinkSync(css, path.join(core, 'node_modules', '@weapp-tailwindcss', 'postcss'), 'junction')
      writeFileSync(path.join(core, 'package.json'), JSON.stringify({ name: 'weapp-tailwindcss', exports: { './package.json': './package.json', './native/bindings/*': './native/bindings/*' } }))
      writeFileSync(path.join(css, 'package.json'), JSON.stringify({ name: '@weapp-tailwindcss/postcss', exports: { './package.json': './package.json' } }))
      writeFileSync(path.join(platform, 'package.json'), JSON.stringify({ name: `@weapp-tailwindcss/native-${suffix}`, exports: { '.': './core.node', './postcss': './css.node' } }))
      writeFileSync(coreFile, 'core fixture')
      writeFileSync(cssFile, 'css fixture')
      const fixtureLoader: Extension = (loaded, filename) => {
        if (filename !== coreFile && filename !== cssFile) {
          original(loaded, filename)
          return
        }
        loads++
        loaded.exports = filename === coreFile
          ? {
              tokenizeWxml: () => Uint32Array.from([0, 7, 0]),
              analyzeJs: () => ({ literals: [] }),
              jsRuntimeSignature: () => 's:w-[1px]',
              createJsTransformer: () => ({ transform: (source: string) => source.replace('w-[1px]', 'w-_b1px_B') }),
            }
          : {
              transformSelector: (selector: string) => selector,
              normalizeV4VariableFallbacks: () => 'var(--tw-x, )',
              normalizeUvueTransformValue: () => 'translate(var(--x,0) var(--y,0))',
              normalizeUvueTransformValues: () => ['translate(1px 2px)', null],
            }
      }
      module._extensions['.node'] = fixtureLoader
      instrumentation = instrumentNative(root)
      expect(loads).toBe(0)
      expect(instrumentation.report.bindings.map(binding => binding.resolved)).toEqual([coreFile, cssFile])
      expect(instrumentation.report.bindings.every(binding => !binding.loaded && /^[a-f0-9]{64}$/.test(binding.sha256))).toBe(true)
      instrumentation.selfCheck()
      expect(loads).toBe(2)
      expect(measuredNativeCalls(instrumentation.report)).toBe(0)
      instrumentation.phase('build')
      const binding = require(coreFile)
      binding.tokenizeWxml('w-[1px]')
      expect(measuredNativeCalls(instrumentation.report)).toBe(1)
      instrumentation.restore()
      expect(module._extensions['.node']).toBe(fixtureLoader)
      binding.tokenizeWxml('w-[1px]')
      expect(measuredNativeCalls(instrumentation.report)).toBe(1)
      instrumentation = undefined
    }
    finally {
      instrumentation?.restore()
      module._extensions['.node'] = original
      delete require.cache[coreFile]
      delete require.cache[cssFile]
      rmSync(root, { recursive: true, force: true })
    }
  })
})
