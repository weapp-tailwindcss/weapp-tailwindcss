export type CanonicalTemplateKind = 'web' | 'mini-program'

export interface CanonicalTemplateCase {
  name: string
  template: string
  kind: CanonicalTemplateKind
  framework: string
  builder: string
  target: string
  cssEntry: string
  buildCommand: string[]
  outputDir: string
  requiredFiles: string[]
  snapshotFiles?: string[]
  styleTargets: string[]
  textTargets: string[]
  source: 'templates' | 'starter'
}

export const CANONICAL_TEMPLATE_CASES = [
  {
    name: 'uni-app-tailwindcss-v4 mp-weixin',
    template: 'uni-app-tailwindcss-v4',
    kind: 'mini-program',
    framework: 'uni-app',
    builder: 'vite',
    target: 'mp-weixin',
    cssEntry: 'src/main.css',
    buildCommand: ['run', 'build:mp-weixin'],
    outputDir: 'dist/build/mp-weixin',
    requiredFiles: [
      'dist/build/mp-weixin/app.js',
      'dist/build/mp-weixin/app.json',
      'dist/build/mp-weixin/app.wxss',
      'dist/build/mp-weixin/pages/index/index.wxml',
      'dist/build/mp-weixin/pages/index/index.json',
    ],
    styleTargets: ['dist/build/mp-weixin/app.wxss', 'dist/build/mp-weixin/common'],
    textTargets: ['dist/build/mp-weixin/pages/index/index.wxml'],
    source: 'templates',
  },
  {
    name: 'taro-vite-tailwindcss-v4 weapp',
    template: 'taro-vite-tailwindcss-v4',
    kind: 'mini-program',
    framework: 'taro-react',
    builder: 'vite',
    target: 'weapp',
    cssEntry: 'src/app.css',
    buildCommand: ['run', 'build:weapp'],
    outputDir: 'dist',
    requiredFiles: [
      'dist/app.js',
      'dist/app.json',
      'dist/app.wxss',
      'dist/pages/index/index.wxml',
      'dist/pages/index/index.json',
    ],
    styleTargets: ['dist/app.wxss', 'dist/app-origin.wxss'],
    textTargets: ['dist/pages/index/index.wxml', 'dist/pages/index/index.js'],
    source: 'templates',
  },
  {
    name: 'weapp-vite-tailwindcss-v4 weixin',
    template: 'weapp-vite-tailwindcss-v4',
    kind: 'mini-program',
    framework: 'native',
    builder: 'weapp-vite',
    target: 'weapp',
    cssEntry: 'app.css',
    buildCommand: ['run', 'build'],
    outputDir: 'dist',
    requiredFiles: [
      'dist/app.js',
      'dist/app.json',
      'dist/app.wxss',
      'dist/pages/index/index.wxml',
      'dist/pages/index/index.json',
    ],
    snapshotFiles: ['app.json', 'app.wxss', 'pages/index/index.json', 'pages/index/index.wxml'],
    styleTargets: ['dist/app.wxss'],
    textTargets: ['dist/pages/index/index.wxml'],
    source: 'templates',
  },
] as const satisfies readonly CanonicalTemplateCase[]
