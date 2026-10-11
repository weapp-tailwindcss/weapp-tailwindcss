import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { repo } from '../../../scripts/ci/demo-matrix/catalog.mjs'

const require = createRequire(path.join(repo, 'demo/web/vue-vite7-tailwindcss-v4/package.json'))
const { parse } = require('vue/compiler-sfc')

export function sfcBlocks(source, filename) {
  const { descriptor } = parse(source, { filename })
  return [descriptor.template, descriptor.script, descriptor.scriptSetup, ...descriptor.styles].filter(Boolean).map(block => ({ type: block.type, attrs: block.attrs, offset: block.loc.start.offset, length: block.content.length, content: block.content })).sort((a, b) => a.offset - b.offset)
}

export async function preprocessStyle(block, filename, consumerRequire) {
  const language = block.attrs.lang
  if (!language || language === 'css') return block.content
  assert.ok(['scss', 'sass', 'less'].includes(language), `尚未验证的样式预处理器：${language}`)
  if (language === 'less') return (await consumerRequire('less').render(block.content, { filename })).css
  // 使用消费项目声明的预处理器，CSS 生成仍由同一发布版 weapp-tailwindcss 完成。
  return (await consumerRequire('sass').compileStringAsync(block.content, { url: pathToFileURL(filename), syntax: language === 'sass' ? 'indented' : 'scss', style: 'expanded' })).css
}
