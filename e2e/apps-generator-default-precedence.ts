import { postcss } from '@weapp-tailwindcss/postcss/transform'

/** 本组夹具没有作者尾部 reset；检查原始资产中默认值是否覆盖零 specificity utility。 */
export function findLateGeneratorDefaults(css: string) {
  const root = postcss.parse(css)
  const utilities = new Map<string, Array<{ selector: string, value: string }>>()
  const conflicts: Array<{ property: string, selector: string, value: string, reset: string }> = []
  for (const node of root.nodes) {
    if (node.type !== 'rule') {
      continue
    }
    if (node.selector.startsWith(':where(')) {
      node.each((decl) => {
        if (decl.type === 'decl' && decl.prop.startsWith('--tw-')) {
          const entries = utilities.get(decl.prop) ?? []
          entries.push({ selector: node.selector, value: decl.value })
          utilities.set(decl.prop, entries)
        }
      })
      continue
    }
    const defaults = new Set(['*', '::before', '::after', '::backdrop', ':before', ':after'])
    if (!node.selectors.includes('*') || !node.selectors.every(selector => defaults.has(selector))) {
      continue
    }
    node.each((decl) => {
      if (decl.type !== 'decl' || decl.important) {
        return
      }
      for (const utility of utilities.get(decl.prop) ?? []) {
        if (utility.value !== decl.value) {
          conflicts.push({ property: decl.prop, ...utility, reset: decl.value })
        }
      }
    })
  }
  return conflicts
}
