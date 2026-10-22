import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { runInNewContext } from 'node:vm'
import { parseSync } from '@babel/core'
import { repo } from './catalog.mjs'

const demoRequire = createRequire(path.join(repo, 'demo/taro-vite-react-tailwindcss-v4/package.json'))
export const taroRequire = createRequire(demoRequire.resolve('@tarojs/cli/package.json'))
export function packageFile(name, file) {
  return path.join(path.dirname(taroRequire.resolve(`@tarojs/${name}/package.json`)), file)
}
export function packageSource(name, file) {
  return readFileSync(packageFile(name, file), 'utf8')
}
export function evaluateCommonJs(source, require, extra = {}) {
  const module = { exports: {} }
  runInNewContext(source, { module, exports: module.exports, require, process, ...extra })
  return module.exports
}
export function privateFunctions(name, names, context) {
  const source = packageSource(name, 'dist/index.js')
  const ast = parseSync(source, { babelrc: false, configFile: false })
  const declarations = ast.program.body.filter(node => node.type === 'FunctionDeclaration' && names.includes(node.id.name))
  if (declarations.length !== names.length) {
    throw new Error(`发行包私有入口变化：${name}/${names.join(',')}`)
  }
  return runInNewContext(`${declarations.map(node => source.slice(node.start, node.end)).join('\n')}\nsetTaroApi`, context)
}
