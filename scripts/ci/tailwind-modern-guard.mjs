import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** 从独立安装的稳定包加载双入口，避免工作区别名掩盖模板补丁失效。 */
export async function verifyTemplateTailwindModernGuard(root) {
  // 同一进程会先后安装发布版和候选版，直接槽位的真实路径不能经过 require.resolve 缓存。
  const coreManifest = await realpath(path.join(root, 'node_modules', 'weapp-tailwindcss', 'package.json'))
  const coreRequire = createRequire(coreManifest)
  const manifestFile = coreRequire.resolve('@weapp-tailwindcss/postcss/package.json')
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  const exports = manifest.exports['.']
  const packageRoot = path.dirname(manifestFile)
  const modules = [
    ['ESM', await import(pathToFileURL(path.resolve(packageRoot, typeof exports.import === 'string' ? exports.import : exports.import.default)).href)],
    ['CJS', coreRequire(path.resolve(packageRoot, typeof exports.require === 'string' ? exports.require : exports.require.default))],
  ]

  for (const [format, module] of modules) {
    const handler = module.createStyleHandler({ majorVersion: 4, isMainChunk: true })
    const guard = value => `((-webkit-hyphens: none) and (not (margin-trim: ${value}))) or ((-moz-orient: inline) and (not (color: rgb(from red r g b))))`
    const input = condition => `@layer properties { @supports ${condition} { *, ::before, ::after { --tw-font-weight: initial; --tw-shadow: 0 0 #0000; } } } .shadow { box-shadow: var(--tw-shadow); font-weight: var(--tw-font-weight); }`
    const process = async condition => (await handler(input(condition))).css
    const label = `${root} ${format}`
    for (const value of ['inline', 'block']) {
      for (const condition of [guard(value), guard(value).replaceAll(': ', ':')]) {
        const css = await process(condition)
        assert.ok(!css.includes('@supports'), `${label}: ${value} 初始化条件未展开`)
        assert.ok(!css.includes('@layer'), `${label}: ${value} 初始化层未展开`)
        assert.match(css, /--tw-font-weight:\s*initial\s*;/, `${label}: ${value} 默认值丢失`)
        assert.match(css, /--tw-shadow:\s*0 0 rgba\(0,\s*0,\s*0,\s*0\)\s*;/, `${label}: ${value} 阴影默认值丢失`)
        assert.match(css, /box-shadow:\s*var\(--tw-shadow\)/, `${label}: ${value} utility 声明丢失`)
      }
    }

    const unrelated = [
      ...['inline-start', 'block-start', 'inlineblock', 'none'].map(guard),
      guard('block').replace('margin-trim:', '--margin-trim:'),
      ...[
        ['-webkit-hyphens: none', 'display: grid'],
        ['margin-trim: block', 'display: grid'],
        ['-moz-orient: inline', 'display: grid'],
        ['color: rgb(from red r g b)', 'color: red'],
      ].map(([probe, replacement]) => guard('block').replace(probe, replacement)),
    ]
    for (const condition of unrelated) {
      assert.ok((await process(condition)).includes('@supports'), `${label}: 无关条件被错误展开：${condition}`)
    }
  }
  return { version: manifest.version }
}
