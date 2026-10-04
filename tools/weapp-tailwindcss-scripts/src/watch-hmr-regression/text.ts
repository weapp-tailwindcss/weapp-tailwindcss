import type { ClassMutationPayload, StyleMutationPayload } from './types'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { sleep } from './session'

const CRLF_RE = /\r\n/g
const LF_RE = /(?<!\r)\n/g
const ANY_EOL_RE = /\r?\n/g
const WHITESPACE_RE = /\s+/g
const ESCAPE_REGEXP_RE = /[.*+?^${}()|[\]\\]/g
const DIGITS_RE = /\D/g
const COMMENT_CARRIER_SCRIPT_MARKER_RE = /\/\* [\s\S]*? \*\/\nconst __twWatchScriptCommentMarker = 'tw-watch-[^']+'\n/g
const COMMENT_CARRIER_TEMPLATE_MARKER_RE = /\n {4}<view hidden>\{\{ __twWatchScriptCommentMarker \}\}<\/view>/g
const VUE_TEMPLATE_ROOT_CLOSING_RE = /\n[ \t]*<\/[a-zA-Z][\w-]*>\s*\n<\/template>/g

function isRetryableFsError(error: unknown) {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
}

function resolvePreferredEol(source: string) {
  const crlfCount = (source.match(CRLF_RE) ?? []).length
  const lfCount = (source.match(LF_RE) ?? []).length
  if (crlfCount > 0 && crlfCount >= lfCount) {
    return '\r\n'
  }
  return '\n'
}

export function alignContentEol(content: string, source: string) {
  const eol = resolvePreferredEol(source)
  return content.replace(ANY_EOL_RE, eol)
}

export async function readFileWithRetry(
  file: string,
  options: {
    retries?: number
    retryDelayMs?: number
  } = {},
) {
  const retries = options.retries ?? 12
  const retryDelayMs = options.retryDelayMs ?? 100
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fs.readFile(file, 'utf8')
    }
    catch (error) {
      lastError = error
      if (!isRetryableFsError(error) || attempt >= retries) {
        throw error
      }
      await sleep(retryDelayMs)
    }
  }

  throw lastError
}

export async function readFileIfExists(file: string) {
  try {
    return await readFileWithRetry(file)
  }
  catch {
    return undefined
  }
}

export async function getMtime(file: string) {
  const retries = 6
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const stats = await fs.stat(file)
      return stats.mtimeMs
    }
    catch (error) {
      if (!isRetryableFsError(error) || attempt >= retries) {
        return 0
      }
      await sleep(40)
    }
  }
  return 0
}

export async function writeFilePreserveEol(
  file: string,
  content: string,
  source: string,
  options: {
    retries?: number
    retryDelayMs?: number
    writeMode?: 'atomic-replace' | 'in-place'
    /** 恢复已保存的原文时关闭换行归一化，保留混合换行。 */
    normalizeEol?: boolean
  } = {},
) {
  const retries = options.retries ?? 12
  const retryDelayMs = options.retryDelayMs ?? 100
  const writeMode = options.writeMode ?? 'atomic-replace'
  const alignedContent = options.normalizeEol === false ? content : alignContentEol(content, source)

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const temporaryFile = path.join(
      path.dirname(file),
      `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
    )
    try {
      let previousMtime = 0
      let previousMode: number | undefined
      try {
        const previousStats = await fs.stat(file)
        previousMtime = previousStats.mtimeMs
        previousMode = previousStats.mode
      }
      catch {
      }

      if (writeMode === 'in-place') {
        await fs.writeFile(file, alignedContent, {
          encoding: 'utf8',
          flag: 'w',
          ...(previousMode == null ? {} : { mode: previousMode }),
        })
      }
      else {
        await fs.writeFile(temporaryFile, alignedContent, {
          encoding: 'utf8',
          ...(previousMode == null ? {} : { mode: previousMode }),
        })
        await fs.rename(temporaryFile, file)
      }
      const currentStats = await fs.stat(file)
      if (currentStats.mtimeMs <= previousMtime) {
        const nextMtime = new Date(previousMtime + 10)
        await fs.utimes(file, nextMtime, nextMtime)
      }
      return
    }
    catch (error) {
      await fs.rm(temporaryFile, { force: true }).catch(() => undefined)
      if (!isRetryableFsError(error) || attempt >= retries) {
        throw error
      }
      await sleep(retryDelayMs)
    }
  }
}

/**
 * 更新 dev server 正在监听的文件时保留文件身份，避免连续原子替换使 watcher 仍绑定旧文件。
 */
export async function writeWatchedFilePreserveEol(file: string, content: string, source: string) {
  await writeFilePreserveEol(file, content, source, {
    writeMode: 'in-place',
  })
}

export async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  options: {
    timeoutMs: number
    pollMs: number
    message: string
    onTick?: () => void
    signal?: AbortSignal | undefined
  },
  startedAt = Date.now(),
) {
  while (Date.now() - startedAt <= options.timeoutMs) {
    options.signal?.throwIfAborted()
    options.onTick?.()
    const matched = await predicate()
    options.signal?.throwIfAborted()
    if (matched) {
      return Date.now() - startedAt
    }
    options.onTick?.()
    try {
      await delay(options.pollMs, undefined, { signal: options.signal })
    }
    catch (error) {
      options.signal?.throwIfAborted()
      throw error
    }
  }
  options.signal?.throwIfAborted()
  throw new Error(options.message)
}

export function assertContains(source: string, expected: string, hint: string) {
  if (!source.includes(expected)) {
    throw new Error(`${hint}: expected to contain ${expected}`)
  }
}

export function assertNotContains(source: string, unexpected: string, hint: string) {
  if (source.includes(unexpected)) {
    throw new Error(`${hint}: expected to not contain ${unexpected}`)
  }
}

export function assertContainsOneOf(source: string, expected: string[], hint: string) {
  for (const value of expected) {
    if (source.includes(value)) {
      return
    }
  }
  throw new Error(`${hint}: expected to contain one of ${expected.join(' | ')}`)
}

export function escapeRegExp(value: string) {
  return value.replace(ESCAPE_REGEXP_RE, '\\$&')
}

export function findCssRuleBody(source: string, selector: string) {
  const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'i')
  const matched = source.match(pattern)
  return matched?.[1]
}

export function findCssRuleBodies(source: string, selector: string) {
  const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'gi')
  return [...source.matchAll(pattern)].map(match => match[1]).filter((body): body is string => body != null)
}

export function normalizeCssDeclaration(value: string) {
  return value.replace(WHITESPACE_RE, '').toLowerCase()
}

export function insertBeforeClosingTag(source: string, closingTag: string, snippet: string) {
  const index = source.lastIndexOf(closingTag)
  if (index === -1) {
    throw new Error(`closing tag ${closingTag} not found`)
  }
  return `${source.slice(0, index)}\n${snippet}\n${source.slice(index)}`
}

export function insertBeforeAnchor(source: string, anchor: string, snippet: string) {
  const index = source.indexOf(anchor)
  if (index === -1) {
    throw new Error(`anchor ${anchor} not found`)
  }
  return `${source.slice(0, index)}${snippet}${source.slice(index)}`
}

export function replaceExactSnippet(source: string, anchor: string, replacement: string, label = 'snippet') {
  if (!source.includes(anchor)) {
    throw new Error(`${label} not found: ${anchor}`)
  }
  return source.replace(anchor, replacement)
}

export function appendTrailingSnippet(source: string, snippet: string) {
  if (source.endsWith('\n')) {
    return `${source}${snippet}\n`
  }
  return `${source}\n${snippet}\n`
}

export function createStyleRuleSnippet(payload: StyleMutationPayload) {
  const numericSeed = payload.marker.replace(DIGITS_RE, '')
  const colorSeed = (numericSeed.slice(-6) || '123456').padStart(6, '0').slice(0, 6)
  const applySnippet = payload.applyUtilities.length > 0
    ? ` @apply ${payload.applyUtilities.join(' ')};`
    : ''
  const lines = [
    payload.referenceDirective,
    `${payload.styleNeedle} {${applySnippet} color: #${colorSeed}; }`,
  ]

  if (payload.functionNeedle && payload.functionDeclarations.length > 0) {
    lines.push(`${payload.functionNeedle} { ${payload.functionDeclarations.join(' ')} }`)
  }

  return lines.filter(Boolean).join('\n')
}

export function mutateScriptByDataAnchor(source: string, dataAnchor: string, payload: ClassMutationPayload, indent = '    ') {
  if (!source.includes(dataAnchor)) {
    throw new Error(`script data anchor not found: ${dataAnchor}`)
  }
  return source.replace(
    dataAnchor,
    `${dataAnchor}\n${indent}${payload.classVariableName}: '${payload.classLiteral}',\n${indent}__twWatchScriptMarker: '${payload.marker}',`,
  )
}

export function mutateScriptByDataAnchorWithCommentCarrier(
  source: string,
  dataAnchor: string,
  payload: ClassMutationPayload,
  indent = '    ',
) {
  if (!source.includes(dataAnchor)) {
    throw new Error(`script data anchor not found: ${dataAnchor}`)
  }
  return source.replace(
    dataAnchor,
    `/* ${payload.classLiteral} */\n${dataAnchor}\n${indent}__twWatchScriptCommentMarker: '${payload.marker}',`,
  )
}

export function mutateTsxScriptByReturnAnchor(source: string, payload: ClassMutationPayload, returnAnchor = '  return (') {
  const snippet = [
    `  const ${payload.classVariableName} = '${payload.classLiteral}'`,
    `  const __twWatchScriptMarker = '${payload.marker}'`,
    '',
  ].join('\n')
  const withScriptConst = insertBeforeAnchor(source, returnAnchor, snippet)
  const viewSnippet = `      <View className={${payload.classVariableName}}>${payload.marker}-script</View>`

  const closingCandidates = [
    '    </>',
    '  </>',
    '    </View>',
    '  </View>',
  ]

  for (const closingTag of closingCandidates) {
    if (withScriptConst.includes(closingTag)) {
      return insertBeforeClosingTag(withScriptConst, closingTag, viewSnippet)
    }
  }

  throw new Error('tsx closing tag not found for script mutation')
}

export function mutateTsxScriptByReturnAnchorWithCommentCarrier(
  source: string,
  payload: ClassMutationPayload,
  returnAnchor = '  return (',
) {
  const snippet = [
    `  /* ${payload.classLiteral} */`,
    `  const __twWatchScriptCommentMarker = '${payload.marker}'`,
    '',
  ].join('\n')
  const withScriptConst = insertBeforeAnchor(source, returnAnchor, snippet)
  const viewSnippet = `      <View>${payload.marker}-script-comment</View>`

  const closingCandidates = [
    '    </>',
    '  </>',
    '    </View>',
    '  </View>',
  ]

  for (const closingTag of closingCandidates) {
    if (withScriptConst.includes(closingTag)) {
      return insertBeforeClosingTag(withScriptConst, closingTag, viewSnippet)
    }
  }

  throw new Error('tsx closing tag not found for script comment-carrier mutation')
}

export function mutateVueScriptSetupArrayByAnchor(
  source: string,
  arrayAnchor: string,
  payload: ClassMutationPayload,
) {
  if (!source.includes(arrayAnchor)) {
    throw new Error(`vue script setup array anchor not found: ${arrayAnchor}`)
  }

  return source.replace(
    arrayAnchor,
    `${arrayAnchor}\n  '${payload.classLiteral}',\n  '${payload.marker}',`,
  )
}

export function mutateVueScriptSetupObjectKeyByAnchor(
  source: string,
  objectKeyAnchor: string,
  payload: ClassMutationPayload,
) {
  if (!source.includes(objectKeyAnchor)) {
    throw new Error(`vue script setup object key anchor not found: ${objectKeyAnchor}`)
  }

  const nextEntries = payload.classLiteral
    .split(WHITESPACE_RE)
    .filter(Boolean)
    .map(token => `  '${token}':true`)
    .join(',\n')

  return source.replace(
    objectKeyAnchor,
    nextEntries,
  )
}

export function insertIntoVueTemplateRoot(source: string, snippet: string) {
  const templateStart = source.indexOf('<template>')
  const templateEnd = source.lastIndexOf('</template>')
  if (templateStart === -1 || templateEnd === -1) {
    throw new Error('template block not found')
  }

  const templateBlock = source.slice(templateStart, templateEnd + '</template>'.length)
  const rootClosingTagMatches = [...templateBlock.matchAll(VUE_TEMPLATE_ROOT_CLOSING_RE)]
  const rootClosingTagMatch = rootClosingTagMatches.at(-1)
  if (rootClosingTagMatch?.index == null) {
    throw new Error('vue template root closing tag not found')
  }

  const insertIndex = templateStart + rootClosingTagMatch.index
  return `${source.slice(0, insertIndex)}\n${snippet}${source.slice(insertIndex)}`
}

export function mutateVueScriptSetupArrayByAnchorWithCommentCarrier(
  source: string,
  arrayAnchor: string,
  payload: ClassMutationPayload,
) {
  const cleanedSource = source.replace(
    COMMENT_CARRIER_SCRIPT_MARKER_RE,
    '',
  )
  const cleanedTemplateSource = cleanedSource.replace(
    COMMENT_CARRIER_TEMPLATE_MARKER_RE,
    '',
  )

  if (!cleanedTemplateSource.includes(arrayAnchor)) {
    throw new Error(`vue script setup array anchor not found: ${arrayAnchor}`)
  }

  const nextSource = cleanedTemplateSource.replace(
    arrayAnchor,
    `/* ${payload.classLiteral} */\nconst __twWatchScriptCommentMarker = '${payload.marker}'\n${arrayAnchor}`,
  )
  return insertIntoVueTemplateRoot(
    nextSource,
    '    <view hidden>{{ __twWatchScriptCommentMarker }}</view>',
  )
}

export function mutateVueScriptSetupObjectKeyByAnchorWithCommentCarrier(
  source: string,
  objectKeyAnchor: string,
  payload: ClassMutationPayload,
) {
  const cleanedSource = source.replace(
    COMMENT_CARRIER_SCRIPT_MARKER_RE,
    '',
  )
  const cleanedTemplateSource = cleanedSource.replace(
    COMMENT_CARRIER_TEMPLATE_MARKER_RE,
    '',
  )

  if (!cleanedTemplateSource.includes(objectKeyAnchor)) {
    throw new Error(`vue script setup object key anchor not found: ${objectKeyAnchor}`)
  }

  const nextSource = cleanedTemplateSource.replace(
    objectKeyAnchor,
    `/* ${payload.classLiteral} */\nconst __twWatchScriptCommentMarker = '${payload.marker}'\n${objectKeyAnchor}`,
  )
  return insertIntoVueTemplateRoot(
    nextSource,
    '    <view hidden>{{ __twWatchScriptCommentMarker }}</view>',
  )
}

export function mutateVueRefStringLiteral(
  source: string,
  refName: string,
  payload: ClassMutationPayload,
) {
  const pattern = new RegExp(`(const\\s+${refName}\\s*=\\s*ref\\(')([^']*)('\\))`)
  if (!pattern.test(source)) {
    throw new Error(`vue ref string literal not found: ${refName}`)
  }

  return source.replace(
    pattern,
    (_match, head: string, value: string, tail: string) => {
      return `${head}${value} ${payload.classLiteral} ${payload.marker}${tail}`
    },
  )
}

export function mutateSfcStyleBlock(source: string, payload: StyleMutationPayload) {
  if (!source.includes('</style>')) {
    throw new Error('style closing tag </style> not found')
  }
  return insertBeforeClosingTag(source, '</style>', createStyleRuleSnippet(payload))
}
