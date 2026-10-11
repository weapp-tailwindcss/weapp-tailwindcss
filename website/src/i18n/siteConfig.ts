import type { SiteLocale } from './locale'
import { normalizeSiteLocale } from './locale'

const siteConfigCopy = {
  'zh-cn': {
    tagline: 'Bring Tailwind CSS to every platform! 把 Tailwind CSS 的原子化开发体验带到全端！',
    metadata: {
      siteLanguage: 'zh-CN',
      ogLocale: 'zh_CN',
      defaultMetaTitle: 'weapp-tailwindcss | 把 Tailwind CSS 带到全端',
      defaultMetaDescription: 'weapp-tailwindcss 将 Tailwind CSS v4 的精确转译、构建器集成与运行时工具带到 Web、小程序、React Native、Lynx 与跨端框架。',
      themeKeywords: ['weapp', '跨端', 'tailwindcss', '原子类', 'uni-app', 'taro', 'react-native', 'lynx', '原生', 'webpack', 'plugin', 'vite', 'gulp', 'wxss', 'wxml'],
      socialImageAlt: 'weapp-tailwindcss 项目标识',
    },
    geo: {
      region: 'CN',
      placename: '中国',
      position: '35.86166;104.19540',
      icbm: '35.86166, 104.19540',
    },
    navbar: {
      guide: '指南',
      ecosystem: '生态',
      issues: '常见问题',
      showcase: '案例展示',
      migrations: '迁移',
      options: '配置项',
      blog: '博客',
      tailwindTopic: 'Tailwind 专题',
      currentV5: 'v5 当前版本',
      latestV4: 'v4 最新版本',
    },
    footer: {
      docs: '文档',
      guide: '指南',
      options: '配置项',
      issues: '常见问题',
      blog: '博客',
      more: '更多',
      poweredByPrefix: '本站由',
      copyrightLabel: 'Copyright',
    },
    blog: {
      title: 'weapp-tailwindcss 博客',
      description: '沉淀 tailwindcss 在小程序生态中的最佳实践、版本更新与生态动态。',
      feedTitle: 'weapp-tailwindcss 博客订阅',
      feedDescription: 'tailwindcss 在小程序与多端开发中的更新、案例与教程资讯。',
      language: 'zh-CN',
    },
    seo: {
      docSuffix: 'weapp-tailwindcss 文档',
      baseKeywords: ['weapp-tailwindcss', 'tailwindcss', '小程序', '微信小程序', 'uni-app', 'taro', 'mpx'],
      sectionKeywords: {
        quickStart: ['快速开始', '安装', '配置'],
        issues: ['常见问题', '故障排查', '兼容性'],
        api: ['API', '配置项', '接口文档'],
        ai: ['AI 编程', 'LLM', '工作流'],
        blog: ['博客', '最佳实践'],
      },
      breadcrumb: {
        home: '首页',
        docs: '文档',
        blog: '博客',
      },
    },
  },
  'en': {
    tagline: 'Bring Tailwind CSS to every platform! Atomic utility-first development for the entire stack.',
    metadata: {
      siteLanguage: 'en-US',
      ogLocale: 'en_US',
      defaultMetaTitle: 'weapp-tailwindcss | Tailwind CSS for every platform',
      defaultMetaDescription: 'weapp-tailwindcss brings precise Tailwind CSS v4 transforms, builder integrations, and runtime utilities to Web, mini programs, React Native, Lynx, and cross-platform frameworks.',
      themeKeywords: ['weapp', 'cross-platform', 'tailwindcss', 'utility classes', 'uni-app', 'taro', 'react-native', 'lynx', 'native', 'webpack', 'plugin', 'vite', 'gulp', 'wxss', 'wxml'],
      socialImageAlt: 'weapp-tailwindcss project logo',
    },
    geo: {
      region: 'CN',
      placename: 'China',
      position: '35.86166;104.19540',
      icbm: '35.86166, 104.19540',
    },
    navbar: {
      guide: 'Guide',
      ecosystem: 'Ecosystem',
      issues: 'Issues',
      showcase: 'Showcase',
      migrations: 'Migrations',
      options: 'Options',
      blog: 'Blog',
      tailwindTopic: 'Tailwind Topics',
      currentV5: 'Current v5',
      latestV4: 'Latest v4',
    },
    footer: {
      docs: 'Docs',
      guide: 'Guide',
      options: 'Options',
      issues: 'Issues',
      blog: 'Blog',
      more: 'More',
      poweredByPrefix: 'Powered by',
      copyrightLabel: 'Copyright',
    },
    blog: {
      title: 'weapp-tailwindcss Blog',
      description: 'Best practices, release notes, and ecosystem updates for Tailwind CSS in mini app development.',
      feedTitle: 'weapp-tailwindcss Blog Feed',
      feedDescription: 'Updates, case studies, and tutorials about Tailwind CSS across mini apps and multi-platform development.',
      language: 'en-US',
    },
    seo: {
      docSuffix: 'weapp-tailwindcss docs',
      baseKeywords: ['weapp-tailwindcss', 'tailwindcss', 'mini app', 'mini program', 'uni-app', 'taro', 'mpx'],
      sectionKeywords: {
        quickStart: ['quick start', 'install', 'configuration'],
        issues: ['troubleshooting', 'compatibility', 'faq'],
        api: ['API', 'options', 'reference'],
        ai: ['AI coding', 'LLM', 'workflow'],
        blog: ['blog', 'best practices'],
      },
      breadcrumb: {
        home: 'Home',
        docs: 'Docs',
        blog: 'Blog',
      },
    },
  },
} as const

export function getSiteConfigCopy(locale: SiteLocale) {
  return siteConfigCopy[normalizeSiteLocale(locale)]
}
