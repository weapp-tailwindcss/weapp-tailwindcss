export const FPS = 30
export const DOCS_URL = 'https://tw.weapp.dev'
export const FORMATS = ['landscape', 'portrait'] as const
export const LOCALES = ['zh', 'en'] as const
export type Format = typeof FORMATS[number]
export type Locale = typeof LOCALES[number]
export type SceneId = 'intro' | 'craft' | 'pipeline' | 'platforms' | 'ecosystem' | 'setup' | 'tools' | 'cta'
export interface Scene { id: SceneId, from: number, duration: number, offset: number }
export interface Film { id: string, width: number, height: number, seconds: number, scenes: Scene[] }
export interface Narration { captions: string[], spoken?: string }

export const films: Record<Format, Film> = {
  landscape: {
    id: 'WeappPromoLandscape',
    width: 1920,
    height: 1080,
    seconds: 60,
    scenes: [
      { id: 'intro', from: 0, duration: 3, offset: 0.1 },
      { id: 'craft', from: 3, duration: 6, offset: 0.12 },
      { id: 'pipeline', from: 9, duration: 6, offset: 0.12 },
      { id: 'platforms', from: 15, duration: 12, offset: 0.15 },
      { id: 'ecosystem', from: 27, duration: 8, offset: 0.12 },
      { id: 'setup', from: 35, duration: 11, offset: 0.15 },
      { id: 'tools', from: 46, duration: 9, offset: 0.12 },
      { id: 'cta', from: 55, duration: 5, offset: 0.12 },
    ],
  },
  portrait: {
    id: 'WeappPromoPortrait',
    width: 1080,
    height: 1920,
    seconds: 30,
    scenes: [
      { id: 'intro', from: 0, duration: 2, offset: 0.05 },
      { id: 'craft', from: 2, duration: 5, offset: 0.1 },
      { id: 'platforms', from: 7, duration: 9, offset: 0.12 },
      { id: 'ecosystem', from: 16, duration: 6, offset: 0.1 },
      { id: 'setup', from: 22, duration: 4, offset: 0.08 },
      { id: 'cta', from: 26, duration: 4, offset: 0.08 },
    ],
  },
}
export const voices = {
  zh: { name: 'zh-CN-XiaoxiaoNeural', rate: '+8%' },
  en: { name: 'en-US-JennyNeural', rate: '+4%' },
} as const
export const C = { background: '#040D1A', surface: '#0A1B2B', blue: '#0EA5E9', green: '#07C160', ice: '#B6EBFF', text: '#F0F7FF', muted: '#91AABE', line: '#224052' } as const
export const SAFE = {
  landscape: { left: 104, right: 104, top: 64, bottom: 72, captionTop: 945 },
  portrait: { left: 80, right: 180, top: 180, bottom: 300, captionTop: 1460 },
} as const
export function getFormat(value: string | undefined): Format {
  if (value === 'landscape' || value === 'portrait') {
    return value
  }
  throw new Error(`未知画幅：${value}`)
}
export function getLocale(value: string | undefined): Locale {
  if (value === 'zh' || value === 'en') {
    return value
  }
  throw new Error(`未知语言：${value}`)
}
export function compositionId(format: Format, locale: Locale) {
  return `${films[format].id}${locale === 'en' ? 'En' : ''}`
}
export function sceneAtFrame(format: Format, frame: number) {
  return films[format].scenes.find(scene => frame >= scene.from * FPS && frame < (scene.from + scene.duration) * FPS)
}
