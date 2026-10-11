import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { parseAsync } from '@babel/core'
import { authoredClasses } from './authored.mjs'
import { coverage, isWeb, repo } from './catalog.mjs'

const vueRequire = createRequire(path.join(repo, 'demo/web/vue-vite7-tailwindcss-v4/package.json'))
const sfcRequire = createRequire(vueRequire.resolve('vue/compiler-sfc'))
const { parse: parseSfc } = vueRequire('vue/compiler-sfc')
const { baseParse } = sfcRequire('@vue/compiler-dom')
export const parseMarkup = baseParse

export function probeClasses(item, round = 'initial') {
  if (coverage(item) === 'authored-styles') {
    return authoredClasses(round)
  }
  const values = arbitraryValues(item)
  return {
    height: round === 'replace' || round === 'add' ? 'h-12' : 'h-8',
    medium: 'h-20',
    large: 'h-50',
    margin: 'mt-2',
    display: 'flex',
    color: 'text-slate-500',
    arbitrary: `h-[${values.small}]`,
    arbitraryLarge: `h-[${values.large}]`,
    opacity: 'bg-emerald-50/80',
    ...(round === 'add' ? { added: `w-[${values.added}]` } : {}),
  }
}

export function arbitraryValues(item) {
  if (isWeb(item) && item.family === 'taro') {
    return { small: '4rem', large: '25rem', added: '9rem' }
  }
  const unit = isWeb(item) || item.target === 'app' ? 'px' : 'rpx'
  return { small: `64${unit}`, large: `400${unit}`, added: `137${unit}` }
}

function snippet(item, round) {
  if (coverage(item) === 'native-build') {
    return '<View testID="tw-matrix-native"><Text>tw-matrix-native-app</Text></View>'
  }
  const jsx = item.source.endsWith('.tsx')
  const tag = jsx ? (item.family === 'taro' ? 'View' : 'div') : (item.name.startsWith('web/') ? 'div' : 'view')
  const attr = jsx ? 'className' : 'class'
  return Object.entries(probeClasses(item, round)).map(([key, value]) =>
    `<${tag} id="tw-matrix-${key}" data-tw-matrix="${round}" ${attr}="${value}">tw-matrix-${round}-${key}</${tag}>`,
  ).join('\n')
}

function findJsxReturn(node) {
  if (!node || typeof node !== 'object') {
    return undefined
  }
  if (node.type === 'ReturnStatement' && ['JSXElement', 'JSXFragment'].includes(node.argument?.type)) {
    return node.argument.openingElement ?? node.argument.openingFragment
  }
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const found = findJsxReturn(child)
      if (found) {
        return found
      }
    }
  }
}

export async function insertProbe(original, item, round) {
  let offset
  if (item.source.endsWith('.tsx')) {
    const ast = await parseAsync(original, { filename: item.source, configFile: false, babelrc: false, parserOpts: { plugins: ['typescript', 'jsx'] } })
    offset = findJsxReturn(ast)?.end
  }
  else if (/\.(?:wxml|ttml)$/.test(item.source)) {
    offset = 0
  }
  else {
    const template = parseSfc(original, { filename: item.source }).descriptor.template
    assert.ok(template, `Missing template: ${item.name}`)
    const root = baseParse(template.content, { onError() {} }).children.find(node => node.type === 1)
    assert.ok(root, `Missing root element: ${item.name}`)
    // 使用解析器给出的属性边界定位开标签，避免属性值中的 > 被当作标签结束。
    const attributeEnd = root.props.at(-1)?.loc.end.offset ?? root.loc.start.offset + root.tag.length + 1
    offset = template.loc.start.offset + template.content.indexOf('>', attributeEnd) + 1
  }
  assert.ok(Number.isInteger(offset) && offset >= 0, `Missing render entry: ${item.name}`)
  const hotStateProbe = item.source.endsWith('.tsx') && isWeb(item) && item.name.includes('webpack')
    ? `if (typeof module !== 'undefined' && module.hot) { (globalThis as any).__WEAPP_TW_MATRIX_HMR_STATUS__ = () => module.hot.status() }\n`
    : ''
  return `${hotStateProbe}${original.slice(0, offset)}\n${snippet(item, round)}\n${original.slice(offset)}`
}
