import type { DeploymentTarget } from '../config/deploymentTarget'

function hasNoindex(value: string) {
  return value.toLowerCase().split(/[\s,]+/).some(token => token === 'noindex' || token === 'none')
}

export function verifyIndexingHeaders(headers: Headers, target: DeploymentTarget, pathname: string) {
  const noindex = hasNoindex(headers.get('x-robots-tag') ?? '')
  if (noindex !== (target === 'next')) {
    throw new Error(`${pathname} X-Robots-Tag 与 ${target} 索引策略不匹配`)
  }
}

export function verifyIndexingHtml(html: string, target: DeploymentTarget, pathname: string) {
  const robots = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w-]+)=["']([^"']*)["']/g)].map(([, key, value]) => [key.toLowerCase(), value])))
    .filter(attributes => /^(?:robots|googlebot)$/i.test(attributes.name ?? ''))
  const noindex = robots.some(attributes => hasNoindex(attributes.content ?? ''))
  if (noindex !== (target === 'next')) {
    throw new Error(`${pathname} robots meta 与 ${target} 索引策略不匹配`)
  }
}

export function verifyRobotsPolicy(robots: string, target: DeploymentTarget, canonicalOrigin: string) {
  const lines = robots.split(/\r?\n/).map(line => line.replace(/#.*/, '').trim())
  const disallowAll = lines.some(line => /^disallow:\s*\/$/i.test(line))
  if (target === 'next') {
    if (!lines.some(line => /^user-agent:\s*\*$/i.test(line)) || !disallowAll
      || lines.some(line => /^(?:allow|sitemap):/i.test(line))) {
      throw new Error('next robots.txt 必须禁止所有爬虫且不发布 sitemap')
    }
    return
  }
  if (disallowAll || !lines.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`)
    || !lines.includes(`Sitemap: ${canonicalOrigin}/zh-cn/sitemap.xml`)) {
    throw new Error('production robots.txt 必须允许索引并声明双语 canonical sitemap')
  }
}
