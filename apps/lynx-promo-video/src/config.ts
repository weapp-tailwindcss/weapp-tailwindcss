import evidenceJson from './generated/evidence.json'

export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 2250,
} as const

export const COLORS = {
  background: '#0b0f10',
  surface: '#121819',
  surfaceRaised: '#182022',
  border: '#2a3538',
  text: '#edf4f1',
  muted: '#91a0a5',
  green: '#07c160',
  blue: '#0ea5e9',
} as const

export const DOCS_URL_ZH = 'https://tw.weapp.dev/zh-cn/docs/quick-start/frameworks/lynx'
export const DOCS_URL_EN = 'https://tw.weapp.dev/docs/quick-start/frameworks/lynx'
export const DOCS_URL = DOCS_URL_ZH

export const scenes = [
  { id: 'hook', from: 0, duration: 150 },
  { id: 'config', from: 150, duration: 240 },
  { id: 'classname', from: 390, duration: 900 },
  { id: 'pipeline', from: 1290, duration: 180 },
  { id: 'native', from: 1470, duration: 360 },
  { id: 'evidence', from: 1830, duration: 270 },
  { id: 'cta', from: 2100, duration: 150 },
] as const

export type SceneId = typeof scenes[number]['id']
export type PromoLocale = 'zh' | 'en'

export interface EvidenceSummary {
  total: number
  supported: number
  unsupported: number
  platformDifferences: number
  verifiedAt: string
  versions: {
    tailwindcss: string
    lynxEngine: string
  }
}

export interface PromoCopy {
  locale: PromoLocale
  docsUrl: string
  title: string
  narration: Record<SceneId, string>
  hook: {
    eyebrow: string
    title: string[]
  }
  config: {
    eyebrow: string
    title: string
    note: string
  }
  classname: {
    eyebrow: string
    title: string
    runtimeNote: string
    jsxNote: string
  }
  pipeline: {
    eyebrow: string
    title: string
    note: string
  }
  native: {
    eyebrow: string
    title: string[]
    note: string
  }
  evidence: {
    eyebrow: string
    title: string[]
    note: string
    cards: Array<{ label: string, detail: string }>
  }
  cta: {
    title: string[]
  }
}

const chineseCopy: PromoCopy = {
  locale: 'zh',
  docsUrl: DOCS_URL_ZH,
  title: 'Tailwind CSS 4，进入 Lynx 原生应用',
  hook: {
    eyebrow: 'Tailwind CSS 4',
    title: ['Tailwind CSS 4', '进入 Lynx 原生应用'],
  },
  config: {
    eyebrow: '一个 Rspeedy 插件',
    title: '打开真实项目，从配置开始',
    note: 'ReactLynx + Rspeedy + Tailwind CSS 4',
  },
  classname: {
    eyebrow: '真实开发实录',
    title: '改代码，构建，看原生结果',
    runtimeNote: '间距与圆角 → 背景色',
    jsxNote: '构建等待已压缩',
  },
  pipeline: {
    eyebrow: '构建阶段完成转换',
    title: 'CSS 留在构建图里',
    note: 'Theme 变量在构建期静态化，应用动态变量保持不变。',
  },
  native: {
    eyebrow: '真实原生运行',
    title: ['同一套组件代码', '两个原生目标'],
    note: '最终样式与滚动画面，来自同一份 ReactLynx bundle。',
  },
  evidence: {
    eyebrow: '兼容性实验室',
    title: ['个代表用例', '逐层留下证据'],
    note: '支持项与限制项都来自已提交的双端报告',
    cards: [
      { label: '生成', detail: 'PostCSS' },
      { label: '打包', detail: 'Encoder' },
      { label: '运行时', detail: 'iOS + Android' },
    ],
  },
  cta: {
    title: ['开始构建你的', 'Lynx 原生界面'],
  },
  narration: {
    hook: '在 Lynx 里，也可以直接写 Tailwind CSS。',
    config: '@weapp-tailwindcss/lynx，把 Tailwind CSS 4 接入 ReactLynx 和 Rspeedy。',
    classname: '在真实编辑器里修改状态卡。先调整间距和圆角。保存并构建，查看原生结果。再修改背景色，重新构建并查看变化。',
    pipeline: '样式在构建时生成 CSS，进入 Lynx 原生 bundle。',
    native: '同一套组件代码，在 iOS 和 Android 上真实运行。',
    evidence: '从生成、编码到双端运行，支持边界都有真实证据。',
    cta: '打开 Lynx 接入文档，开始构建。',
  },
}

const englishCopy: PromoCopy = {
  locale: 'en',
  docsUrl: DOCS_URL_EN,
  title: 'Tailwind CSS 4 in native Lynx apps',
  hook: {
    eyebrow: 'Tailwind CSS 4',
    title: ['Tailwind CSS 4', 'in native Lynx apps'],
  },
  config: {
    eyebrow: 'One Rspeedy plugin',
    title: 'Start in a real project',
    note: 'ReactLynx + Rspeedy + Tailwind CSS 4',
  },
  classname: {
    eyebrow: 'Recorded development',
    title: 'Edit, build, see the native result',
    runtimeNote: 'Spacing and radius → background color',
    jsxNote: 'Build waits condensed',
  },
  pipeline: {
    eyebrow: 'Build-time transformation',
    title: 'CSS stays in the build graph',
    note: 'Theme variables are static at build time; dynamic app variables remain dynamic.',
  },
  native: {
    eyebrow: 'Real native runtime',
    title: ['One component codebase', 'Two native targets'],
    note: 'The final styles and scrolling are recorded from the same ReactLynx bundle.',
  },
  evidence: {
    eyebrow: 'Compatibility lab',
    title: ['representative cases', 'Evidence at every layer'],
    note: 'Supported and limited cases come from submitted reports for both platforms.',
    cards: [
      { label: 'Generated', detail: 'PostCSS' },
      { label: 'Bundled', detail: 'Encoder' },
      { label: 'Runtime', detail: 'iOS + Android' },
    ],
  },
  cta: {
    title: ['Build your', 'native Lynx UI'],
  },
  narration: {
    hook: 'You can write Tailwind CSS directly in Lynx.',
    config: '@weapp-tailwindcss/lynx brings Tailwind CSS 4 to ReactLynx and Rspeedy.',
    classname: 'Here is the real editor. First, change the spacing and corner radius. Save, build, and check the native result. Then change the background color and build again. Every change you see comes from the actual component.',
    pipeline: 'Styles become CSS at build time and enter the native bundle.',
    native: 'The same component code runs natively on iOS and Android.',
    evidence: 'From generation and encoding to native runtime, every boundary has evidence.',
    cta: 'Open the Lynx integration docs and start building.',
  },
}

export const promoCopies: Record<PromoLocale, PromoCopy> = {
  zh: chineseCopy,
  en: englishCopy,
}

export function getPromoCopy(locale: PromoLocale) {
  return promoCopies[locale]
}

export interface LynxPromoProps extends Record<string, unknown> {
  locale: PromoLocale
  copy: PromoCopy
  title: string
  packageName: string
  docsUrl: string
  accentGreen: string
  accentBlue: string
  evidence: EvidenceSummary
}

export const defaultPromoProps: LynxPromoProps = {
  locale: 'zh',
  copy: chineseCopy,
  title: chineseCopy.title,
  packageName: '@weapp-tailwindcss/lynx',
  docsUrl: DOCS_URL_ZH,
  accentGreen: COLORS.green,
  accentBlue: COLORS.blue,
  evidence: evidenceJson,
}

export function promoPropsForLocale(locale: PromoLocale): LynxPromoProps {
  const copy = getPromoCopy(locale)
  return {
    ...defaultPromoProps,
    locale,
    copy,
    title: copy.title,
    docsUrl: copy.docsUrl,
  }
}

export function sceneAtFrame(frame: number, locale: PromoLocale = 'zh') {
  const scene = scenes.find(scene => frame >= scene.from && frame < scene.from + scene.duration)
  return scene ? { ...scene, subtitle: getPromoCopy(locale).narration[scene.id] } : undefined
}
