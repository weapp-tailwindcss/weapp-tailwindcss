export interface DeploymentVerificationOptions {
  canonicalOrigin: string
  siteUrl: URL
}

function parseUrl(rawUrl: string, label: string) {
  const url = new URL(rawUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} 必须使用 http 或 https 协议`)
  }
  return url
}

export function parseDeploymentVerificationOptions(args: string[]): DeploymentVerificationOptions {
  let canonicalOrigin: string | undefined
  let rawSiteUrl: string | undefined

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--') {
      continue
    }
    if (argument === '--canonical-origin') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('--canonical-origin 缺少 URL')
      }
      canonicalOrigin = parseUrl(value, 'canonical origin').origin
      index += 1
      continue
    }
    if (argument.startsWith('--canonical-origin=')) {
      const value = argument.slice('--canonical-origin='.length)
      if (!value) {
        throw new Error('--canonical-origin 缺少 URL')
      }
      canonicalOrigin = parseUrl(value, 'canonical origin').origin
      continue
    }
    if (argument.startsWith('-')) {
      throw new Error(`未知参数：${argument}`)
    }
    if (rawSiteUrl) {
      throw new Error(`只能传入一个待验证站点 URL：${argument}`)
    }
    rawSiteUrl = argument
  }

  if (!rawSiteUrl) {
    throw new Error('请传入待验证的站点 URL')
  }
  const siteUrl = parseUrl(rawSiteUrl, '站点 URL')
  return {
    canonicalOrigin: canonicalOrigin ?? siteUrl.origin,
    siteUrl,
  }
}
