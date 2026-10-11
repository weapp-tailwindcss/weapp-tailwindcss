import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { insertProbe } from '../../../scripts/ci/demo-matrix/probe.mjs'
import { authoredCss } from '../../../scripts/ci/demo-matrix/authored.mjs'
import { coverage, isWeb } from '../../../scripts/ci/demo-matrix/catalog.mjs'
import { operations } from './model.mjs'
import { probeClasses } from '../../../scripts/ci/demo-matrix/probe.mjs'
import { replaceSourceFile } from '../../../scripts/ci/demo-matrix/source-file.mjs'
import { cssEntries } from './options.mjs'

export const roundFor = operation => operation === 'replace' ? 'replace' : operation === 'add' ? 'add' : operation === 'remove' || operation === 'restore' ? 'restore' : 'initial'

export async function prepareSteps(consumer, records) {
  const item = consumer.item
  const original = await readFile(path.join(consumer.project, item.source), 'utf8')
  const authored = coverage(item) === 'authored-styles'
  const configuration = records.find(row => row.key === 'options')?.value.options
  const cssFile = authored ? path.join(consumer.project, 'src/sub-normal/index.css') : cssEntries(configuration)[0]
  assert.ok(cssFile, '没有可验证的样式入口')
  const css = await readFile(cssFile, 'utf8').catch(error => { if (authored && error.code === 'ENOENT') return ''; throw error })
  const changes = new Map()
  for (const operation of ['initial', ...operations]) {
    const round = roundFor(operation)
    const probe = await insertProbe(original, item, round)
    // 每轮标识随源码一次写入；等待结果时同时核对本轮标识与样式。
    const className = probeClasses(item, round).height
    const text = probe.replace(`tw-matrix-${round}-height`, `tw-matrix-${round}-height COST_SEQUENCE`)
      .replace(`="${className}"`, `="${className} cost-author${authored ? '' : ' bg-cost-config'}"`)
    const unit = isWeb(item) || item.target === 'app' || item.name.startsWith('web/') ? 'px' : 'rpx'
    // replace 使用预先已有的类；新增样式只属于 add 操作。
    const base = authored ? [...new Set(['initial', 'replace', ...(round === 'add' ? ['add'] : [])].flatMap(state => authoredCss(item, state).split('\n')))].join('\n') : '@source inline("h-12");'
    const style = `${css}\n${base}\n.cost-author{width:${operation === 'css' ? 43 : 41}${unit}}\n${authored ? '' : `@theme { --color-cost-config: ${operation === 'config' ? '#654321' : '#123456'}; }`}\n/* COST_SEQUENCE */\n`
    changes.set(operation, new Map([[item.source, text], [path.relative(consumer.project, cssFile), style]]))
  }
  return changes
}

const savedStyles = new WeakMap()
export const styleSavePolicy = 'changed-input-only-v2'

export async function planStep(consumer, files, marker) {
  let previousStyles = savedStyles.get(consumer)
  if (!previousStyles) {
    previousStyles = new Map()
    savedStyles.set(consumer, previousStyles)
  }
  const writes = []
  for (const [file, content] of files) {
    const target = path.join(consumer.project, file)
    const style = /\.(?:css|scss)$/.test(target)
    // 静态预编译会剥离源码注释，标识必须在预编译之后加到实际保存的样式上。
    const next = content.replaceAll('COST_SEQUENCE', marker)
      + (consumer.mode === 'static' && style ? `\n/*! weapp-demo-cost:${marker} */\n` : '')
    const current = await readFile(target, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error })
    const previous = previousStyles.get(target)
    // 文本操作只更新源码 marker；不能为了观察完成而人为触发一次 CSS 构建。
    if (previous?.content === content && previous.output === current) continue
    if (current !== next) writes.push([target, next, content])
  }
  if (consumer.mode === 'static') writes.sort(([first], [second]) => Number(/\.(?:css|scss)$/.test(second)) - Number(/\.(?:css|scss)$/.test(first)))
  return async ({ afterWrite } = {}) => {
    for (const [target, next, content] of writes) {
      await replaceSourceFile(target, next)
      if (/\.(?:css|scss)$/.test(target)) previousStyles.set(target, { content, output: next })
      await afterWrite?.(target)
    }
  }
}

export async function writeStep(consumer, files, marker) {
  await (await planStep(consumer, files, marker))()
}
