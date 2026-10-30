import { Buffer } from 'node:buffer'
import { devNull } from 'node:os'
import path from 'node:path'
import { limits, readBounded } from './files.mjs'

const attributes = ['text', 'eol', 'filter', 'working-tree-encoding', 'export-subst', 'export-ignore', 'ident', 'crlf']
const forbidden = attributes.slice(2)
const environment = Object.freeze({
  GIT_ATTR_NOSYSTEM: '1',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_COUNT: '0',
  GIT_CONFIG_PARAMETERS: '',
})

/** 固定文本导出默认值，显式属性仍来自准确产品 tree。 */
export const archiveGitArgs = args => ['-c', `core.attributesFile=${devNull}`, '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', ...args]
export const archiveGitOptions = commit => ({ environment: { ...environment, GIT_ATTR_SOURCE: commit } })

function policyFor(values, file) {
  for (const name of forbidden) {
    if (Object.hasOwn(values, name)) {
      throw new Error(`不支持的来源属性 ${name}=${values[name]}：${file}`)
    }
  }
  const text = values.text ?? 'unspecified'
  const eol = values.eol ?? 'unspecified'
  if (!['set', 'unset', 'auto', 'unspecified'].includes(text) || !['lf', 'crlf', 'unset', 'unspecified'].includes(eol)) {
    throw new Error(`未知 text/eol 来源属性：${file}`)
  }
  if (eol === 'crlf' && !['set', 'unset'].includes(text)) {
    throw new Error(`CRLF 导出必须显式声明 text 或 -text：${file}`)
  }
  return { text, eol }
}

function parseAttributes(raw, names) {
  const result = new Map(names.map(name => [name, {}]))
  if (raw === '') {
    return result
  }
  if (!raw.endsWith('\0')) {
    throw new Error('Git attributes 输出缺 NUL 终止')
  }
  const parts = raw.slice(0, -1).split('\0')
  if (parts.length % 3 !== 0) {
    throw new Error('Git attributes 输出数量不符')
  }
  for (let offset = 0; offset < parts.length; offset += 3) {
    const [name, attribute, value] = parts.slice(offset, offset + 3)
    const entry = result.get(name)
    if (!entry || !attribute || Object.hasOwn(entry, attribute)) {
      throw new Error('Git attributes 输出含未知或重复项')
    }
    entry[attribute] = value
  }
  return result
}

/** 仅为产品导出附加策略；driver 的 canonical Git 身份不经过文本转换。 */
export async function readArchiveSource(run, repository, identity) {
  const options = archiveGitOptions(identity.sourceCommit)
  const info = (await run('attributes-info-path', 'git', archiveGitArgs(['rev-parse', '--path-format=absolute', '--git-path', 'info/attributes']), repository, options)).stdout.trim()
  if (!path.isAbsolute(info)) {
    throw new Error('Git info/attributes 路径不是绝对路径')
  }
  let infoAttributes = 'absent'
  try {
    if ((await readBounded(info)).length) {
      throw new Error('来源仓库存在非空 info/attributes，不能冒充准确 tree 属性')
    }
    infoAttributes = 'empty'
  }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
  const policies = new Map()
  let batch = []
  let bytes = 0
  let sequence = 0
  const flush = async () => {
    if (!batch.length) {
      return
    }
    const raw = (await run(`attributes-${++sequence}`, 'git', archiveGitArgs(['check-attr', `--source=${identity.sourceCommit}`, '-z', '--all', '--', ...batch]), repository, { ...options, stdoutLimit: limits.manifestBytes })).stdout
    for (const [name, values] of parseAttributes(raw, batch)) {
      policies.set(name, policyFor(values, name))
    }
    batch = []
    bytes = 0
  }
  for (const file of identity.files) {
    const size = Buffer.byteLength(file.logical) + 1
    if (size > 8192) {
      throw new Error('单个属性查询路径超过固定 argv 上限')
    }
    if (bytes + size > 8192) {
      await flush()
    }
    batch.push(file.logical)
    bytes += size
  }
  await flush()
  return {
    ...identity,
    exportPolicy: {
      version: 1,
      sourceCommit: identity.sourceCommit,
      sourceTree: identity.sourceTree,
      attributesFrom: 'exact-source-tree',
      defaultEol: 'lf',
      infoAttributes,
      checkedAttributes: attributes,
      attributeQuery: 'defined-only',
      forbiddenAttributePolicy: 'reject-any-definition',
      configuration: archiveGitArgs([]),
      environment: options.environment,
    },
    files: identity.files.map(file => ({ ...file, archiveAttributes: policies.get(file.logical) })),
  }
}
