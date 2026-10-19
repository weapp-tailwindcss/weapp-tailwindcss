import { tokenize, TokenType } from '@csstools/css-tokenizer'

/** 比较 CSS token 身份，只统一字符串引号与字符串外连续空白，不改写字符串内容。 */
export function cssValueSignature(value: string): string {
  return JSON.stringify(tokenize({ css: value }).filter(token => token[0] !== TokenType.EOF).map((token) => {
    if (token[0] === TokenType.String) {
      return [token[0], token[4].value]
    }
    return [token[0], token[0] === TokenType.Whitespace ? ' ' : token[1]]
  }))
}
