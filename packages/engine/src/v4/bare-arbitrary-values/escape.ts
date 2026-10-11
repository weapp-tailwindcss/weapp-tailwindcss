// 基于 CSS.escape 算法，仅用于类选择器转义。
export function escapeCssClassName(value: string) {
  let result = ''
  for (let index = 0; index < value.length; index++) {
    const codeUnit = value.charCodeAt(index)
    const character = value.charAt(index)

    if (codeUnit === 0x0000) {
      result += '\uFFFD'
      continue
    }

    if (
      (codeUnit >= 0x0001 && codeUnit <= 0x001F)
      || codeUnit === 0x007F
      || (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039)
      || (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && value.charCodeAt(0) === 0x002D)
    ) {
      result += `\\${codeUnit.toString(16)} `
      continue
    }

    if (
      codeUnit >= 0x0080
      || codeUnit === 0x002D
      || codeUnit === 0x005F
      || (codeUnit >= 0x0030 && codeUnit <= 0x0039)
      || (codeUnit >= 0x0041 && codeUnit <= 0x005A)
      || (codeUnit >= 0x0061 && codeUnit <= 0x007A)
    ) {
      result += character
      continue
    }

    result += `\\${character}`
  }
  return result
}
