import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

export function validateChangelogs(changes, base, head, updates) {
  const expected = new Map([...updates.values()].map(update => [path.posix.join(update.dir, 'CHANGELOG.md'), update]))
  const actual = changes.filter(change => path.posix.basename(change.file) === 'CHANGELOG.md')
  if (actual.length !== expected.size) {
    throw new Error('版本提升必须有对应的 changelog')
  }
  for (const { file, status } of actual) {
    const update = expected.get(file)
    const previous = base.read(file)
    const next = head.read(file)
    if (!update || !['A', 'M'].includes(status) || next === null) {
      throw new Error(`changelog 不属于当前版本提升：${file}`)
    }
    // 已有 changelog 可能以目录名为标题；保留原始标题和旧正文，不推断包名。
    const heading = previous === null ? `# ${update.data.name}\n\n` : /^# [^\r\n]+\r?\n\r?\n/.exec(previous)?.[0]
    if (!heading || !next.startsWith(heading)) {
      throw new Error(`changelog 标题无效：${file}`)
    }
    const oldBody = previous?.slice(heading.length) || ''
    if (!next.endsWith(oldBody)) {
      throw new Error(`changelog 修改了已有记录：${file}`)
    }
    const added = next.slice(heading.length, next.length - oldBody.length)
    if (!(added.startsWith(`## ${update.newVersion}\n`) || added.startsWith(`## ${update.newVersion}\r\n`)) || (added.match(/^## /gm) || []).length !== 1) {
      throw new Error(`changelog 未新增唯一的当前版本段：${file}`)
    }
  }
}

export function readConsumedIntents(changes, base, head, updates, { yaml, semver }) {
  const intents = new Map()
  for (const { file, status } of changes.filter(change => /^\.changeset\/[^/]+\.md$/.test(change.file))) {
    if (status !== 'D' || head.read(file) !== null || file === '.changeset/README.md') {
      throw new Error('仅允许删除已消费的 change intent')
    }
    const source = base.read(file)
    const frontmatter = /^---\r?\n([\s\S]+?)\r?\n---(?:\r?\n|$)/.exec(source || '')
    const data = frontmatter ? yaml.parse(frontmatter[1]) : null
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length === 0) {
      throw new Error(`change intent 无效：${file}`)
    }
    for (const [name, kind] of Object.entries(data)) {
      const update = updates.get(name)
      const minimum = update && ['patch', 'minor', 'major'].includes(kind) ? semver.inc(update.oldVersion, kind) : null
      if (!update || !minimum || !semver.gte(update.newVersion, minimum)) {
        throw new Error(`change intent 没有对应版本提升：${file}`)
      }
    }
    intents.set(path.posix.basename(file, '.md'), data)
  }
  if (intents.size === 0) {
    throw new Error('版本提升没有消费 change intent')
  }
  return intents
}

export function validateLedger(changes, base, head, updates, intents, yaml) {
  if (changes.filter(change => change.file === '.changeset/ledger.yaml').length !== 1) {
    throw new Error('缺少 intent ledger 变更')
  }
  const previous = yaml.parse(base.read('.changeset/ledger.yaml') || '{}')
  const next = yaml.parse(head.read('.changeset/ledger.yaml') || '')
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object' || Array.isArray(previous) || Array.isArray(next)) {
    throw new Error('intent ledger 无效')
  }
  for (const [key, value] of Object.entries(previous)) {
    if (!isDeepStrictEqual(value, next[key])) {
      throw new Error('intent ledger 修改了已有记录')
    }
  }
  const linked = new Set()
  let additions = 0
  for (const [key, value] of Object.entries(next)) {
    if (Object.hasOwn(previous, key)) {
      continue
    }
    additions += 1
    const update = [...updates.values()].find(item => key === `${item.data.name}@${item.newVersion}`)
    if (!update || !value || !isDeepStrictEqual(Object.keys(value).sort(), ['dir', 'intents'])
      || value.dir !== update.dir || !Array.isArray(value.intents) || value.intents.length === 0
      || new Set(value.intents).size !== value.intents.length) {
      throw new Error('intent ledger 新条目与版本不一致')
    }
    for (const id of value.intents) {
      if (typeof id !== 'string' || !Object.hasOwn(intents.get(id) || {}, update.data.name)) {
        throw new Error('intent ledger 引用了未消费的 intent')
      }
      linked.add(`${id}\0${update.data.name}`)
    }
  }
  if (!additions || [...intents].some(([id, data]) => Object.keys(data).some(name => !linked.has(`${id}\0${name}`)))) {
    throw new Error('intent ledger 未覆盖所有消费记录')
  }
}
