import type { UniAppManifestLike } from './types'

/** 仅移除字符串外的注释，其余语法仍交给严格 JSON 解析。 */
export function parseManifestJson(source: string): UniAppManifestLike {
  const characters = source.split('')
  let inString = false

  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (inString) {
      if (character === '\\') {
        index++
      }
      else if (character === '"') {
        inString = false
      }
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character !== '/') {
      continue
    }

    if (source[index + 1] === '/') {
      characters[index] = ' '
      characters[++index] = ' '
      while (index + 1 < source.length && source[index + 1] !== '\n' && source[index + 1] !== '\r') {
        characters[++index] = ' '
      }
    }
    else if (source[index + 1] === '*') {
      characters[index] = ' '
      characters[++index] = ' '
      let closed = false
      while (++index < source.length) {
        if (source[index] === '*' && source[index + 1] === '/') {
          characters[index] = ' '
          characters[++index] = ' '
          closed = true
          break
        }
        if (source[index] !== '\n' && source[index] !== '\r') {
          characters[index] = ' '
        }
      }
      if (!closed) {
        throw new SyntaxError('manifest.json 中存在未闭合的块注释')
      }
    }
  }

  // 注释用空白替换，避免将原本非法的相邻 token 拼成有效 JSON。
  return JSON.parse(characters.join('')) as UniAppManifestLike
}
