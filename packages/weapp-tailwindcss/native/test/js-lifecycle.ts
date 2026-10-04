import type { IJsHandlerOptions } from '../../src/types'
import assert from 'node:assert/strict'
import { createJsHandler } from '../../src/js'
import { jsHandler } from '../../src/js/babel'
import { defaultJsPreserveClass } from '../../src/js/default-preserve'
import { loadNativeCompiler } from '../../src/native'

/** 用真实二进制检查公开 handler 的实例、集合和字典生命周期。 */
export function verifyJsLifecycle() {
  const compiler = loadNativeCompiler()!
  const create = compiler.createJsTransformer
  let transforms = 0
  compiler.createJsTransformer = (...args) => {
    const instance = create(...args)
    if (instance) {
      const transform = instance.transformWithCandidates.bind(instance)
      instance.transformWithCandidates = (...input) => {
        transforms++
        return transform(...input)
      }
    }
    return instance
  }
  try {
    const source = 'const cls = "w-[100px] h-[200px]"'
    const classes = new Set(['w-[100px]'])
    const map: Record<string, string> = { '[': '_left' }
    const options: IJsHandlerOptions = { experimentalJsFastPath: 'oxc', escapeMap: map }
    const handler = createJsHandler(options)
    function verify() {
      const expected = jsHandler(source, { ...options, classNameSet: new Set(classes), escapeMap: { ...map } })
      assert.equal(handler(source, classes).code, expected.code)
    }
    verify()
    classes.delete('w-[100px]')
    classes.add('h-[200px]')
    verify()
    map['['] = '_changed'
    verify()
    delete map['[']
    verify()
    assert.equal(transforms, 4, 'Public handler must execute native for every mutable-state validation')
    const starSource = 'const classes = "* w-[100px]"'
    const starClasses = new Set(['*', 'w-[100px]'])
    for (const jsPreserveClass of [defaultJsPreserveClass, undefined, defaultJsPreserveClass]) {
      const current = { experimentalJsFastPath: 'oxc' as const, jsPreserveClass }
      const actual = createJsHandler(current)(starSource, starClasses)
      assert.equal(actual.code, jsHandler(starSource, { ...current, classNameSet: starClasses }).code)
    }
    assert.equal(transforms, 7, 'The default preservation policy must execute in native code')
    return transforms
  }
  finally {
    compiler.createJsTransformer = create
  }
}
