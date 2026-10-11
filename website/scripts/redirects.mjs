import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { seoLocales, websiteRoot } from './seo-locales.mjs'
import { readMatterFile, toDocRoute, walkMarkdownFiles } from './seo-shared.mjs'

export const legacyDocRedirects = [
  ['/docs/community/typography', '/docs/tailwindcss/best-practices'],
  ['/docs/issues/v1', '/docs/issues'],
  ['/docs/migrations/v1', '/docs/migrations/v5'],
  ['/docs/migrations/v2', '/docs/migrations/v5'],
  ['/docs/principle', '/docs/tailwindcss/tailwind-core'],
  ['/docs/quick-start/build-or-import-outside-components', '/docs/quick-start/install'],
  ['/docs/quick-start/frameworks/uni-app', '/docs/quick-start/frameworks/uni-app-vite'],
  ['/docs/quick-start/v2', '/docs/quick-start/install'],
  ['/docs/quick-start/v4', '/docs/quick-start/v4/tutorial'],
  ['/docs/quick-start/v4/native', '/docs/quick-start/frameworks/native'],
  ['/docs/quick-start/v4/taro', '/docs/quick-start/frameworks/taro'],
  ['/docs/quick-start/v4/uni-app', '/docs/quick-start/frameworks/uni-app-vite'],
  ['/docs/quick-start/v4/uni-app-x', '/docs/quick-start/frameworks/uni-app-x'],
  ['/docs/uni-app-x', '/docs/quick-start/frameworks/uni-app-x'],
  ['/docs/uni-app-x/install', '/docs/quick-start/frameworks/uni-app-x'],
  ['/docs/quick-start/unocss', '/docs/tailwindcss/unocss-compatibility'],
  ['/docs/releases/v2', '/docs/migrations/v5'],
  ['/docs/tailwindcss-maintenance-book', '/docs/tailwindcss'],
  ['/docs/upgrade/uni-app', '/docs/quick-start/frameworks/uni-app-vite'],
]

export function createRedirectRules() {
  return [
    ...legacyDocRedirects.flatMap(([source, destination]) => [
      [source, destination, 301],
      [`/zh-cn${source}`, `/zh-cn${destination}`, 301],
    ]),
    ['/en/*', '/:splat', 301],
  ]
}

export function getCurrentDocRoutes() {
  return new Set(seoLocales.flatMap(locale => walkMarkdownFiles(locale.docsRoot).map((file) => {
    const relative = path.relative(locale.docsRoot, file)
    const { parsed } = readMatterFile(file)
    return `${locale.routePrefix}${toDocRoute(relative, parsed.data.slug)}`
  })))
}

export function validateRedirectRules(rules = createRedirectRules()) {
  const routes = getCurrentDocRoutes()
  const missing = rules
    .filter(([source]) => source !== '/en/*')
    .map(([, destination]) => destination)
    .filter(destination => !routes.has(destination))
  if (missing.length > 0) {
    throw new Error(`重定向目标不存在：${[...new Set(missing)].join(', ')}`)
  }
}

export function writeRedirects() {
  const rules = createRedirectRules()
  validateRedirectRules(rules)
  const outputFile = path.join(websiteRoot, 'static', '_redirects')
  const next = `${rules.map(rule => rule.join(' ')).join('\n')}\n`
  const previous = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8') : ''
  if (previous !== next) {
    fs.writeFileSync(outputFile, next)
    return true
  }
  return false
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changed = writeRedirects()
  console.log(`Workers redirects generated${changed ? '' : ' (unchanged)'}`)
}
