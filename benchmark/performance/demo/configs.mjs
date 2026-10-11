import assert from 'node:assert/strict'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAsync } from '@babel/core'
import fg from 'fast-glob'
import { inside } from './published.mjs'

const specifierRE = /^(?:weapp-tailwindcss\/(?:vite|webpack|rspack|gulp|framework|presets)|weapp-style-injector\/(?:vite|webpack)\/[^/]+)$/
export function relativeSpecifier(from, file, paths = path) {
  const relative = paths.relative(paths.dirname(from), file)
  assert.ok(!paths.isAbsolute(relative), '捕获模块与配置文件必须处于同一文件系统根目录')
  const logical = relative.split(paths.sep).join('/')
  return logical.startsWith('../') ? logical : `./${logical}`
}
function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(item => walk(item, visit)); else if (value && typeof value === 'object') walk(value, visit)
}

export async function rewriteConfiguration(source, filename, replace, { weappVite = false, capture = false } = {}) {
  const ast = await parseAsync(source, { filename, configFile: false, babelrc: false, parserOpts: { plugins: ['typescript', 'jsx'], sourceType: 'unambiguous' } })
  const edits = []
  walk(ast.program, (node) => {
    const argument = node.type === 'ImportDeclaration' ? node.source
      : node.type === 'CallExpression' && node.callee.name === 'require' ? node.arguments[0] : undefined
    if (argument?.type === 'StringLiteral' && specifierRE.test(argument.value)) edits.push({ start: argument.start, end: argument.end, text: JSON.stringify(replace(argument.value, node.type === 'ImportDeclaration' ? 'esm' : 'cjs')) })
    if (weappVite && node.type === 'ObjectProperty' && node.key.name === 'tailwindcss' && node.value.type === 'ObjectExpression') {
      edits.push({ start: node.value.start, end: node.value.end, text: capture ? `__costCapture(${source.slice(node.value.start, node.value.end)})` : 'false' })
    }
  })
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = `${source.slice(0, edit.start)}${edit.text}${source.slice(edit.end)}`
  if (weappVite && capture) source = `import { captureOptions as __costCapture } from './.cost/options.mjs'\n${source}`
  return source
}

export async function configure(consumer, mode, records = [], capturedRoot = consumer.project) {
  const support = path.join(consumer.project, '.cost')
  await mkdir(support, { recursive: true })
  await cp(fileURLToPath(new URL('./capture.cjs', import.meta.url)), path.join(support, 'capture.cjs'))
  if (mode === 'capture' && consumer.item.family === 'weapp-vite') {
    // runner 与 bundle 两种 ESM 配置加载器均不应内联 CJS 捕获实现。
    await writeFile(path.join(support, 'options.mjs'), `import { createRequire } from 'node:module'; const load = createRequire(${JSON.stringify(path.join(consumer.project, 'package.json'))});\nexport const { captureOptions } = load(${JSON.stringify(path.join(support, 'capture.cjs'))});\n`)
  }
  const files = await fg(['**/*config*.{ts,js,mjs,cjs}', '**/config/**/*.{ts,js,mjs,cjs}', '**/gulpfile.{ts,mts,mjs}', 'demo/web/shared/*.{ts,mjs}'], { cwd: consumer.root, absolute: true, ignore: ['**/node_modules/**', '**/dist/**', '**/.cost/**'] })
  const wrappers = new Map()
  const originalFiles = new Map()
  for (const file of files) {
    assert.ok(inside(consumer.root, file))
    const source = await readFile(file, 'utf8')
    originalFiles.set(file, source)
    const transformed = await rewriteConfiguration(source, file, (specifier, format) => {
      const key = `${format}:${specifier}`
      let wrapper = wrappers.get(key)?.file
      if (!wrapper) { wrapper = path.join(support, `module-${wrappers.size}.${format === 'esm' ? 'mjs' : 'cjs'}`); wrappers.set(key, { specifier, format, file: wrapper }) }
      // 配置 module specifier 是逻辑路径；必须先完成文件系统相对路径计算。
      return relativeSpecifier(file, wrapper)
    }, { weappVite: consumer.item.family === 'weapp-vite' && path.basename(file) === 'vite.config.ts', capture: mode === 'capture' })
    await writeFile(file, transformed)
  }
  for (const { specifier, format, file } of wrappers.values()) {
    let names
    if (specifier.endsWith('/framework')) names = ['resolveTaroPlatform', 'resolveUniPlatform', 'resolveMpxPlatform']
    else if (specifier.endsWith('/presets')) names = ['uniAppX', 'hbuilderx']
    else if (specifier.endsWith('/rspack')) names = ['patchRspackConfig']
    else if (specifier.endsWith('/gulp')) names = ['createPlugins']
    else names = [specifier.startsWith('weapp-style-injector') ? 'StyleInjector' : 'WeappTailwindcss']
    // ESM 配置会被 Vite 打包；通过真实 createRequire 加载 CJS 支持模块，避免生成无法执行的动态 require。
    const loader = format === 'esm' ? `import { createRequire } from 'node:module'; const load = createRequire(${JSON.stringify(path.join(consumer.project, 'package.json'))});\n` : 'const load = require;\n'
    const prefix = mode === 'capture' ? `const original = load(${JSON.stringify(specifier)}); const {capture} = load(${JSON.stringify(path.join(support, 'capture.cjs'))});\n`
      : `const {disabled} = load(${JSON.stringify(path.join(support, 'capture.cjs'))}); const records = ${JSON.stringify(records)}; const from = ${JSON.stringify(capturedRoot)}; const root = ${JSON.stringify(consumer.project)};\n`
    const declaration = name => format === 'esm' ? `export const ${name}` : `exports.${name}`
    const context = JSON.stringify({ consumer: { project: consumer.project, item: consumer.item }, authoredPreprocessor: new URL('./authored-capture.mjs', import.meta.url).href })
    await writeFile(file, loader + prefix + names.map(name => mode === 'capture' ? `${declaration(name)} = capture(${JSON.stringify(specifier)}, ${JSON.stringify(name)}, original.${name}, ${context});`
      : `${declaration(name)} = ${name.startsWith('resolve') || ['hbuilderx', 'uniAppX'].includes(name) ? `(...args) => disabled(${JSON.stringify(name)}, records, from, root, ${JSON.stringify(specifier)})(...args)` : `disabled(${JSON.stringify(name)}, records, from, root, ${JSON.stringify(specifier)})`};`).join('\n'))
  }
  return async () => { for (const [file, source] of originalFiles) await writeFile(file, source) }
}
