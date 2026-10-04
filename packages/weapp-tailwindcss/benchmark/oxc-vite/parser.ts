import type { ParseCount, Phase, TransferMode } from './types'
import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

interface OxcModule {
  parseSync: (filename: string, code: string, options?: Record<string, unknown>) => { program: unknown, errors: unknown[] }
  rawTransferSupported?: () => boolean
}

export function instrumentParser(root: string, mode: TransferMode | 'default') {
  const coreManifest = path.join(root, 'packages', 'weapp-tailwindcss', 'package.json')
  const coreRequire = createRequire(coreManifest)
  const demoRequire = createRequire(path.join(root, 'demo', 'web', 'vue-vite-tailwindcss-v4', 'package.json'))
  assert.equal(realpathSync(demoRequire.resolve('weapp-tailwindcss/package.json')), realpathSync(coreManifest), 'demo 未消费目标仓库的 core 包。')
  const resolved = coreRequire.resolve('oxc-parser')
  const original = coreRequire(resolved) as OxcModule
  const cached = coreRequire.cache[resolved]
  assert(cached, 'core require 未缓存 oxc-parser，无法建立同实例包装。')
  const supported = original.rawTransferSupported?.() === true
  assert(mode !== 'raw' || supported, '当前 Oxc/Node 不支持 raw transfer，不能伪装成 raw 样本。')
  let phase: Phase = 'self-check'
  const counts: Partial<Record<Phase, ParseCount>> = {}
  const wrapped = {
    ...original,
    parseSync(filename: string, source: string, options?: Record<string, unknown>) {
      const count = counts[phase] ??= { calls: 0, failures: 0, sourceCodeUnits: 0, filenames: [] }
      count.calls++
      count.sourceCodeUnits += source.length
      if (count.filenames.length < 12 && !count.filenames.includes(filename)) {
        count.filenames.push(filename)
      }
      try {
        return original.parseSync(filename, source, mode === 'default' ? options : { ...options, experimentalLazy: false, experimentalRawTransfer: mode === 'raw' })
      }
      catch (error) {
        count.failures++
        throw error
      }
    },
  }
  cached.exports = wrapped
  assert.equal(coreRequire('oxc-parser').parseSync, wrapped.parseSync, 'core require 未使用被测包装。')
  return {
    report: { resolved, rawTransferSupported: supported, counts },
    phase(value: Phase) { phase = value },
    selfCheck() {
      const parsed = coreRequire('oxc-parser').parseSync('oxc-benchmark-self-check.js', 'const value = "中文😀 w-[10px]"', { sourceType: 'module' })
      assert.equal(parsed.errors.length, 0)
      assert(parsed.program && counts['self-check']?.calls === 1, 'Oxc 自检未触发真实包装调用。')
    },
    restore() { cached.exports = original },
  }
}
