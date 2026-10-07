import type { ITemplateHandlerOptions } from '../../types'
import MagicString from 'magic-string'
import { nativeStaticTemplateReplacer } from '../native/static'
import { Tokenizer } from '../Tokenizer'
import { handleEachClassFragment } from './fragment-updater'

/**
 * 模块级共享 Tokenizer 实例，避免每次调用都重新创建。
 * Tokenizer.run() 末尾已调用 reset()，天然支持复用。
 */
const sharedTokenizer = new Tokenizer()

export function templateReplacer(original: string, options: ITemplateHandlerOptions = {}, tokenizer?: Tokenizer) {
  if (!tokenizer) {
    const native = nativeStaticTemplateReplacer(original, options)
    if (native !== undefined) {
      return native
    }
  }
  const ms = new MagicString(original)
  const tok = tokenizer ?? sharedTokenizer
  const tokens = tok.run(ms.original)
  handleEachClassFragment(ms, tokens, options)
  return ms.toString()
}
