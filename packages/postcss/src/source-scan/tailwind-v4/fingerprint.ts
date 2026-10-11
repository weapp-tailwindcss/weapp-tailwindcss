import { postcss } from '../../postcss-runtime'

function createStableTextSignature(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function parseQuotedRequest(params: string) {
  const input = params.trim()
  const quote = input[0]
  if (quote !== '"' && quote !== '\'') {
    return
  }

  let escaped = false
  for (let index = 1; index < input.length; index++) {
    const char = input[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === quote) {
      return input.slice(1, index)
    }
  }
}

function parseSourceParams(params: string) {
  let input = params.trim()
  let negated = false
  if (input.startsWith('not ')) {
    negated = true
    input = input.slice(4).trim()
  }

  if (input.startsWith('inline(') && input.endsWith(')')) {
    return {
      prefix: negated ? 'source:inline:not' : 'source:inline',
      value: input.slice(7, -1).trim(),
    }
  }

  const request = parseQuotedRequest(input)
  if (!request) {
    return
  }

  return {
    prefix: negated ? 'source:not' : 'source',
    value: request,
  }
}

function parseTailwindImportSource(params: string) {
  const request = parseQuotedRequest(params)
  if (request !== 'tailwindcss') {
    return
  }
  const sourceMatch = /\bsource\(([^)]*)\)/.exec(params)
  return sourceMatch?.[1]?.trim()
}

function hasExplicitTailwindV4Directive(root: postcss.Root) {
  try {
    let found = false
    root.walkAtRules((rule) => {
      if (
        rule.name === 'config'
        || rule.name === 'source'
        || rule.name === 'plugin'
        || rule.name === 'custom-variant'
        || rule.name === 'theme'
        || rule.name === 'utility'
        || rule.name === 'variant'
        || rule.name === 'apply'
      ) {
        found = true
        return false
      }
    })
    return found
  }
  catch {
    return false
  }
}

function collectTailwindV4SourceFingerprint(root: postcss.Root, configBasename: (request: string) => string) {
  const tokens = new Set<string>()
  const add = (prefix: string, value: string) => {
    tokens.add(`${prefix}:${value.trim()}`)
  }

  try {
    root.walkAtRules((rule) => {
      if (rule.name === 'import') {
        const sourceMode = parseTailwindImportSource(rule.params)
        if (sourceMode) {
          add('import-source', sourceMode)
        }
        return
      }

      if (rule.name === 'config') {
        const configRequest = parseQuotedRequest(rule.params)
        if (configRequest) {
          add('config', configBasename(configRequest))
          add('config-request', configRequest.replace(/\\/g, '/'))
        }
        return
      }

      if (rule.name === 'source') {
        const parsed = parseSourceParams(rule.params)
        if (parsed) {
          add(parsed.prefix, parsed.value)
        }
        return
      }

      if (rule.name === 'plugin') {
        const request = parseQuotedRequest(rule.params)
        if (!request) {
          return
        }
        add('plugin', request)
        add('plugin-request', request.replace(/\\/g, '/'))
        if (rule.nodes?.length) {
          add('plugin-options', `${request}:${createStableTextSignature(rule.toString())}`)
          rule.walkDecls((decl) => {
            add('plugin-option', `${request}:${decl.prop}:${decl.value}`)
          })
        }
        return
      }

      if (rule.name === 'custom-variant') {
        const [name] = rule.params.trim().split(/\s+/, 1)
        if (name) {
          add('custom-variant', name)
        }
        return
      }

      if (rule.name === 'theme' || rule.name === 'utility' || rule.name === 'variant' || rule.name === 'layer') {
        const [name] = rule.params.trim().split(/\s+/, 1)
        if (name) {
          add('directive', name)
        }
      }
    })

    root.walkDecls((decl) => {
      if (decl.prop.startsWith('--')) {
        add('theme-token', decl.prop)
      }
    })

    root.walkRules((rule) => {
      for (const selector of rule.selectors ?? []) {
        const match = /\.([_a-z][\w-]*)/i.exec(selector)
        if (match?.[1]) {
          add('selector', match[1])
        }
      }
    })
  }
  catch {
  }
  return tokens
}

/** 单次入口选择内复用解析结果，仅在需要匹配时计算指纹。 */
export function analyzeTailwindV4Source(source: string, configBasename: (request: string) => string) {
  let root: postcss.Root | undefined
  try {
    root = postcss.parse(source)
  }
  catch {
  }
  let fingerprint: Set<string> | undefined
  return {
    hasExplicitDirectives: root ? hasExplicitTailwindV4Directive(root) : false,
    getFingerprint() {
      return fingerprint ??= root ? collectTailwindV4SourceFingerprint(root, configBasename) : new Set<string>()
    },
  }
}
