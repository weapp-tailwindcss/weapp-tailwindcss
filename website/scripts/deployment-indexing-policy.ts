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

interface RobotsRule {
  directive: 'allow' | 'disallow'
  value: string
}

function parseRobotsPolicy(robots: string) {
  const groups: Array<{ agents: string[], rules: RobotsRule[] }> = []
  const sitemaps = new Set<string>()
  let group: (typeof groups)[number] | undefined
  for (const line of robots.split(/\r\n|\r|\n/)) {
    const match = /^([^:#]+):([^#]*)/.exec(line)
    if (!match) {
      continue
    }
    const directive = match[1].trim().toLowerCase()
    const value = match[2].trim()
    if (directive === 'sitemap') {
      sitemaps.add(value)
    }
    else if (directive === 'user-agent' && value) {
      if (!group || group.rules.length > 0) {
        group = { agents: [], rules: [] }
        groups.push(group)
      }
      group.agents.push(value.toLowerCase())
    }
    else if (group && (directive === 'allow' || directive === 'disallow')) {
      group.rules.push({ directive, value })
    }
  }
  const agents = new Map<string, RobotsRule[]>()
  for (const { agents: names, rules } of groups) {
    for (const name of names) {
      agents.set(name, [...(agents.get(name) ?? []), ...rules])
    }
  }
  return { agents, sitemaps }
}

function allowsRoot(rules: RobotsRule[]) {
  // 部署策略只判断根路由；具名爬虫使用自己的组，不继承通配组。
  let specificity = 0
  let allowed = true
  for (const rule of rules) {
    if (!/^(?:\**\/\**|\*+)\$?$/.test(rule.value)) {
      continue
    }
    if (rule.value.length > specificity) {
      specificity = rule.value.length
      allowed = rule.directive === 'allow'
    }
    else if (rule.value.length === specificity && rule.directive === 'allow') {
      allowed = true
    }
  }
  return allowed
}

export function verifyRobotsPolicy(robots: string, target: DeploymentTarget, canonicalOrigin: string) {
  const { agents, sitemaps } = parseRobotsPolicy(robots)
  const defaults = agents.get('*') ?? []
  if (target === 'next') {
    // 同名组必须合并，不能让后面的 Disallow 掩盖边缘服务注入的 Allow。
    const blocksEveryAgent = agents.has('*') && [...agents.values()].every(rules => rules.some(rule => rule.directive === 'disallow' && rule.value === '/')
      && !rules.some(rule => rule.directive === 'allow' && rule.value))
    if (!blocksEveryAgent || sitemaps.size > 0) {
      throw new Error('next robots.txt 必须禁止所有爬虫且不发布 sitemap')
    }
    return
  }
  if (!allowsRoot(defaults) || !sitemaps.has(`${canonicalOrigin}/sitemap.xml`)
    || !sitemaps.has(`${canonicalOrigin}/zh-cn/sitemap.xml`)) {
    throw new Error('production robots.txt 必须允许索引并声明双语 canonical sitemap')
  }
}
