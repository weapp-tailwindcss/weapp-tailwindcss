import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
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

it('uses the upstream lifecycle and host dynamic import fixes', () => {
  const workspace = parse(readFileSync(path.join(repo, 'pnpm-workspace.yaml'), 'utf8'))
  const frameworkPackage = frameworkRequire('weapp-vite/package.json')
  expect(frameworkPackage.version).toBe('7.8.0')
  expect(frameworkPackage.dependencies?.['@babel/plugin-transform-dynamic-import']).toBe('^8.0.1')
  for (const version of ['7.3.0', '7.4.0']) {
    expect(workspace.patchedDependencies?.[`weapp-vite@${version}`]).toBeUndefined()
  }
  expect(workspace.patchedDependencies?.['weapp-vite@7.6.0']).toBeUndefined()
  expect(workspace.patchedDependencies?.['weapp-vite@7.7.0']).toBeUndefined()
  expect(workspace.packageExtensions?.['weapp-vite@7.8.0']?.dependencies?.['@devframes/agentic']).toBe('1.3.0')
  expect(workspace.patchedDependencies?.['weapp-vite@7.8.0']).toBeUndefined()
  const devframe = frameworkRequire('devframe/package.json')
  const devframeRequire = createRequire(frameworkRequire.resolve('devframe/package.json'))
  const agentic = devframeRequire('@devframes/agentic/package.json')
  expect(agentic.version).toBe(devframe.peerDependencies['@devframes/agentic'])
  expect(devframe.version).toBe(agentic.peerDependencies.devframe)
  expect(frameworkRequire('@devframes/agentic/package.json').version).toBe(agentic.version)
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
