import type { NodePath } from '@babel/traverse'
import type { Node, StringLiteral, TemplateElement } from '@babel/types'

const CLASS_LIKE_KEYWORDS = new Set([
  'class',
  'classname',
  'hoverclass',
  'virtualhostclass',
  'rootclass',
])

const CLASS_HELPER_IDENTIFIERS = new Set([
  'cn',
  'clsx',
  'classnames',
  'twmerge',
  'cva',
  'tv',
  'cx',
  'r',
])

const DASH_CODE = 45
const COLON_CODE = 58
const UPPERCASE_A_CODE = 65
const UPPERCASE_Z_CODE = 90
const UNDERSCORE_CODE = 95
const ASCII_MAX_CODE = 127
const NORMALIZE_KEYWORD_REGEXP = /[-_:]/g

function normalizeKeyword(name: string) {
  const length = name.length
  let firstNormalizedIndex = -1

  for (let i = 0; i < length; i++) {
    const code = name.charCodeAt(i)
    if (
      code === DASH_CODE
      || code === UNDERSCORE_CODE
      || code === COLON_CODE
      || (code >= UPPERCASE_A_CODE && code <= UPPERCASE_Z_CODE)
    ) {
      firstNormalizedIndex = i
      break
    }
    if (code > ASCII_MAX_CODE) {
      return name.replace(NORMALIZE_KEYWORD_REGEXP, '').toLowerCase()
    }
  }

  if (firstNormalizedIndex === -1) {
    return name
  }

  let normalized = name.slice(0, firstNormalizedIndex)
  for (let i = firstNormalizedIndex; i < length; i++) {
    const code = name.charCodeAt(i)
    if (code === DASH_CODE || code === UNDERSCORE_CODE || code === COLON_CODE) {
      continue
    }
    if (code >= UPPERCASE_A_CODE && code <= UPPERCASE_Z_CODE) {
      normalized += String.fromCharCode(code + 32)
      continue
    }
    if (code > ASCII_MAX_CODE) {
      return name.replace(NORMALIZE_KEYWORD_REGEXP, '').toLowerCase()
    }
    normalized += name[i]
  }

  return normalized
}

export function isClassLikeName(name: string) {
  return CLASS_LIKE_KEYWORDS.has(normalizeKeyword(name))
}

export function isClassHelperName(name: string) {
  return CLASS_HELPER_IDENTIFIERS.has(normalizeKeyword(name))
}

function readObjectKeyName(path: NodePath<Node>): string | undefined {
  if (path.isIdentifier()) {
    return path.node.name
  }
  if (path.isStringLiteral()) {
    return path.node.value
  }
  if (path.isTemplateLiteral() && path.node.expressions.length === 0) {
    return path.node.quasis[0]?.value.cooked ?? path.node.quasis[0]?.value.raw
  }
  return undefined
}

function isClassLikeObjectProperty(path: NodePath<Node>, valuePath: NodePath<Node>) {
  if (!path.isObjectProperty()) {
    return false
  }
  if (path.get('value') !== valuePath) {
    return false
  }

  const keyName = readObjectKeyName(path.get('key'))
  if (!keyName) {
    return false
  }

  return isClassLikeName(keyName)
}

function isClassLikeJsxAttribute(path: NodePath<Node>) {
  if (!path.isJSXAttribute()) {
    return false
  }
  const namePath = path.get('name')
  if (!namePath.isJSXIdentifier()) {
    return false
  }
  return isClassLikeName(namePath.node.name)
}

function readCallHelperName(calleePath: NodePath<Node>) {
  if (calleePath.isIdentifier()) {
    return calleePath.node.name
  }

  if (calleePath.isMemberExpression()) {
    const propertyPath = calleePath.get('property')
    if (propertyPath.isIdentifier()) {
      return propertyPath.node.name
    }
    if (propertyPath.isStringLiteral()) {
      return propertyPath.node.value
    }
  }

  return undefined
}

function isClassLikeCallExpression(path: NodePath<Node>, valuePath: NodePath<Node>) {
  if (!path.isCallExpression()) {
    return false
  }

  const helperName = readCallHelperName(path.get('callee'))
  if (!helperName || !isClassHelperName(helperName)) {
    return false
  }

  return path.get('arguments').some(argumentPath => argumentPath.node === valuePath.node)
}

/**
 * 判断字符串字面量是否处于 class 语义上下文。
 * 仅用于受控兜底场景，避免将普通业务文本误判为 class。
 */
export function isClassContextLiteralPath(path: NodePath<StringLiteral | TemplateElement>) {
  let current: NodePath<Node> = path as unknown as NodePath<Node>

  while (current.parentPath) {
    const parent = current.parentPath as NodePath<Node>

    if (isClassLikeObjectProperty(parent, current)) {
      return true
    }

    if (isClassLikeJsxAttribute(parent)) {
      return true
    }

    if (isClassLikeCallExpression(parent, current)) {
      return true
    }

    current = parent
  }

  return false
}
