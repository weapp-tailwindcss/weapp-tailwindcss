import type { Token } from './tokenizer/types'
import { JavaScriptTokenizer } from './tokenizer/javascript'
import { tokenizeWithNative } from './tokenizer/native'

export type { Expression, Token } from './tokenizer/types'

export class Tokenizer {
  private readonly fallback = new JavaScriptTokenizer()

  public run(input: string): Token[] {
    return tokenizeWithNative(input) ?? this.fallback.run(input)
  }

  public reset() {
    this.fallback.reset()
  }
}
