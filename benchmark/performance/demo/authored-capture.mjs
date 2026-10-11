import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { hash, inside } from './published.mjs'
import { prepareSteps } from './steps.mjs'
import { preprocessInjectedCss } from './authored-vite.mjs'

export async function captureAuthoredPreprocessing(consumer, options, config) {
  const require = createRequire(path.join(consumer.project, 'package.json'))
  const injector = require('weapp-style-injector')
  const scopes = injector.resolveUniAppStyleScopes({ ...options, pagesJsonPath: path.join(consumer.project, 'src', 'pages.json') })
  const steps = await prepareSteps(consumer, [{ key: 'options', value: { options } }])
  const result = []
  const seen = new Set()
  for (const scope of scopes) {
    const file = scope.sourceAbsolutePath
    assert.ok(inside(consumer.project, file), '注入来源越界')
    const original = await readFile(file, 'utf8')
    const relative = path.relative(consumer.project, file)
    const inputs = new Set([original, ...[...steps.values()].map(files => files.get(relative) ?? original)])
    for (const input of inputs) {
      const inputHash = hash(input)
      const key = JSON.stringify([file, inputHash])
      if (seen.has(key)) continue
      seen.add(key)
      const output = scope.preprocess === false ? input : await preprocessInjectedCss(input, file, require, config, true)
      result.push({ file, inputHash, output })
    }
  }
  return result
}
