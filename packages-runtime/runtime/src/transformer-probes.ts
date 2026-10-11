import { MappingChars2String } from '@weapp-tailwindcss/escape'

type Transformer = (value: string) => string
type Probe = (value: string) => boolean

const probes = new WeakMap<Transformer, Probe>()
const unescapePattern = /u[0-9a-f]{3,}/i
const escapeNeedles = Object.keys(MappingChars2String).filter(Boolean)

/** 仅为已知默认转换器登记可证明安全的跳过条件，不改变公开类型。 */
export function registerTransformProbe(transform: Transformer, direction: 'escape' | 'unescape' | 'identity') {
  probes.set(transform, direction === 'identity'
    ? () => false
    : direction === 'unescape'
      ? value => value.includes('_') || unescapePattern.test(value)
      : value => escapeNeedles.some(needle => value.includes(needle)))
}

/** 自定义转换器没有探针时必须执行，不能用默认映射推断其行为。 */
export function needsTransform(transform: Transformer, value: string) {
  return probes.get(transform)?.(value) ?? true
}
