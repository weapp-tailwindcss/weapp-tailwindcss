import process from 'node:process'

/** 预检与临时 IDE 项目共用授权 AppID，避免游客项目在自动化启动时被拒绝。 */
export function resolveWechatAppId(env: NodeJS.ProcessEnv = process.env) {
  const preflight = env['E2E_PREFLIGHT_WECHAT_APPID']
  const template = env['E2E_TEMPLATE_IDE_APP_ID']
  if (preflight !== undefined && template !== undefined && preflight !== template) {
    throw new Error('微信 AppID 配置冲突：E2E_PREFLIGHT_WECHAT_APPID 与 E2E_TEMPLATE_IDE_APP_ID 必须相同。')
  }
  const appId = preflight ?? template ?? 'wx6ffee4673b257014'
  if (!/^wx[\da-f]{16}$/i.test(appId)) {
    throw new Error('E2E_PREFLIGHT_WECHAT_APPID / E2E_TEMPLATE_IDE_APP_ID 必须是有效的小程序 AppID，不能使用游客项目。')
  }
  return appId
}

/** 后续阶段只能消费本轮实际验证过的 AppID，不能用默认值补齐旧报告。 */
export function assertWechatAppIdBinding(appid: string | undefined, env: NodeJS.ProcessEnv = process.env) {
  const selected = resolveWechatAppId(env)
  if (!appid) {
    throw new Error('预检缺少已验证的微信 AppID 绑定；必须重新 prepare。')
  }
  if (appid !== selected) {
    throw new Error(`微信 AppID 与本轮预检绑定不一致：已验证 ${appid}，当前 ${selected}；必须重新 prepare。`)
  }
  return appid
}
