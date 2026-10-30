import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileFunction, constants } from 'node:vm'
import { parseSync } from '@babel/core'
import { repo } from './catalog.mjs'

const demoRequire = createRequire(path.join(repo, 'demo', 'weapp-vite-tailwindcss-v4', 'package.json'))
export const frameworkRequire = createRequire(demoRequire.resolve('weapp-vite/package.json'))
const dist = path.join(path.dirname(frameworkRequire.resolve('weapp-vite/package.json')), 'dist')
const sources = readdirSync(dist).filter(name => name.endsWith('.mjs')).sort().map(name => ({
  filename: path.join(dist, name),
  source: readFileSync(path.join(dist, name), 'utf8'),
}))
const definitions = new Map()
const parsed = new Map()

function program(file) {
  if (!parsed.has(file.filename)) {
    parsed.set(file.filename, parseSync(file.source, { babelrc: false, configFile: false, sourceType: 'module' }).program)
  }
  return parsed.get(file.filename)
}

/** 按实际声明定位发布实现，文件拆分或内容哈希变化不能使回归悄悄跳过。 */
function definition(name) {
  assert.match(name, /^[A-Z_$][\w$]*$/i)
  if (!definitions.has(name)) {
    const signature = new RegExp(`(?:function\\s+|(?:var|let|const)\\s+)${name.replaceAll('$', '\\$')}\\b`)
    const matches = []
    for (const file of sources.filter(item => signature.test(item.source))) {
      for (const statement of program(file).body) {
        const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
        if (['FunctionDeclaration', 'ClassDeclaration'].includes(node?.type) && node.id?.name === name) {
          matches.push({ ...file, node, code: file.source.slice(node.start, node.end) })
        }
        if (node?.type === 'VariableDeclaration') {
          for (const declaration of node.declarations.filter(item => item.id.type === 'Identifier' && item.id.name === name)) {
            matches.push({ ...file, node: declaration, code: `${node.kind} ${file.source.slice(declaration.start, declaration.end)};` })
          }
        }
      }
    }
    assert.equal(matches.length, 1, `发行包声明必须唯一：${name}`)
    definitions.set(name, matches[0])
  }
  return definitions.get(name)
}

/** 执行发布声明，动态依赖继续从真实发布文件解析。 */
export function evaluatePublishedDefinitions(names, bindings = {}) {
  const selected = names.map(definition)
  const body = selected.map(item => item.code).concat(`return { ${names.join(', ')} };`).join('\n')
  return compileFunction(body, Object.keys(bindings), {
    filename: selected[0].filename,
    importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  })(...Object.values(bindings))
}

/** 仅替换类的外部资源，在对象上执行发布包原有的方法体。 */
export function publishedClassMethods(name, names, bindings = {}) {
  const selected = definition(name)
  const body = selected.node.type === 'VariableDeclarator' ? selected.node.init.body : selected.node.body
  const methods = names.map((method) => {
    const matches = body.body.filter(item => item.type === 'ClassMethod' && item.key.name === method)
    assert.equal(matches.length, 1, `发行包类方法必须唯一：${name}.${method}`)
    return selected.source.slice(matches[0].start, matches[0].end)
  })
  return compileFunction(`return ({\n${methods.join(',\n')}\n});`, Object.keys(bindings), {
    filename: selected.filename,
  })(...Object.values(bindings))
}

export async function frameworkImport(id) {
  // 以消费方为父模块使用 import 条件，保留仅 ESM 子路径的 exports 边界。
  return compileFunction('return import(id)', ['id'], {
    filename: frameworkRequire.resolve('weapp-vite/package.json'),
    importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  })(id)
}

/** 通过实际导出映射加载生命周期，避免依赖私有文件名与压缩后的别名。 */
export async function publishedExport(name) {
  const selected = definition(name)
  const exports = program(selected).body.flatMap(node => node.type === 'ExportNamedDeclaration'
    ? node.specifiers.filter(item => item.local.name === name).map(item => item.exported.name ?? item.exported.value)
    : [])
  assert.equal(exports.length, 1, `发行包导出必须唯一：${name}`)
  return (await import(pathToFileURL(selected.filename).href))[exports[0]]
}
