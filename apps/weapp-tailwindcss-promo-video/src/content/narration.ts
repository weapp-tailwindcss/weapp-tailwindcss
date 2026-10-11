import type { Format, Locale, Narration, SceneId } from '../config'

type Script = Partial<Record<SceneId, Narration>>
export const narration: Record<Locale, Record<Format, Script>> = {
  zh: {
    landscape: {
      intro: { captions: ['Tailwind，不止 Web。'] },
      craft: { captions: ['用熟悉的 class，', '控制间距、圆角和色彩。'] },
      pipeline: { captions: ['生成样式，转译类名，', '再按目标端适配。'] },
      platforms: { captions: ['覆盖 Web、小程序和 App WebView，', '接入 uni-app x、React Native，', '还有 Lynx。'], spoken: '覆盖 Web、小程序和 App Web View，接入 uni app x、React Native，还有 Lynx。' },
      ecosystem: { captions: ['支持 Tailwind CSS 4，', '接入熟悉的框架和构建工具。'], spoken: '支持 Tailwind CSS 四，接入熟悉的框架和构建工具。' },
      setup: { captions: ['以 Vite 的 Web 项目为例，', '安装依赖，引入 CSS 入口，', '注册插件，开始构建。'] },
      tools: { captions: ['CLI 支持独立构建和监听，', '运行时工具管理类名合并，', '以及组件变体。'] },
      cta: { captions: ['选你的框架，开始构建。', '文档就在官网。'] },
    },
    portrait: {
      intro: { captions: ['不止 Web。'] },
      craft: { captions: ['写熟悉的 class，', '控制间距、圆角和色彩。'] },
      platforms: { captions: ['从 Web、小程序，', '到 React Native 和 Lynx，', '按目标端生成样式。'] },
      ecosystem: { captions: ['Tailwind CSS 4，', '接入熟悉的框架生态。'], spoken: 'Tailwind CSS 四，接入熟悉的框架生态。' },
      setup: { captions: ['安装，配置，开始构建。'] },
      cta: { captions: ['选你的框架，', '打开官网，开始构建。'] },
    },
  },
  en: {
    landscape: {
      intro: { captions: ['Tailwind beyond the web.'] },
      craft: { captions: ['Use familiar classes', 'to shape spacing, corners, and color.'] },
      pipeline: { captions: ['Generate styles, transform classes,', 'adapt to each target.'] },
      platforms: { captions: ['Build for the web, mini programs,', 'and app WebViews.', 'Reach native ecosystems with uni-app x,', 'React Native, and Lynx.'], spoken: 'Build for the web, mini programs, and app WebViews. Reach native ecosystems with uni app x, React Native, and Lynx.' },
      ecosystem: { captions: ['Built for Tailwind CSS 4.', 'Connect your framework', 'and your build tools.'] },
      setup: { captions: ['For a Vite web project,', 'install the packages,', 'import your CSS entry,', 'then register the plugin.', 'Choose the guide for your target.'] },
      tools: { captions: ['Build CSS and watch for changes.', 'Merge classes and manage', 'component variants.'] },
      cta: { captions: ['Pick your framework.', 'Start building.'] },
    },
    portrait: {
      intro: { captions: ['Beyond the web.'] },
      craft: { captions: ['Control spacing, corners, and color.'] },
      platforms: { captions: ['From web and mini programs', 'to React Native and Lynx.', 'Generate styles for each target.'] },
      ecosystem: { captions: ['Tailwind CSS 4.', 'Connect your favorite framework', 'and build tools.'] },
      setup: { captions: ['Install, configure, build.'] },
      cta: { captions: ['Open the docs.', 'Start building.'] },
    },
  },
}
export function scriptFor(locale: Locale, format: Format, id: SceneId): Narration {
  const script = narration[locale][format][id]
  if (!script) {
    throw new Error(`缺少旁白：${locale}/${format}/${id}`)
  }
  return script
}

export const motionMarkers: Record<Locale, Record<Format, Partial<Record<SceneId, string[]>>>> = {
  zh: {
    landscape: { craft: ['圆角', '色彩'], setup: ['引入', '注册'] },
    portrait: { craft: ['圆角', '色彩'], setup: ['配置', '开始'] },
  },
  en: {
    landscape: { craft: ['corners', 'color'], setup: ['import', 'register'] },
    portrait: { craft: ['corners', 'color'], setup: ['configure', 'build'] },
  },
}
