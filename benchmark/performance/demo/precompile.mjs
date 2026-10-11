import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import fg from 'fast-glob'
import postcss from 'postcss'
import scss from 'postcss-scss'
import { decode } from './capture.cjs'
import { compileAuthored } from './authored.mjs'
import { preprocessStyle, sfcBlocks } from './sfc.mjs'
import { withCapturedEnvironment } from './prepare-environment.mjs'
import { compileScript } from './precompile-script.mjs'
import { cssEntries } from './options.mjs'
import { compileTemplateExpressions } from './template-expressions.mjs'

export function stripGeneration(css, language = 'css') {
  assert.ok(['css', 'scss'].includes(language), `尚未验证的原生样式语法：${language}`)
  const syntax = language === 'scss' ? scss : postcss
  const root = syntax.parse(css)
  root.walkAtRules(rule => {
    if (['tailwind', 'theme', 'source', 'config', 'plugin', 'utility', 'custom-variant', 'apply', 'reference'].includes(rule.name)
      || (rule.name === 'import' && /["'](?:tailwindcss|weapp-tailwindcss)(?:[\/"'])/.test(rule.params))) rule.remove()
  })
  return root.toString(syntax.stringify)
}

export function stripSourceGeneration(source, file) {
  if (/\.(?:css|scss)$/.test(file)) return stripGeneration(source, path.extname(file).slice(1))
  if (!/\.(?:vue|uvue|mpx)$/.test(file)) return source
  let result = source
  for (const block of sfcBlocks(source, file).filter(block => block.type === 'style').reverse()) {
    const css = stripGeneration(block.content, block.attrs.lang ?? 'css')
    result = result.slice(0, block.offset) + css + result.slice(block.offset + block.length)
  }
  return result
}

export async function sourceFiles(consumer) {
  return fg(['**/*.{vue,uvue,mpx,wxml,ttml,tsx,jsx,ts,js,wxs,css,scss,html}'], {
    cwd: consumer.project, ignore: ['node_modules/**', 'dist/**', '.output/**', '.nuxt/**', '.cost/**', '.weapp-vite/**', '.temp/**', '.cache/**', '.vite/**', 'unpackage/**', 'config/**', '**/*config.*', 'scripts/**', 'gulpfile.{ts,mts,mjs}'],
  })
}

export async function compileStatic(consumer, records, capturedRoot) {
  return withCapturedEnvironment(records, () => compileStaticForPlatform(consumer, records, capturedRoot))
}

async function compileStaticForPlatform(consumer, records, capturedRoot) {
  if (consumer.item.name.startsWith('style-injector-')) return compileAuthored(consumer, records, capturedRoot, await sourceFiles(consumer))
  const require = createRequire(path.join(consumer.project, 'package.json'))
  const { createCompiler } = await import(pathToFileURL(require.resolve('weapp-tailwindcss/core')).href)
  const integrationRequire = createRequire(require.resolve('weapp-tailwindcss/package.json'))
  const { transformWebCssCompat } = integrationRequire('@weapp-tailwindcss/postcss/transform')
  const config = records.filter(row => row.key === 'options' && !row.value.options.disabled)
  assert.ok(config.length, '准备构建没有捕获启用的插件配置')
  const options = decode(config[0].value.options, capturedRoot, consumer.project)
  assert.ok(config.every(row => JSON.stringify(row.value.options) === JSON.stringify(config[0].value.options)), '同一目标有多个不同的插件配置，不能合并静态基线')
  const entries = cssEntries(options)
  const compiler = createCompiler(options)
  const target = options.generator?.target ?? (['h5', 'h5:ssr', 'web', 'app', 'harmony-hybrid'].includes(consumer.item.target) ? 'web' : 'weapp')
  const result = new Map()
  const compatibility = options.generator?.webCompat ?? (target === 'web' && !options.generator?.target ? true : false)
  const finalize = css => target === 'web' && compatibility ? transformWebCssCompat(css, compatibility) : css
  const generateStyle = async (css, file) => {
    const filename = path.join(consumer.project, file)
    return compiler.generate({ id: filename, target, sourceOptions: { projectRoot: consumer.project, cssSources: [{ css, file: filename, base: path.dirname(filename) }] }, scanSources: true, styleOptions: options, webCompat: options.generator?.webCompat })
  }
  try {
    const snapshots = []
    for (const entry of entries) {
      const generated = await compiler.generate({
        id: entry, target,
        sourceOptions: { projectRoot: consumer.project, cssEntries: [entry] },
        scanSources: true,
        webCompat: options.generator?.webCompat ?? (target === 'web' && !options.generator?.target ? true : undefined),
        styleOptions: { ...options, ...options.generator?.styleOptions },
      })
      snapshots.push(generated.snapshot)
      result.set(path.relative(consumer.project, entry), finalize(generated.css))
    }
    const snapshot = compiler.mergeSnapshots(snapshots)
    for (const file of await sourceFiles(consumer)) {
      if (result.has(file)) continue
      const source = await readFile(path.join(consumer.project, file), 'utf8')
      let transformed = source
      if (/\.(?:vue|uvue|mpx)$/.test(file)) {
        // SFC 的模板、脚本分别转换，避免将整个 SFC 当作 JavaScript 解析。
        const replacements = []
        for (const block of sfcBlocks(source, file)) {
          let content = block.content
          if (target === 'weapp' && block.type === 'template') {
            content = await compiler.transformTemplate(content, snapshot)
            if (/\.(?:vue|uvue)$/.test(file)) content = await compileTemplateExpressions(compiler, content, snapshot, file)
          }
          if (target === 'weapp' && block.type === 'script' && block.attrs.type !== 'application/json') content = await compileScript(compiler, content, snapshot, file, block.attrs.lang ?? 'js')
          if (block.type === 'style' && /@(apply|reference|theme)|@import\s+["'](?:tailwindcss|weapp-tailwindcss)(?:[\/"])/.test(content)) {
            const css = await preprocessStyle(block, path.join(consumer.project, file), require)
            content = finalize((await generateStyle(css, file)).css)
          }
          else if (block.type === 'style' && target === 'weapp' && !block.attrs.lang) content = (await compiler.transformCss(content, snapshot)).css
          replacements.push({ offset: block.offset, length: block.length, content })
        }
        for (const replacement of replacements.reverse()) transformed = transformed.slice(0, replacement.offset) + replacement.content + transformed.slice(replacement.offset + replacement.length)
      }
      else if (target === 'weapp' && /\.(?:wxml|ttml|html)$/.test(file)) transformed = await compiler.transformTemplate(source, snapshot)
      else if (target === 'weapp' && /\.(?:tsx|jsx|ts|js|wxs)$/.test(file)) transformed = await compileScript(compiler, source, snapshot, file)
      else if (/\.css$/.test(file) && /@(apply|reference|theme|import\s+["'](?:tailwindcss|weapp-tailwindcss))/.test(source)) {
        const generated = await generateStyle(source, file)
        transformed = finalize(generated.css)
      }
      else if (target === 'weapp' && /\.css$/.test(file)) transformed = (await compiler.transformCss(source, snapshot)).css
      if (transformed !== source) result.set(file, transformed)
    }
    return result
  }
  finally { await compiler.dispose() }
}

export async function applySources(consumer, sources) {
  for (const [file, source] of sources) {
    const target = path.join(consumer.project, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, source)
  }
}
