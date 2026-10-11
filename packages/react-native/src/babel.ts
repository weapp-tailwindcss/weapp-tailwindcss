/* eslint-disable style/max-statements-per-line */

import type { NodePath, PluginObject, PluginPass } from '@babel/core'
import * as t from '@babel/types'

export interface WeappReactNativeBabelOptions {
  classNameSet?: Iterable<string> | undefined
  /** Metro 生成的 token -> StyleSheet ID lookup。 */
  staticStyleMap?: Record<string, string[]> | undefined
  runtimeModule?: string | undefined
}

interface PluginState extends PluginPass {
  opts: WeappReactNativeBabelOptions
  runtimeIdentifiers?: { tw?: t.Identifier, static?: t.Identifier, compose?: t.Identifier }
  virtualImported?: boolean
}

function classTokens(value: string) {
  return value.split(/\s+/).filter(Boolean)
}

function ensureRuntimeIdentifier(program: NodePath<t.Program>, state: PluginState, kind: 'tw' | 'static' | 'compose') {
  const identifiers = state.runtimeIdentifiers ??= {}
  if (identifiers[kind]) { return identifiers[kind] }
  const moduleName = state.opts.runtimeModule ?? '@weapp-tailwindcss/react-native/runtime'
  const local = program.scope.generateUidIdentifier(kind === 'static' ? 'twStatic' : kind === 'compose' ? 'twCompose' : 'tw')
  identifiers[kind] = local
  if (!state.virtualImported) {
    program.unshiftContainer('body', t.importDeclaration([], t.stringLiteral('@weapp-tailwindcss/react-native/virtual')))
    state.virtualImported = true
  }
  program.unshiftContainer('body', t.importDeclaration([
    t.importSpecifier(local, t.identifier(kind === 'static' ? 'getStaticStyle' : kind === 'compose' ? 'composeStyle' : 'tw')),
  ], t.stringLiteral(moduleName)))
  return local
}

function shouldSkipFile(filename: string | undefined) {
  if (!filename) { return false }
  const normalized = filename.replaceAll('\\', '/')
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase()
  return normalized.includes('/node_modules/')
    || /^(?:react|react-native)(?:[.-]|$)/.test(basename)
}

function hasKnownStaticTokens(value: string, classNameSet: Set<string> | undefined) {
  if (!classNameSet) { return false }
  return classTokens(value).every(token => classNameSet.has(token))
}

function findStyleAttribute(attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[]) {
  return attributes.find((attribute): attribute is t.JSXAttribute => t.isJSXAttribute(attribute) && attribute.name.name === 'style')
}

function styleExpression(attribute: t.JSXAttribute | undefined) {
  if (!attribute) { return undefined }
  const value = attribute.value
  if (!value) { return undefined }
  if (t.isJSXExpressionContainer(value)) {
    return t.isJSXEmptyExpression(value.expression) ? undefined : value.expression as t.Expression
  }
  if (t.isStringLiteral(value)) { return value }
  return undefined
}

function composeExpression(program: NodePath<t.Program>, state: PluginState, tailwind: t.Expression, inline: t.Expression | undefined) {
  if (!inline) { return tailwind }
  return t.callExpression(ensureRuntimeIdentifier(program, state, 'compose'), [tailwind, inline])
}

function staticStyleExpression(program: NodePath<t.Program>, state: PluginState, value: string) {
  const ids = classTokens(value).flatMap(token => state.opts.staticStyleMap?.[token] ?? [token])
  const staticIdentifier = ensureRuntimeIdentifier(program, state, 'static')
  return t.callExpression(staticIdentifier, [t.arrayExpression(ids.map(id => t.stringLiteral(id)))])
}

function dynamicStyleExpression(program: NodePath<t.Program>, state: PluginState, value: t.Expression) {
  return t.callExpression(ensureRuntimeIdentifier(program, state, 'tw'), [value])
}

function applyStyleAttribute(opening: NodePath<t.JSXOpeningElement>, expression: t.Expression) {
  const existing = opening.node.attributes.find(attribute => t.isJSXAttribute(attribute) && attribute.name.name === 'style')
  if (existing && t.isJSXAttribute(existing)) {
    existing.value = t.jsxExpressionContainer(expression)
    return
  }
  opening.node.attributes.push(t.jsxAttribute(t.jsxIdentifier('style'), t.jsxExpressionContainer(expression)))
}

function propertyName(node: t.ObjectProperty) {
  if (t.isIdentifier(node.key) && !node.computed) { return node.key.name }
  if (t.isStringLiteral(node.key)) { return node.key.value }
  return undefined
}

function applyCreateElementProps(props: t.ObjectExpression, program: NodePath<t.Program>, state: PluginState) {
  const classProperty = props.properties.find(property => t.isObjectProperty(property) && propertyName(property) === 'className')
  if (!classProperty || !t.isObjectProperty(classProperty)) { return }
  const value = classProperty.value
  const classSet = state.opts.classNameSet ? new Set(state.opts.classNameSet) : undefined
  const styleProperty = props.properties.find(property => t.isObjectProperty(property) && propertyName(property) === 'style')
  const inline = styleProperty && t.isObjectProperty(styleProperty) ? styleProperty.value as t.Expression : undefined
  let style: t.Expression
  if (t.isStringLiteral(value)) {
    if (!hasKnownStaticTokens(value.value, classSet)) { return }
    style = composeExpression(program, state, staticStyleExpression(program, state, value.value), inline)
  }
  else if (t.isExpression(value)) {
    style = composeExpression(program, state, dynamicStyleExpression(program, state, value), inline)
  }
  else { return }
  if (styleProperty && t.isObjectProperty(styleProperty)) { styleProperty.value = style }
  else { props.properties.push(t.objectProperty(t.identifier('style'), style)) }
  props.properties = props.properties.filter(property => property !== classProperty)
}

export default function weappReactNativeBabel(): PluginObject<PluginState> {
  return {
    name: 'weapp-tailwindcss-react-native',
    visitor: {
      JSXOpeningElement(path, state) {
        if (shouldSkipFile(state.filename)) { return }
        const program = path.findParent(parent => parent.isProgram())
        if (!program?.isProgram()) { return }
        const classAttribute = path.node.attributes.find(attribute => t.isJSXAttribute(attribute) && attribute.name.name === 'className')
        if (!classAttribute || !t.isJSXAttribute(classAttribute)) { return }
        if (t.isStringLiteral(classAttribute.value)) {
          if (!hasKnownStaticTokens(classAttribute.value.value, state.opts.classNameSet ? new Set(state.opts.classNameSet) : undefined)) { return }
          const style = composeExpression(program, state, staticStyleExpression(program, state, classAttribute.value.value), styleExpression(findStyleAttribute(path.node.attributes)))
          applyStyleAttribute(path, style)
          path.node.attributes = path.node.attributes.filter(attribute => attribute !== classAttribute)
          return
        }
        if (t.isJSXExpressionContainer(classAttribute.value) && classAttribute.value.expression) {
          const existing = findStyleAttribute(path.node.attributes)
          const style = composeExpression(program, state, dynamicStyleExpression(program, state, classAttribute.value.expression as t.Expression), styleExpression(existing))
          applyStyleAttribute(path, style)
          path.node.attributes = path.node.attributes.filter(attribute => attribute !== classAttribute)
        }
      },
      CallExpression(path, state) {
        if (shouldSkipFile(state.filename)) { return }
        const callee = path.node.callee
        const isCreateElement = t.isMemberExpression(callee)
          && !callee.computed
          && t.isIdentifier(callee.object, { name: 'React' })
          && t.isIdentifier(callee.property, { name: 'createElement' })
        if (!isCreateElement || !t.isObjectExpression(path.node.arguments[1])) { return }
        const program = path.findParent(parent => parent.isProgram())
        if (program?.isProgram()) { applyCreateElementProps(path.node.arguments[1], program, state) }
      },
    },
  }
}
