import postcss from 'postcss'

export interface ScopedDarkApplyProbeState {
  darkBackground: string
  display: 'block' | 'flex' | 'inline-flex'
}

export const initialScopedDarkApplyProbeState: ScopedDarkApplyProbeState = {
  darkBackground: '#232323',
  display: 'flex',
}

function createApplyDirective(state: ScopedDarkApplyProbeState) {
  return `@apply ${state.display} bg-[#f1f1f1] dark:bg-[${state.darkBackground}];`
}

export function replaceScopedDarkApplyProbeState(
  source: string,
  from: ScopedDarkApplyProbeState,
  to: ScopedDarkApplyProbeState,
) {
  return source.replace(createApplyDirective(from), createApplyDirective(to))
}

function collectScopedDarkApplyProbeDeclarations(source: string) {
  const groups = new Map<string, { baseBackgrounds: Set<string>, darkBackgrounds: Set<string>, displays: Set<string> }>()
  const backgrounds = new Set<string>()
  const root = postcss.parse(source)
  root.walkRules((rule) => {
    let parent = rule.parent
    let isDark = false
    let canProveState = true
    while (parent) {
      if (parent.type === 'atrule') {
        if (parent.name.toLowerCase() === 'media'
          && /^\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/i.test(parent.params)) {
          isDark = true
        }
        else if (parent.name.toLowerCase() !== 'layer') {
          canProveState = false
        }
      }
      else if (parent.type !== 'root') {
        canProveState = false
      }
      parent = parent.parent
    }
    for (const selector of rule.selectors) {
      // 只观察已展开的探针主体；后代、伪元素与不同作用域不能共同证明一次更新。
      const match = /^\.hello-scss(?:\.(data-v-[\w-]+)|\[(data-v-[\w-]+)\])$/.exec(selector.trim())
      if (!match) {
        continue
      }
      const identity = match[1] ?? match[2] ?? ''
      let declarations = groups.get(identity)
      if (!declarations) {
        declarations = { baseBackgrounds: new Set(), darkBackgrounds: new Set(), displays: new Set() }
        groups.set(identity, declarations)
      }
      for (const declaration of rule.nodes) {
        if (declaration.type !== 'decl') {
          continue
        }
        const value = declaration.value.toLowerCase()
        // 附加条件内的旧色仍可能覆盖新色；它不能证明成功，但必须参与残留检查。
        if (declaration.prop === 'background-color') {
          backgrounds.add(value)
        }
        if (!canProveState) {
          continue
        }
        if (declaration.prop === 'background-color') {
          (isDark ? declarations.darkBackgrounds : declarations.baseBackgrounds).add(value)
        }
        else if (!isDark && declaration.prop === 'display') {
          declarations.displays.add(value)
        }
      }
    }
  })
  return { groups: [...groups.values()], backgrounds }
}

export function hasScopedDarkApplyProbeDisplay(
  source: string,
  display: ScopedDarkApplyProbeState['display'],
) {
  try {
    return collectScopedDarkApplyProbeDeclarations(source).groups.some(group => group.displays.size === 1 && group.displays.has(display))
  }
  catch {
    return false
  }
}

export function hasScopedDarkApplyProbeStyle(source: string, options: ScopedDarkApplyProbeState & {
  staleDarkBackgrounds?: readonly string[] | undefined
}) {
  try {
    const declarations = collectScopedDarkApplyProbeDeclarations(source)
    return declarations.groups.some(group => group.displays.size === 1 && group.displays.has(options.display)
      && group.baseBackgrounds.size === 1 && group.baseBackgrounds.has('#f1f1f1')
      && group.darkBackgrounds.size === 1 && group.darkBackgrounds.has(options.darkBackground.toLowerCase()))
    && (options.staleDarkBackgrounds ?? []).every(
      background => !declarations.backgrounds.has(background.toLowerCase()),
    )
  }
  catch {
    return false
  }
}
