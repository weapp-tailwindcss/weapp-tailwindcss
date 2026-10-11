import { escape as escapeClassName } from '@weapp-tailwindcss/escape'

const LONG_BASE = [
  'flex flex-col md:flex-row gap-3 md:gap-4',
  'px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700',
  'rounded-xl shadow-md border border-blue-500/30',
  'grid grid-cols-2 md:grid-cols-4 items-center',
  'dark:text-slate-100 dark:bg-slate-900',
  'ring-2 ring-offset-2 ring-indigo-500',
].join(' ')

const LONG_OVERRIDE = [
  'px-6 py-3 text-base bg-indigo-600 hover:bg-indigo-700',
  'rounded-lg border-indigo-500/40',
  'grid-cols-3 md:grid-cols-6',
  'text-blue-500 md:text-blue-600 hover:underline',
].join(' ')

export interface StaticCase {
  id: string
  title: string
  kind: 'static'
  args: unknown[]
  conflict: boolean
}

export interface FactoryCase {
  id: string
  title: string
  kind: 'factory'
  createArgs: (index: number) => unknown[]
  conflict: boolean
}

export type BenchCase = StaticCase | FactoryCase

export const staticCases: StaticCase[] = [
  {
    id: 'short-no-conflict',
    title: '短 class、无冲突',
    kind: 'static',
    args: ['flex items-center gap-2'],
    conflict: false,
  },
  {
    id: 'last-wins',
    title: 'last-wins 冲突',
    kind: 'static',
    args: ['p-4', 'p-2', 'text-red-500', 'text-blue-500'],
    conflict: true,
  },
  {
    id: 'clsx-object-array',
    title: 'clsx 对象/数组/falsy',
    kind: 'static',
    args: ['foo', undefined, ['bar', { baz: true, nope: false }], false && 'hidden'],
    conflict: false,
  },
  {
    id: 'refinement-padding',
    title: 'padding refinement（p-3 px-5）',
    kind: 'static',
    args: ['p-3', 'px-5'],
    conflict: true,
  },
  {
    id: 'rpx-width',
    title: 'rpx 宽度冲突',
    kind: 'static',
    args: ['w-[10rpx]', 'w-[24rpx]'],
    conflict: true,
  },
  {
    id: 'rpx-text-length',
    title: 'text-[12rpx] 与 text-[24rpx]',
    kind: 'static',
    args: ['text-[12rpx]', 'text-[24rpx]'],
    conflict: true,
  },
  {
    id: 'rpx-text-color-keep',
    title: 'text-red 与 text-[80rpx] 是否同时保留',
    kind: 'static',
    args: ['text-red', 'text-[80rpx]'],
    conflict: true,
  },
  {
    id: 'escaped-modifier',
    title: '已转义 hover modifier',
    kind: 'static',
    args: [escapeClassName('hover:p-2'), escapeClassName('hover:p-4')],
    conflict: true,
  },
  {
    id: 'stacked-modifiers',
    title: '堆叠 modifier',
    kind: 'static',
    args: ['hover:focus:p-2', 'focus:hover:p-4'],
    conflict: true,
  },
  {
    id: 'important-postfix',
    title: 'important 与普通 padding 共存',
    kind: 'static',
    args: ['p-3!', 'p-4!', 'p-5'],
    conflict: true,
  },
  {
    id: 'custom-plus-tailwind',
    title: '自定义类 + utility 冲突',
    kind: 'static',
    args: ['custom-card', 'p-4', 'p-2'],
    conflict: true,
  },
  {
    id: 'arbitrary-variant',
    title: 'arbitrary variant',
    kind: 'static',
    args: ['[&:nth-child(3)]:py-0', '[&:nth-child(3)]:py-4'],
    conflict: true,
  },
  {
    id: 'numeric-leading-escaped',
    title: '已转义 2xl 数字变体',
    kind: 'static',
    args: ['_2xl_cp-2', '_2xl_cp-4'],
    conflict: true,
  },
  {
    id: 'slim-excluded-fill',
    title: 'slim 可能未覆盖的 SVG fill 冲突',
    kind: 'static',
    args: ['fill-red-500', 'fill-blue-500'],
    conflict: true,
  },
  {
    id: 'long-list',
    title: '长 class 列表含冲突',
    kind: 'static',
    args: [LONG_BASE, LONG_OVERRIDE],
    conflict: true,
  },
  {
    id: 'component-call',
    title: '组件最常见调用：cn(base, variant, cond && extra)，参数引用稳定',
    kind: 'static',
    args: ['rounded-md px-4 py-2 text-sm', true && 'bg-primary', true && 'text-white'],
    conflict: true,
  },
  {
    id: 'arbitrary-heavy',
    title: '大量 arbitrary value',
    kind: 'static',
    args: [
      'w-[13px] h-[21px] p-[8px] mt-[3px] text-[15px] bg-[#112233] border-[2px]',
      'w-[26px] text-[18px] bg-[#abcdef] ring-[3px]',
    ],
    conflict: true,
  },
]

const WORKING_SET = Array.from({ length: 64 }, (_, index) => [
  'rounded-md px-4 py-2 text-sm font-medium',
  index % 2 === 0 ? 'bg-primary text-white' : 'bg-secondary text-black',
  index % 3 === 0 ? 'px-6' : 'px-3',
])

export const factoryCases: FactoryCase[] = [
  {
    id: 'cache-hit',
    title: '同一输入重复调用（每次新数组，字符串字面量稳定）',
    kind: 'factory',
    conflict: true,
    createArgs: () => ['p-4 px-2 text-red-500', 'p-2 text-blue-500'],
  },
  {
    id: 'cache-miss',
    title: '每次唯一输入（缓存未命中）',
    kind: 'factory',
    conflict: true,
    createArgs: index => [`p-${index % 12}`, `w-[${index}rpx]`, `text-[${(index % 9) + 12}rpx]`],
  },
  {
    id: 'component-call-fresh',
    title: '同样的组件调用，但每次新建参数数组',
    kind: 'factory',
    conflict: true,
    createArgs: () => ['rounded-md px-4 py-2 text-sm', true && 'bg-primary', true && 'text-white'],
  },
  {
    id: 'working-set',
    title: '64 组稳定参数循环（工作集缓存）',
    kind: 'factory',
    conflict: true,
    createArgs: index => WORKING_SET[index % WORKING_SET.length]!,
  },
]

export const allCases: BenchCase[] = [...staticCases, ...factoryCases]

export function resolveArgs(benchCase: BenchCase, index = 0) {
  return benchCase.kind === 'static' ? benchCase.args : benchCase.createArgs(index)
}
