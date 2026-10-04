import { walk } from 'oxc-walker'
import { parseOxcSync } from '@/js/oxc-parser'
import { loadNativeCompiler } from '@/native'

/** 签名只保留候选文本，不把完整 Babel AST 常驻到转译缓存。 */
export function tryCreateJsRuntimeAffectingSignature(source: string): string | undefined {
  const compiler = loadNativeCompiler()
  if (compiler) {
    const signature = compiler.jsRuntimeSignature(source)
    if (signature !== null) {
      return signature
    }
  }
  try {
    const result = parseOxcSync('runtime.tsx', source, {
      lang: 'tsx',
      sourceType: 'unambiguous',
    })
    if (!result || result.errors.length > 0) {
      return undefined
    }
    const parts: string[] = []
    walk(result.program, {
      enter(node) {
        if (node.type === 'Literal' && typeof node.value === 'string') {
          parts.push(`s:${node.value}`)
        }
        else if (node.type === 'TemplateElement') {
          parts.push(`t:${node.value.raw}`)
        }
        else if (node.type === 'JSXText' && node.value.trim().length > 0) {
          parts.push(`x:${node.value.trim()}`)
        }
      },
    })
    for (const comment of result.comments) {
      if (comment.value.length > 0) {
        parts.push(`c:${comment.value}`)
      }
    }
    return parts.join('\n')
  }
  catch {
    return undefined
  }
}
