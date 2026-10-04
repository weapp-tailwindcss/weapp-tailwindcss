import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { parseSync } from '@babel/core'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { repo } from './catalog.mjs'

const demoRequire = createRequire(path.join(repo, 'demo/weapp-vite-tailwindcss-v4/package.json'))
const frameworkRequire = createRequire(demoRequire.resolve('weapp-vite/package.json'))
const dist = path.join(path.dirname(frameworkRequire.resolve('weapp-vite/package.json')), 'dist')
const bundle = readdirSync(dist).find(name => /^createContext-.*\.mjs$/.test(name))
const source = readFileSync(path.join(dist, bundle), 'utf8')
// 用 AST 定位发行包里的真实私有校验函数，不为测试改变第三方导出接口。
const ast = parseSync(source, { babelrc: false, configFile: false, sourceType: 'module' })
const declaration = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'assertRolldownRuntimeContract')
const assertContract = runInNewContext(`${source.slice(declaration.start, declaration.end)}\nassertRolldownRuntimeContract`, { StatefulHmrRuntimeCompatibilityError: Error })
const runtime = source => ({ filePath: 'fixture-runtime.js', source })
const classes = 'class DevRuntime {}\nclass Module {}'
const helper = 'const __exportAll = () => {}'

it('registers the compatibility patch for the installed framework version', () => {
  const workspace = parse(readFileSync(path.join(repo, 'pnpm-workspace.yaml'), 'utf8'))
  const version = frameworkRequire('weapp-vite/package.json').version
  expect(workspace.patchedDependencies[`weapp-vite@${version}`]).toBe(`patches/weapp-vite@${version}.patch`)
  expect(workspace.patchedDependencies['weapp-vite@7.3.0']).toBeUndefined()
})

it('accepts both external and inline common runtime helpers', () => {
  expect(() => assertContract(runtime(classes), helper)).not.toThrow()
  expect(() => assertContract(runtime(`${classes}\n${helper}`), '')).not.toThrow()
  const actual = readFileSync(frameworkRequire.resolve('rolldown/experimental/runtime'), 'utf8')
  expect(() => assertContract(runtime(actual), '')).not.toThrow()
})

it('continues rejecting genuinely missing runtime contracts', () => {
  expect(() => assertContract(runtime(classes), '')).toThrow('common runtime helpers')
  expect(() => assertContract(runtime(`class DevRuntime {}\n${helper}`), '')).toThrow('Module')
  expect(() => assertContract(runtime(`class Module {}\n${helper}`), '')).toThrow('DevRuntime')
})
