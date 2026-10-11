import type { Expression, Token } from './types'
// 针对微信的属性表达式进行切词
// https://github.com/sonofmagic/weapp-tailwindcss/issues/319
// all state
import { isWhitespace } from '../whitespace'
import { State } from './types'

export type { Expression, Token } from './types'

export class JavaScriptTokenizer {
  private state: State
  private buffer: string
  private tokens: Token[]
  private bufferStartIndex: number
  private expressionStartIndex: number
  private expressionBuffer: string
  private expressions: Expression[]

  constructor() {
    this.reset()
  }

  private processChar(char: string, index: number) {
    switch (this.state) {
      case State.START:
        if (isWhitespace(char)) {
          // Ignore leading spaces
        }
        else if (char === '{') {
          this.state = State.OPEN_BRACE
          this.bufferStartIndex = index
          this.buffer += char
          this.expressionBuffer = char
          this.expressionStartIndex = index
        }
        else {
          this.state = State.TEXT
          this.bufferStartIndex = index
          this.buffer += char
        }
        break

      case State.TEXT:
        if (isWhitespace(char)) {
          this.tokens.push({ start: this.bufferStartIndex, end: index, value: this.buffer, expressions: this.expressions })
          this.buffer = ''
          this.expressions = []
          this.state = State.START
        }
        else if (char === '{') {
          this.buffer += char
          this.expressionBuffer = char
          this.expressionStartIndex = index
          this.state = State.OPEN_BRACE
        }
        else {
          this.buffer += char
        }
        break

      case State.OPEN_BRACE:
        if (char === '}') {
          this.buffer += char
          this.expressionBuffer += char
          this.state = State.POTENTIAL_CLOSE
        }
        else {
          this.buffer += char
          this.expressionBuffer += char
        }
        break

      case State.POTENTIAL_CLOSE:
        if (char === '}') {
          this.buffer += char
          this.expressionBuffer += char
          this.expressions.push({
            start: this.expressionStartIndex,
            end: index + 1,
            value: this.expressionBuffer,
          })
          this.expressionBuffer = ''
          this.state = State.BRACES_COMPLETE
        }
        else {
          this.buffer += char
          this.expressionBuffer += char
          this.state = State.OPEN_BRACE
        }
        break

      case State.BRACES_COMPLETE:
        if (isWhitespace(char)) {
          this.tokens.push({
            start: this.bufferStartIndex,
            end: index,
            value: this.buffer,
            expressions: this.expressions,
          })
          this.buffer = ''
          this.expressions = []
          this.state = State.START
        }
        else if (char === '{') {
          this.expressionStartIndex = index
          this.expressionBuffer = char
          this.buffer += char
          this.state = State.OPEN_BRACE
        }
        else {
          this.buffer += char
          this.state = State.TEXT
        }
        break

      default:
        throw new Error('Unexpected state')
    }
  }

  public run(input: string): Token[] {
    this.reset()

    for (let i = 0; i < input.length; i++) {
      const char = input[i]
      if (char === undefined) {
        continue
      }
      this.processChar(char, i)
    }
    // Push the last buffer if it's not empty
    if (this.buffer.length > 0) {
      this.tokens.push({
        start: this.bufferStartIndex,
        end: input.length,
        value: this.buffer,
        expressions: this.expressions,
      })
    }
    const tokens = this.tokens
    // reset internal state to make tokenizer reusable
    this.reset()
    return tokens
  }

  public reset() {
    this.state = State.START
    this.buffer = ''
    this.tokens = []
    this.bufferStartIndex = 0
    this.expressionBuffer = ''
    this.expressionStartIndex = 0
    this.expressions = []
  }
}
