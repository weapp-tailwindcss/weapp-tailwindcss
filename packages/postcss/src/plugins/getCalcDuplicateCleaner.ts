// 清理由 cssCalc 引入的重复声明，避免输出冗余属性
import type { AcceptedPlugin } from 'postcss'
import type { IStyleHandlerOptions } from '../types'

const MULTIPLICATION_GROUP_RE = /\((var\([^()]+\)(?:\s*\*\s*-?(?:\d+(?:\.\d+)?|\.\d+|[a-z_][\w-]*))+)\)/gi

function normalizeCalcValue(value: string) {
  if (!value.includes('calc(')) {
    return value
  }
  let normalized = value.replace(/\s+/g, '')
  let previous: string
  do {
    previous = normalized
    normalized = normalized.replace(MULTIPLICATION_GROUP_RE, '$1')
  } while (normalized !== previous)
  return normalized
}

const calcDuplicateCleanerPlugin: AcceptedPlugin = {
  postcssPlugin: 'postcss-calc-duplicate-cleaner',
  OnceExit(root) {
    root.walkRules((rule) => {
      const declarations = new Set<string>()
      for (const node of [...rule.nodes]) {
        if (node.type !== 'decl') {
          continue
        }
        const decl = node
        const key = `${decl.prop}\0${decl.important ? '1' : '0'}\0${normalizeCalcValue(decl.value)}`
        if (declarations.has(key)) {
          decl.remove()
        }
        else {
          declarations.add(key)
        }
      }
    })
  },
}

export function getCalcDuplicateCleaner(options: IStyleHandlerOptions): AcceptedPlugin | null {
  if (!options.cssCalc || options.cssCalc === 'auto') {
    return null
  }

  return calcDuplicateCleanerPlugin
}
