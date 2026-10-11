import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
export const websiteRoot = path.resolve(currentDir, '..')

export const seoLocales = [
  {
    id: 'en',
    language: 'en-US',
    routePrefix: '',
    docsRoot: path.join(websiteRoot, 'i18n', 'en', 'docusaurus-plugin-content-docs', 'current'),
    blogRoot: path.join(websiteRoot, 'i18n', 'en', 'docusaurus-plugin-content-blog'),
    sourcePrefix: 'i18n/en',
    staticRoot: path.join(websiteRoot, 'static', 'en'),
  },
  {
    id: 'zh-cn',
    language: 'zh-CN',
    routePrefix: '/zh-cn',
    docsRoot: path.join(websiteRoot, 'docs'),
    blogRoot: path.join(websiteRoot, 'blog'),
    sourcePrefix: '',
    staticRoot: path.join(websiteRoot, 'static'),
  },
]

export function getSeoLocale(locale) {
  const config = seoLocales.find(item => item.id === locale)
  if (!config) {
    throw new Error(`不支持的站点语言：${locale}`)
  }
  return config
}
