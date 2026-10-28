import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { repo } from './catalog.mjs'
import { evaluatePublishedDefinitions, frameworkRequire } from './weapp-vite-package.fixture.mjs'

const { assertRolldownRuntimeContract: assertContract, resolveRuntimeHelpers } = evaluatePublishedDefinitions([
  'STATIC_IMPORT_RE',
  'EXPORT_PREFIX_RE',
  'STATEFUL_HMR_RUNTIME_COMPATIBILITY_ERROR_CODE',
  'StatefulHmrRuntimeCompatibilityError',
  'stripModuleSyntax',
  'resolveRuntimeHelpers',
  'assertRolldownRuntimeContract',
], { path$1: path, readFileSync })
const runtime = source => ({ filePath: 'fixture-runtime.js', source })
const classes = 'class DevRuntime {}\nclass Module {}'
const helper = 'const __exportAll = () => {}'

it('uses upstream lifecycle fixes and keeps only the host dynamic import patch', () => {
  const workspace = parse(readFileSync(path.join(repo, 'pnpm-workspace.yaml'), 'utf8'))
  expect(frameworkRequire('weapp-vite/package.json').version).toBe('7.6.0')
  for (const version of ['7.3.0', '7.4.0']) {
    expect(workspace.patchedDependencies?.[`weapp-vite@${version}`]).toBeUndefined()
  }
  expect(workspace.patchedDependencies?.['weapp-vite@7.6.0']).toBe('patches/weapp-vite@7.6.0.patch')
  expect(workspace.packageExtensions?.['weapp-vite@7.6.0']?.dependencies?.['@babel/plugin-transform-dynamic-import']).toBe('8.0.1')
})

it('accepts both external and inline common runtime helpers', () => {
  expect(() => assertContract(runtime(classes), helper)).not.toThrow()
  expect(() => assertContract(runtime(`${classes}\n${helper}`), '')).not.toThrow()
  const filePath = frameworkRequire.resolve('rolldown/experimental/runtime')
  const actual = { filePath, source: readFileSync(filePath, 'utf8') }
  expect(() => assertContract(actual, resolveRuntimeHelpers(actual))).not.toThrow()
})

it('continues rejecting genuinely missing runtime contracts', () => {
  expect(() => assertContract(runtime(classes), '')).toThrow('common runtime helpers')
  expect(() => assertContract(runtime(`class DevRuntime {}\n${helper}`), '')).toThrow('Module')
  expect(() => assertContract(runtime(`class Module {}\n${helper}`), '')).toThrow('DevRuntime')
  try {
    assertContract(runtime(classes), '')
    expect.unreachable('缺失运行时契约必须拒绝')
  }
  catch (error) {
    expect(error.code).toBe('WEAPP_VITE_STATEFUL_HMR_RUNTIME_INCOMPATIBLE')
  }
})
