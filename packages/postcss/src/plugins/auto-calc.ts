import type { Plugin } from 'postcss'
import type { IStyleHandlerOptions } from '../types'
import postcssCalc from '@weapp-tailwindcss/postcss-calc'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import { analyzeCssCalcContext } from '../utils/css-calc-context'
import { getCssCalcVariableReferences, getCssCustomPropertyName } from '../utils/css-custom-property'

/** 自动模式仅适配明确的微信 v4 样式，不影响其他平台或单位。 */
export function isWechatAutoCssCalc(options: Partial<IStyleHandlerOptions>) {
  return options.majorVersion === 4 && options.uniAppX !== true
    && ['mp-weixin', 'weapp', 'wx', 'weixin'].includes(options.platform?.trim().toLowerCase() ?? '')
}

function isRpxLength(value: string) {
  const parsed = valueParser(value).nodes.filter(node => node.type !== 'space' && node.type !== 'comment')
  const dimension = parsed.length === 1 && parsed[0]?.type === 'word' && valueParser.unit(parsed[0].value)
  return dimension && dimension.unit.toLowerCase() === 'rpx' && Number.isFinite(Number(dimension.number))
}

/** 只有调用方已汇总共同消费作用域时才允许推导变量；单文件处理仅归约字面量。 */
export function getAutoCalcPlugin(options: IStyleHandlerOptions): Plugin | null {
  if (!isWechatAutoCssCalc(options)) {
    return null
  }
  return {
    postcssPlugin: 'weapp-auto-rpx-calc',
    Once(root, helpers) {
      const contextValues = options.cssCalcContextComplete
        ? options.cssCalcContextValues
        ?? analyzeCssCalcContext([options.customPropertyContextCss ?? '', root.toString()].join('\n')).customPropertyValues
        : undefined
      const values = new Map<string, string>()
      const cache = new Map<string, string>()
      const reduce = (expression: string) => {
        const cached = cache.get(expression)
        if (cached !== undefined) {
          return cached
        }
        const references = new Map<string, string>()
        for (const [raw, name] of getCssCalcVariableReferences(expression)) {
          const value = values.get(name)
          if (value !== undefined) {
            references.set(raw, value)
          }
        }
        if (references.size === 0 && !/rpx/i.test(expression)) {
          cache.set(expression, expression)
          return expression
        }
        const declaration = postcss.decl({ prop: 'width', value: expression })
        const temporary = postcss.root({ nodes: [declaration] })
        const plugin = postcssCalc({
          customPropertyValues: references,
          includeCustomProperties: [...references.keys()],
          preserve: false,
          precision: false,
        }) as Plugin
        plugin.OnceExit?.(temporary, helpers)
        // 不能顺手简化 px、百分比、混合单位或未知变量表达式。
        const result = isRpxLength(declaration.value) ? declaration.value : expression
        cache.set(expression, result)
        return result
      }
      for (const [name, value] of contextValues ?? []) {
        if (!/rpx/i.test(value)) {
          continue
        }
        // 安全分析已展开别名依赖；自动白名单仍只接受 rpx 长度，不选择标量或其他单位。
        const resolved = /calc\(/i.test(value) ? reduce(value) : value
        if (isRpxLength(resolved)) {
          values.set(name, resolved)
        }
      }
      root.walkDecls((decl) => {
        if (getCssCustomPropertyName(decl.prop) || !/calc\(/i.test(decl.value)) {
          return
        }
        const parsed = valueParser(decl.value)
        parsed.walk((node, index, nodes) => {
          if (node.type !== 'function') {
            return
          }
          if (node.value.toLowerCase() === 'url') {
            return false
          }
          if (node.value.toLowerCase() !== 'calc') {
            return
          }
          const expression = valueParser.stringify(node)
          const result = reduce(expression)
          if (result !== expression) {
            nodes[index] = { type: 'word', value: result, sourceIndex: node.sourceIndex, sourceEndIndex: node.sourceEndIndex }
          }
          // 外层尚未证明可归约时也不改写其中局部算式，保持原始运行时语义。
          return false
        })
        decl.value = parsed.toString()
      })
    },
  }
}
