export const functionalValueProfiles = [
  { id: 'named', description: '默认主题与静态关键字', values: ['0', '4', 'sm', 'red-500'] },
  { id: 'number', description: '整数、小数、零与超出补全范围的合法数值', values: ['0', '0.5', '17', '20000'] },
  { id: 'fraction', description: '比例值与分母边界', values: ['1/2', '2/3', '7/12'] },
  { id: 'negative', description: '支持负数的显式 root', values: ['-1', '-0.5', '-[17px]'] },
  { id: 'length', description: '绝对、相对、视口、小程序单位', values: ['[17px]', '[1.25rem]', '[3em]', '[10vw]', '[48rpx]'] },
  { id: 'percentage', description: '百分比与大于百分之百的值', values: ['[0%]', '[37.5%]', '[125%]'] },
  { id: 'color', description: '命名、十六进制、函数和透明度', values: ['red-500', '[#123456]', '[rgb(12,34,56)]', 'red-500/23', 'black/[.35]'] },
  { id: 'angle', description: '角度与旋转单位', values: ['[17deg]', '[.25turn]'] },
  { id: 'time', description: '毫秒与秒', values: ['[125ms]', '[.25s]'] },
  { id: 'image', description: 'URL、线性与径向渐变', values: ['[url("/probe.svg")]', '[linear-gradient(red,blue)]', '[radial-gradient(circle,red,blue)]'] },
  { id: 'position', description: '位置和多值的下划线编码', values: ['[25%_75%]', '[left_top]'] },
  { id: 'string', description: '内容、空串、空白和转义下划线', values: ['["hello_world"]', '[""]', '["hello\\_world"]'] },
  { id: 'variable', description: 'var() 与括号简写', values: ['[var(--probe)]', '(--probe)', '(length:--probe)'] },
  { id: 'typed', description: '同 root 不同 CSS 数据类型', values: ['[length:22px]', '[color:var(--brand)]', '[number:650]'] },
  { id: 'math', description: '嵌套 CSS 数学表达式', values: ['[calc(100%-1rem)]', '[min(10px,2vw)]', '[max(1rem,20px)]', '[clamp(1rem,2vw,3rem)]'] },
  { id: 'modifier', description: '命名与任意修饰符', values: ['/50', '/23', '/[.35]', '/tight', '/[1.625]'] },
] as const

export type FunctionalValueProfileId = typeof functionalValueProfiles[number]['id']

export const arbitrarySyntaxCases = [
  { id: 'property', candidate: '[mask-type:luminance]' },
  { id: 'custom-property', candidate: '[--probe:17px]' },
  { id: 'variable-short', candidate: 'w-(--probe)' },
  { id: 'typed-variable', candidate: 'text-(color:--brand)' },
  { id: 'variable-color-weight', candidate: 'bg-sky-500/(--my-alpha-value)' },
  { id: 'important-before', candidate: '!p-4' },
  { id: 'important-after', candidate: 'p-4!' },
  { id: 'negative-important', candidate: '-mt-[7.5px]!' },
  { id: 'arbitrary-selector', candidate: '[&>span]:text-red-500' },
  { id: 'arbitrary-at-rule', candidate: '[@media(min-width:500px)]:p-4' },
  { id: 'named-group', candidate: 'group-hover/card:block' },
  { id: 'named-peer', candidate: 'peer-checked/choice:opacity-50' },
  { id: 'stacked-variants', candidate: 'md:dark:hover:bg-red-500/50' },
  { id: 'container-query', candidate: '@sm:w-4' },
] as const
