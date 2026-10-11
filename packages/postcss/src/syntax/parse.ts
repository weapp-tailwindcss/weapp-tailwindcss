import type { Root } from 'postcss'
import postcss from 'postcss'
import scssSyntax from 'postcss-scss'

export { default as scss } from 'postcss-scss'

/** 解析标准 CSS；调用方负责处理非法输入。 */
export function parseCssSource(source: string, from?: string): Root {
  return postcss.parse(source, { from })
}

/**
 * 解析 SCSS/Sass 风格源码。
 * `postcss.parse` 不读取 syntax 选项，行注释和插值必须走 SCSS parser。
 */
export function parseScssSource(source: string, from?: string): Root {
  return scssSyntax.parse(source, { from })
}

export function stringifyScssSource(root: Root) {
  return root.toString(scssSyntax.stringify)
}

/** Harmony 在 Sass 预处理前读取局部样式；必须识别行注释，避免将其并入选择器。 */
export function parseUniAppXStyleSource(source: string) {
  return parseScssSource(source)
}

export function isUniAppXStyleSourceEmpty(source: string) {
  try {
    return parseUniAppXStyleSource(source).nodes.every(node => node.type === 'comment')
  }
  catch {
    return false
  }
}
