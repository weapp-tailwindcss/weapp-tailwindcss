import postcss from 'postcss'

function isMiniProgramPreflightRule(rule: postcss.Rule) {
  const selectors = new Set((rule.selectors ?? [rule.selector])
    .map(selector => selector.trim().replace(/^:before$/, '::before').replace(/^:after$/, '::after')))
  return selectors.has('view') && selectors.has('text') && selectors.has('::before') && selectors.has('::after')
}

export function removeMiniProgramPreflightSelectorRule(source: string) {
  try {
    const root = postcss.parse(source)
    let changed = false
    root.walkRules((rule) => {
      if (isMiniProgramPreflightRule(rule)) {
        rule.remove()
        changed = true
      }
    })
    return changed ? root.toString() : source
  }
  catch {
    return source.replace(/(?:^|[}\s])\s*view\s*,\s*text\s*,\s*::after\s*,\s*::before\s*\{[^}]*\}/g, '')
  }
}

export function dedupeMiniProgramPreflightSelectorRules(source: string) {
  try {
    const root = postcss.parse(source)
    let firstRule: postcss.Rule | undefined
    const existingProps = new Set<string>()
    let changed = false
    root.walkRules((rule) => {
      if (!isMiniProgramPreflightRule(rule)) {
        return
      }
      if (!firstRule) {
        firstRule = rule
        rule.walkDecls((decl) => {
          existingProps.add(decl.prop)
        })
        return
      }
      rule.walkDecls((decl) => {
        if (!existingProps.has(decl.prop)) {
          firstRule?.append(decl.clone())
          existingProps.add(decl.prop)
        }
      })
      rule.remove()
      changed = true
    })
    return changed ? root.toString() : source
  }
  catch {
    return source
  }
}

export function hasMiniProgramPreflightSelector(source: string) {
  try {
    let found = false
    postcss.parse(source).walkRules((rule) => {
      if (isMiniProgramPreflightRule(rule)) {
        found = true
        return false
      }
    })
    return found
  }
  catch {
    return /(?:^|[},])\s*view\s*,\s*text\s*,\s*::after\s*,\s*::before\s*\{/.test(source)
  }
}

export function ensureWebpackMiniProgramTwContentInit(source: string) {
  if (!source.includes('var(--tw-content)')) {
    return source
  }
  try {
    const root = postcss.parse(source)
    let changed = false
    root.walkRules((rule) => {
      if (!isMiniProgramPreflightRule(rule)) {
        return
      }
      let hasContentInit = false
      rule.walkDecls('--tw-content', () => {
        hasContentInit = true
      })
      if (!hasContentInit) {
        rule.append(postcss.decl({ prop: '--tw-content', value: '\'\'' }))
        changed = true
      }
      return false
    })
    return changed ? root.toString() : source
  }
  catch {
    return source
  }
}

export function removeTailwindV4StandaloneHostPreflightRule(source: string) {
  if (!source.includes('--theme(')) {
    return source
  }
  try {
    const root = postcss.parse(source)
    let changed = false
    root.walkRules((rule) => {
      if (rule.selector.trim() !== ':host') {
        return
      }
      if (!rule.nodes?.some(node => node.type === 'decl' && node.value?.includes('--theme('))) {
        return
      }
      rule.remove()
      changed = true
    })
    return changed ? root.toString() : source
  }
  catch {
    return source
  }
}
