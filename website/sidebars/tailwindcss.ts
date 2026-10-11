import type { SidebarConfig } from './types'

const tailwindcssSidebar: SidebarConfig = [
  {
    type: 'doc',
    id: 'tailwindcss/index',
    label: '[总览] 专题导览',
  },
  {
    type: 'category',
    label: '[演进] 样式方案与组件库演进',
    collapsed: false,
    link: { type: 'doc', id: 'tailwindcss/history/history-style-evolution' },
    items: [
      'tailwindcss/css-origin-evolution',
      'tailwindcss/history/history-component-evolution',
      {
        type: 'category',
        label: '[基础] Raw CSS / BEM / OOCSS',
        collapsed: false,
        link: { type: 'doc', id: 'tailwindcss/history/history-raw-css' },
        items: [
          'tailwindcss/bem-and-oocss',
        ],
      },
      'tailwindcss/history/history-preprocessors',
      'tailwindcss/postcss',
      'tailwindcss/history/history-css-modules',
      'tailwindcss/history/history-css-in-js',
      'tailwindcss/history/history-utility-first',
      'tailwindcss/history/history-headless-tokens',
      'tailwindcss/history/history-future-generative-css',
    ],
  },
  {
    type: 'category',
    label: '[核心] Tailwind 设计、生态与对比',
    collapsed: false,
    link: { type: 'doc', id: 'tailwindcss/tailwind-core' },
    items: [
      'tailwindcss/tailwind-vs-unocss',
      'tailwindcss/merge-and-variants',
      'tailwindcss/shadcn-ui',
    ],
  },
  {
    type: 'category',
    label: '[工程] 约束、隔离与落地边界',
    collapsed: false,
    items: [
      {
        type: 'category',
        label: 'Tailwind CSS 4 默认模式',
        collapsed: true,
        items: [
          {
            type: 'doc',
            id: 'tailwindcss/v4-reference',
            label: '默认 v4 模式参考',
          },
          {
            type: 'doc',
            id: 'quick-start/v4/tutorial/index',
          },
          {
            type: 'doc',
            id: 'quick-start/v4/tutorial/workflow',
          },
          {
            type: 'doc',
            id: 'quick-start/v4/tutorial/advanced',
          },
        ],
      },
      'tailwindcss/best-practices',
      {
        type: 'doc',
        id: 'tailwindcss/unocss-compatibility',
        label: 'UnoCSS 写法兼容',
      },
      {
        type: 'doc',
        id: 'quick-start/independent-pkg',
        label: '分包 Tailwind 入口隔离',
      },
      'tailwindcss/v5-official-plugin-parity',
      'tailwindcss/style-isolation',
    ],
  },
  {
    type: 'category',
    label: '[实验] AI 工作流与对照实验',
    collapsed: false,
    items: [
      'tailwindcss/ai-friendly-and-demos',
      'tailwindcss/demos',
    ],
  },
]

export default tailwindcssSidebar
