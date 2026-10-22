import { transformLynxCssCompat } from '../src/compat/lynx-css'
import { transformWebCssCompat } from '../src/compat/web-css'

const transforms = [
  ['Web', (css: string) => transformWebCssCompat(css, true)],
  ['Lynx', transformLynxCssCompat],
  ['组合', (css: string) => transformLynxCssCompat(transformWebCssCompat(css, true))],
] as const
const resetNames = ['--tw-gradient-position', '--tw-gradient-stops', '--tw-gradient-via-stops', '--tw-leading', '--tw-font-weight', '--tw-tracking']

describe.each(transforms)('%s 作者变量语义', (_name, transform) => {
  it.each(resetNames)('未注册的 %s initial 仍应阻断继承', (property) => {
    const css = `:root { ${property}: 12px; } *, ::before, ::after { ${property}: initial; } .probe { width: var(${property}, 24px); }`
    expect(transform(css)).toContain(`${property}: initial`)
  })

  it('已知无初值注册也不能删除作者的显式 reset', () => {
    const css = '@property --tw-leading { syntax: "*"; inherits: false; } :root { --tw-leading: 12px; } *, ::before, ::after { --tw-leading: initial; } .probe { width: var(--tw-leading, 24px); }'
    expect(transform(css)).toContain('--tw-leading: initial')
  })

  it.each(['in oklab', 'to bottom right in oklab', 'from 20deg in oklab'])('非渐变消费保持 %s', (value) => {
    expect(transform(`.probe { --tw-gradient-position: ${value}; font-family: var(--tw-gradient-position); }`)).toContain(`--tw-gradient-position: ${value}`)
  })

  it('多级别名的任一非渐变消费阻止改写', () => {
    const css = '.probe { --tw-gradient-position: in oklab; --first: var(--tw-gradient-position); --second: var(--first); background-image: linear-gradient(var(--second), red, blue); font-family: var(--first); }'
    expect(transform(css)).toContain('--tw-gradient-position: in oklab')
  })

  it('未被当前产物消费的独立 chunk 不能推测用途', () => {
    expect(transform('.probe { --tw-gradient-position: in oklab; }')).toContain('--tw-gradient-position: in oklab')
  })
})

const position = '.probe { --tw-gradient-position: in oklab; }'
const linear = '.probe { background-image: linear-gradient(var(--tw-gradient-position), red, blue); }'
const preserveCases = [
  ['转义函数的非渐变消费者', String.raw`.probe { font-family: \76 ar(--tw-gradient-position); }`],
  ['同一声明重复安全与非安全消费', String.raw`.probe { background-image: linear-gradient(var(--tw-gradient-position), red, blue), \76 ar(--tw-gradient-position); }`],
  ['容器参数中的消费', '@container style(--choice: var(--tw-gradient-position)) { .other { color: red; } }'],
  ['容器直接读取属性', '@container style(--tw-gradient-position: in oklab) { .other { color: red; } }'],
  ['容器布尔查询与转义属性', String.raw`@container style((--tw-gradient-\70 osition) and (--other: first)) { .other { color: red; } }`],
  ['声明 if 直接读取属性', '.probe { color: if(style(--tw-gradient-position: in oklab): red; else: blue); }'],
  ['注册描述符消费', '@property --author { syntax: "*"; inherits: false; initial-value: var(--tw-gradient-position); }'],
  ['未展开 import', '@import "external.css";'],
  ['悬空别名', '.probe { --unused: var(--tw-gradient-position); }'],
  ['循环别名', '.probe { --first: var(--tw-gradient-position, var(--second)); --second: var(--first); }'],
  ['未知同名注册', '@property --tw-gradient-position { syntax: "<custom-ident>"; inherits: true; initial-value: first; }'],
  ['非透明别名注册', '@property --alias { syntax: "<custom-ident>"; inherits: false; initial-value: first; } .probe { --alias: var(--tw-gradient-position); background: linear-gradient(var(--alias), red, blue); }'],
  ['非透明函数包装', '.probe { background: linear-gradient(calc(var(--tw-gradient-position)), red, blue); }'],
] as const

describe('渐变只按完整消费链降级', () => {
  it.each(['-webkit-linear-gradient', '-webkit-repeating-linear-gradient', '-moz-linear-gradient', '-o-linear-gradient'])('%s 与标准函数的共同消费仍可删除明确位置的插值', (kind) => {
    const css = `.probe { --tw-gradient-position: -65deg in oklab; --stops: var(--tw-gradient-position), red, blue; background-image: ${kind}(var(--stops)); background-image: linear-gradient(var(--stops)); }`
    const output = transformWebCssCompat(css, true)
    expect(output).toContain('--tw-gradient-position: -65deg;')
    expect(output).not.toContain('in oklab')
    expect(output).toContain(`${kind}(var(--stops))`)
    expect(transformWebCssCompat(output, true)).toBe(output)
  })

  it.each(['-webkit-radial-gradient', '-webkit-repeating-radial-gradient', '-moz-radial-gradient', '-o-radial-gradient'])('%s 保留已有定位，仅删除插值', (kind) => {
    const css = `.probe { --tw-gradient-position: at 50% 75% in oklab; --stops: var(--tw-gradient-position), red, blue; background-image: ${kind}(var(--stops)); background-image: radial-gradient(var(--stops)); }`
    const output = transformWebCssCompat(css, true)
    expect(output).toContain('--tw-gradient-position: at 50% 75%;')
    expect(output).not.toContain('in oklab')
  })

  it('前缀函数的位置语法不同，不为共享空位置选择标准函数默认值', () => {
    const css = `${position}.probe { background-image: -webkit-linear-gradient(var(--tw-gradient-position), red, blue); background-image: linear-gradient(var(--tw-gradient-position), red, blue); }`
    expect(transformWebCssCompat(css, true)).toContain('--tw-gradient-position: in oklab')
  })

  it('未知前缀或非渐变消费者继续阻断明确位置改写', () => {
    const css = '.probe { --tw-gradient-position: -65deg in oklab; background-image: linear-gradient(var(--tw-gradient-position), red, blue); }'
    for (const extra of ['.other { background-image: -unknown-linear-gradient(var(--tw-gradient-position), red, blue); }', '.other { font-family: var(--tw-gradient-position); }']) {
      expect(transformWebCssCompat(`${css}${extra}`, true)).toContain('--tw-gradient-position: -65deg in oklab')
    }
  })

  it.each(preserveCases)('%s 保留作者 token', (_name, extra) => {
    expect(transformWebCssCompat(`${position}${linear}${extra}`, true)).toContain('--tw-gradient-position: in oklab')
  })

  it.each([
    ['linear', 'to bottom'],
    ['radial', 'at center'],
    ['conic', 'from 0deg'],
  ])('%s 的完整透明消费链使用对应默认位置', (kind, expected) => {
    const css = `${position}.probe { --first: var(--tw-gradient-position); --second: var(--first); background-image: ${kind}-gradient(var(--second), red, blue); }`
    const output = transformWebCssCompat(css, true)
    expect(output).toContain(`--tw-gradient-position: ${expected}`)
    expect(transformWebCssCompat(output, true)).toBe(output)
  })

  it('完整渐变 alias 保留函数上下文', () => {
    const css = `${position}.probe { --image: linear-gradient(var(--tw-gradient-position), red, blue); background-image: var(--image); }`
    expect(transformWebCssCompat(css, true)).toContain('--tw-gradient-position: to bottom')
  })

  it('转义函数和变量身份可用于确定的渐变消费', () => {
    const css = String.raw`.probe { --tw-gradient-position: in oklab; background-image: \6c inear-gradient(\76 ar(--tw-gradient-\70 osition), red, blue); }`
    expect(transformWebCssCompat(css, true)).toContain('--tw-gradient-position: to bottom')
  })

  it('多类型空位置不能由声明所在规则推断最终级联', () => {
    const css = `${position}.a { --tw-gradient-position: in oklab; background-image: radial-gradient(var(--stops)); } .b { background-image: linear-gradient(var(--stops)); } .from { --stops: var(--tw-gradient-position), red, blue; }`
    const output = transformWebCssCompat(css, true)
    expect(output).toContain('--tw-gradient-position: in oklab')
    expect(output).not.toContain('--tw-gradient-position: at center')
    expect(output).not.toContain('--tw-gradient-position: to bottom')
  })

  it('长链和 diamond 共用依赖不会被误判为循环', () => {
    const aliases = Array.from({ length: 1000 }, (_, index) => `--alias-${index}: var(${index ? `--alias-${index - 1}` : '--tw-gradient-position'});`).join('')
    const css = `${position}.probe { ${aliases} --left: var(--alias-999); --right: var(--alias-999); background-image: linear-gradient(var(--left), var(--right), red, blue); }`
    expect(transformWebCssCompat(css, true)).toContain('--tw-gradient-position: to bottom')
  })
})
