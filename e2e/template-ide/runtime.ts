import type { MiniProgram } from '@weapp-vite/miniprogram-automator'

export async function assertTemplatePageRendered(miniProgram: Pick<MiniProgram, 'reLaunch'>, pageUrl: string) {
  const page = await miniProgram.reLaunch(pageUrl)
  if (!page) {
    throw new Error(`模板未进入页面：${pageUrl}`)
  }
  // SDK 将 query 与页面路由分开；只允许单个前导斜线的等价写法。
  const requestedRoute = pageUrl.replace(/^\//, '').replace(/\?.*$/, '')
  if (!requestedRoute || typeof page.path !== 'string' || page.path.replace(/^\//, '') !== requestedRoute) {
    throw new Error(`模板页面路由不匹配：预期 ${pageUrl}，实际 ${page.path}`)
  }
  const selector = '.min-h-screen'
  const componentSelectors = ['comp']
  const deadline = Date.now() + 15_000
  // 公开的渲染查询直接使用 App-Service 协议，避免旧 Page 查询消耗渲染预算。
  while (true) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      break
    }
    const nodes = await page.renderedNodes(selector, { componentSelectors, timeout: Math.min(5000, remaining) })
    if (Date.now() >= deadline) {
      break
    }
    if (Array.isArray(nodes) && nodes.some(node =>
      typeof node?.width === 'number' && Number.isFinite(node.width) && node.width > 0
      && typeof node?.height === 'number' && Number.isFinite(node.height) && node.height > 0,
    )) {
      return nodes
    }
    const delay = Math.min(220, deadline - Date.now())
    if (delay <= 0) {
      break
    }
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  throw new Error(`模板页面未产生渲染内容：${pageUrl}（15秒渲染预算耗尽）`)
}
