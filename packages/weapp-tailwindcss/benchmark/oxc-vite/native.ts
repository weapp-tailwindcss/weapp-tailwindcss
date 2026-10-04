import type { NativeMethod, NativeReport, Phase } from './types'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { getNativeBindingSuffix } from '../../src/native/resolve'

type Callable = (...args: unknown[]) => unknown
type Binding = Record<string, unknown>
interface LoadedModule { exports: Binding }
type Extension = (module: LoadedModule, filename: string) => void

const bindingMethods: NativeMethod[] = ['tokenizeWxml', 'createWxmlTransformer', 'analyzeJs', 'jsRuntimeSignature', 'createJsTransformer', 'escapeClasses', 'transformSelector', 'transformSelectors', 'normalizeV4Declaration', 'normalizeV4GradientPosition', 'normalizeV4InfinityCalc', 'normalizeV4VariableFallbacks', 'normalizeUvueTransformValue', 'normalizeUvueTransformValues']

export function createNativeCounter(report: NativeReport) {
  let phase: Phase = 'self-check'
  const restores: Array<() => void> = []
  const wrappedObjects = new WeakSet<object>()

  function wrap(object: Binding, method: NativeMethod, label = method) {
    const original = object[method]
    if (typeof original !== 'function') {
      return
    }
    const descriptor = Object.getOwnPropertyDescriptor(object, method)
    const wrapper = function (this: unknown, ...args: unknown[]) {
      const counts = report.counts[phase] ??= {}
      const count = counts[label] ??= { calls: 0, failures: 0, nullReturns: 0, sourceCodeUnits: 0 }
      count.calls++
      const first = args[0]
      // 只取源码字符串的常量时间 length，计数不能再次遍历完整 classSet。
      count.sourceCodeUnits += typeof first === 'string' ? first.length : 0
      try {
        const result = (original as Callable).apply(this, args)
        if (result === null) {
          count.nullReturns++
        }
        if (method === 'createJsTransformer' && result && typeof result === 'object' && !wrappedObjects.has(result)) {
          wrappedObjects.add(result)
          wrap(result as Binding, 'transform')
          wrap(result as Binding, 'transformWithCandidates')
          wrap(result as Binding, 'replaceClassNames')
        }
        if (method === 'createWxmlTransformer' && result && typeof result === 'object' && !wrappedObjects.has(result)) {
          wrappedObjects.add(result)
          wrap(result as Binding, 'transformStatic')
        }
        return result
      }
      catch (error) {
        count.failures++
        throw error
      }
    }
    Object.defineProperty(object, method, { ...descriptor, value: wrapper, configurable: true, writable: true })
    restores.push(() => descriptor ? Object.defineProperty(object, method, descriptor) : Reflect.deleteProperty(object, method))
  }

  return {
    phase(value: Phase) { phase = value },
    binding(object: Binding) {
      for (const method of bindingMethods) {
        wrap(object, method)
      }
      const selector = object['SelectorRuleTransformer']
      if (typeof selector === 'function' && selector.prototype) {
        wrap(selector.prototype, 'transform', 'transformSelectorRule')
      }
    },
    restore() {
      for (const restore of restores.reverse()) {
        restore()
      }
      restores.length = 0
    },
  }
}

export function instrumentNative(root: string) {
  const coreRequire = createRequire(path.join(root, 'packages', 'weapp-tailwindcss', 'package.json'))
  const cssManifest = path.join(root, 'packages', 'postcss', 'package.json')
  assert.equal(realpathSync(coreRequire.resolve('@weapp-tailwindcss/postcss/package.json')), realpathSync(cssManifest), 'core 未消费目标 checkout 的 PostCSS。')
  const cssRequire = createRequire(cssManifest)
  const suffix = getNativeBindingSuffix()
  assert(suffix, 'native 对比要求支持的 OS/CPU/libc。')
  const report: NativeReport = { bindings: [], counts: {} }
  const candidates = [
    { kernel: 'core' as const, require: coreRequire, ids: [`@weapp-tailwindcss/native-${suffix}`, `weapp-tailwindcss/native/bindings/weapp-tailwindcss-native.${suffix}.node`] },
    { kernel: 'postcss' as const, require: cssRequire, ids: [`@weapp-tailwindcss/native-${suffix}/postcss`, path.join(root, 'packages', 'postcss', 'native', 'weapp-tailwindcss-postcss.node')] },
  ]
  for (const { kernel, require, ids } of candidates) {
    for (const id of ids) {
      let resolved: string
      try {
        resolved = realpathSync(require.resolve(id))
      }
      catch (error) {
        if (['MODULE_NOT_FOUND', 'ENOENT'].includes((error as NodeJS.ErrnoException).code ?? '')) {
          continue
        }
        throw error
      }
      if (report.bindings.some(binding => binding.resolved === resolved)) {
        continue
      }
      assert(!require.cache[resolved], '原生 binary 在计时/包装前已加载，不能伪装成冷构建样本。')
      report.bindings.push({ kernel, resolved, sha256: createHash('sha256').update(readFileSync(resolved)).digest('hex'), loaded: false })
    }
    assert(report.bindings.some(binding => binding.kernel === kernel), `缺少 ${kernel} 原生 binary；不能运行 native 对比。`)
  }
  const counter = createNativeCounter(report)
  const loader = coreRequire('node:module') as { _extensions: Record<string, Extension> }
  const original = loader._extensions['.node']!
  const wrapped: Extension = (module, filename) => {
    original(module, filename)
    const binding = report.bindings.find(binding => binding.resolved === realpathSync(filename))
    if (binding) {
      binding.loaded = true
      counter.binding(module.exports)
    }
  }
  loader._extensions['.node'] = wrapped
  return {
    report,
    phase: counter.phase,
    selfCheck() {
      const core = coreRequire(report.bindings.find(binding => binding.kernel === 'core')!.resolved) as Record<string, Callable>
      assert(core.tokenizeWxml!('w-[1px]') instanceof Uint32Array)
      const wxml = core.createWxmlTransformer!([{ character: '[', replacement: '_b' }, { character: ']', replacement: '_B' }]) as Record<string, Callable>
      assert.equal(wxml.transformStatic!('w-[1px]'), 'w-_b1px_B')
      assert(core.analyzeJs!('const x="w-[1px]"', 'js', 'module', false))
      assert.equal(typeof core.jsRuntimeSignature!('const x="w-[1px]"'), 'string')
      const transformer = core.createJsTransformer!(['w-[1px]'], [{ character: '[', replacement: '_b' }, { character: ']', replacement: '_B' }]) as Record<string, Callable>
      assert.equal(transformer.transform!('const x="w-[1px]"', 'js', 'module', false, {}), 'const x="w-_b1px_B"')
      assert.equal(transformer.transformWithCandidates!('const x="w-[2px]"', 'js', 'module', false, {}, (candidate: string) => candidate === 'w-[2px]'), 'const x="w-_b2px_B"')
      const css = cssRequire(report.bindings.find(binding => binding.kernel === 'postcss')!.resolved) as Record<string, Callable>
      assert.equal(typeof css.transformSelector!('.p-4'), 'string')
      const selector = Reflect.construct(css.SelectorRuleTransformer!, [{ child: ['view'], removeHover: false, removeActive: false, removeFocus: false, uniAppX: false }])
      assert.deepEqual(selector.transform('.p-4'), { selector: '.p-4', remove: false, spacing: false })
      assert.equal(css.normalizeV4VariableFallbacks!('var(--tw-x,)'), 'var(--tw-x, )')
      assert.equal(css.normalizeV4Declaration!('1e9px', { radius: true }), '9999px')
      assert.equal(css.normalizeV4GradientPosition!('to right in oklab'), 'to right')
      assert.equal(css.normalizeV4InfinityCalc!('calc(infinity * 1px)', true), '9999px')
      assert.equal(css.normalizeUvueTransformValue!('translate(var(--x,0), var(--y,0))'), 'translate(var(--x,0) var(--y,0))')
      assert.deepEqual(css.normalizeUvueTransformValues!(['translate(1px,2px)', 'translate(1px,2px']), ['translate(1px 2px)', null])
      for (const method of ['tokenizeWxml', 'createWxmlTransformer', 'transformStatic', 'analyzeJs', 'jsRuntimeSignature', 'createJsTransformer', 'transform', 'transformWithCandidates', 'transformSelectorRule', 'normalizeV4Declaration', 'normalizeV4GradientPosition', 'normalizeV4InfinityCalc'] as const) {
        assert.equal(report.counts['self-check']?.[method]?.calls, 1, `原生自检未触发 ${method} 包装。`)
      }
    },
    restore() {
      assert.equal(loader._extensions['.node'], wrapped, '原生加载 hook 被外部替换，不能覆盖未知所有者。')
      loader._extensions['.node'] = original
      counter.restore()
    },
  }
}

export function measuredNativeCalls(report: NativeReport) {
  return Object.entries(report.counts).reduce((sum, [phase, counts]) => sum + (phase === 'self-check' ? 0 : Object.values(counts).reduce((total, count) => total + count.calls, 0)), 0)
}
