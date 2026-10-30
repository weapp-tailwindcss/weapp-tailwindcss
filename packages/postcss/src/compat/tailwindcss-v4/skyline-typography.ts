import type { Declaration, Root, Rule } from 'postcss'
import type { IStyleHandlerOptions } from '../../types'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { decodeCssIdentifier, getCssAtRulePrelude, getCssCustomPropertyName, isCssPropertyRegistration } from '../../utils/css-custom-property'
import { PREFLIGHT_RESET_PROPS } from '../mini-program-css/predicates'

const TYPOGRAPHY_PROPERTIES = new Set(['--tw-leading', '--tw-font-weight'])
export const SKYLINE_INVALID_RESET_PROPERTY = '--weapp-tw-invalid-reset'
const RESET_VALUE = `var(${SKYLINE_INVALID_RESET_PROPERTY})`

export class SkylineTypographyError extends Error {
  readonly code = 'WEAPP_SKYLINE_TYPOGRAPHY'
  constructor(message: string) {
    super(message)
    this.name = 'SkylineTypographyError'
  }
}

/** 错误码跨打包副本保持稳定，最终资产阶段不得吞掉契约错误。 */
export function isSkylineTypographyError(error: unknown): error is SkylineTypographyError {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'WEAPP_SKYLINE_TYPOGRAPHY'
}

/** 仅在调用方已确认小程序 v4 目标时启用，避免在保留注册的情况下改变变量计算。 */
export function resolveSkylineTypographyCompatibility(
  options: Pick<IStyleHandlerOptions, 'cssOptions' | 'cssRemoveProperty' | 'platform' | 'atRules'>,
  miniProgramV4: boolean,
) {
  if (!miniProgramV4 || options.cssOptions?.skyline !== true) {
    return false
  }
  const platform = options.cssOptions?.platform ?? options.platform
  if (platform && !['weapp', 'wechat', 'mp-weixin', 'mini-program'].includes(platform)) {
    return false
  }
  if ((options.cssOptions?.cssRemoveProperty ?? options.cssRemoveProperty) === false
    || (options.cssOptions?.atRules ?? options.atRules)?.property === false) {
    throw new SkylineTypographyError('cssOptions.skyline 不能与 cssRemoveProperty: false 或保留 @property 的配置同时启用')
  }
  return true
}

/** 未定义的内部变量使重置在计算时无效，不引入循环，也不删除消费者的 fallback。 */
export function getSkylineTypographyResetValue(property: string) {
  const name = getCssCustomPropertyName(property)
  return name && TYPOGRAPHY_PROPERTIES.has(name) ? RESET_VALUE : undefined
}

/** 由框架编译器作为组件自己的首个样式块消费，不能注册或定义内部变量。 */
export function createSkylineTypographyResetCss(selector: string | string[] = ['view', 'text']) {
  return postcss.rule({
    selector: Array.isArray(selector) ? selector.join(',') : selector,
    nodes: [...TYPOGRAPHY_PROPERTIES].map(prop => postcss.decl({ prop, value: RESET_VALUE })),
  }).toString()
}

/** 初始化只作用于标签及其 Vue scoped 限定，不把任意作者选择器作为 preflight。 */
function isSkylineTypographyResetScope(rule: Rule) {
  try {
    return selectorParser().astSync(rule.selector).nodes.every(selector => selector.nodes.length > 0 && selector.nodes.every(node =>
      node.type === 'tag' || node.type === 'universal'
      || (node.type === 'attribute' && node.attribute.startsWith('data-v-'))
      || (node.type === 'class' && node.value.startsWith('data-v-'))
      || (node.type === 'pseudo' && [':before', ':after', '::before', '::after'].includes(node.value)),
    ))
  }
  catch {
    return false
  }
}

function isResetDeclaration(node: postcss.ChildNode): node is Declaration {
  return node.type === 'decl' && getSkylineTypographyResetValue(node.prop) !== undefined && node.value.trim() === RESET_VALUE
}

/** 独立初始化可包含工厂按需生成的单个变量。 */
export function isSkylineTypographyResetRule(rule: Rule) {
  const nodes = rule.nodes.filter(node => node.type !== 'comment')
  return nodes.length > 0 && nodes.every(isResetDeclaration)
}

/** 覆盖清理可以删除视觉 preflight，运行时 reset 必须留在组件本地。 */
export function retainSkylineTypographyResets(rule: Rule) {
  if (!rule.nodes.some(isResetDeclaration)) {
    return false
  }
  // 自定义初始化范围也必须保留；只有已知标签 preflight 才可清理视觉默认值。
  if (!isSkylineTypographyResetScope(rule)) {
    return true
  }
  for (const node of [...rule.nodes]) {
    if (node.type === 'decl' && PREFLIGHT_RESET_PROPS.has(node.prop)) {
      node.remove()
    }
  }
  return true
}

/** 已保留的 reset 不能随相同的条件祖先一起被覆盖去重删除。 */
export function containsSkylineTypographyReset(container: postcss.Container) {
  let found = false
  container.walkRules((rule) => {
    if (rule.nodes.some(isResetDeclaration)) {
      found = true
    }
  })
  return found
}

/** 在任何删除注册或默认规则的步骤之前检查，避免跨资产声明悄悄改变 reset 语义。 */
export function assertSkylineTypographyInput(root: Root) {
  root.walkDecls((decl) => {
    if (getCssCustomPropertyName(decl.prop) === SKYLINE_INVALID_RESET_PROPERTY) {
      throw new SkylineTypographyError(`${SKYLINE_INVALID_RESET_PROPERTY} 是 Skyline 兼容保留变量，不能声明`)
    }
  })
  root.walkAtRules((rule) => {
    const prelude = getCssAtRulePrelude(rule)
    if (prelude.name.toLowerCase() === 'property'
      && getCssCustomPropertyName(prelude.params) === SKYLINE_INVALID_RESET_PROPERTY) {
      throw new SkylineTypographyError(`${SKYLINE_INVALID_RESET_PROPERTY} 是 Skyline 兼容保留变量，不能注册`)
    }
  })
}

/** 产物校验只读取已有资产内容，不依赖文件名、目录或来源扫描。 */
export function assertSkylineTypographyCss(css: string) {
  assertSkylineTypographyInput(postcss.parse(css))
}

/** 只改纯 initial；作者空值是有效值，不得据此推断为插件初始化。 */
export function normalizeSkylineTypographyReset(decl: Declaration) {
  const value = getSkylineTypographyResetValue(decl.prop)
  if (!value || isCssPropertyRegistration(decl) || decodeCssIdentifier(decl.value)?.toLowerCase() !== 'initial') {
    return false
  }
  decl.value = value
  return true
}

/** 兼容启用时按 CSS 身份移除注册，确保采用未注册变量的无效值语义。 */
export function removeSkylineTypographyRegistrations(root: Root) {
  root.walkAtRules((atRule) => {
    if (getCssAtRulePrelude(atRule).name.toLowerCase() === 'property') {
      atRule.remove()
    }
  })
}
