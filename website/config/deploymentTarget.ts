export const deploymentOrigins = {
  production: 'https://tw.weapp.dev',
  next: 'https://next.tw.weapp.dev',
} as const

export type DeploymentTarget = keyof typeof deploymentOrigins

/** 只有正式主域构建可以被索引或加载统计。 */
export function isProductionSite(siteUrl: string) {
  return new URL(siteUrl).origin === deploymentOrigins.production
}
