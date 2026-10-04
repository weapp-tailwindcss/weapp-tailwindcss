import type { IConnectOptions, ILaunchOptions } from '@weapp-vite/miniprogram-automator'
import { setTimeout as delay } from 'node:timers/promises'
import { MiniProgram, Launcher as RawLauncher } from '@weapp-vite/miniprogram-automator'
import { runWithCleanup } from '../e2e-preflight/cleanup'
import { availablePort } from '../e2e-preflight/probes/port'
import { assertWechatLogin, existingWechatService, wechatRequest } from './service'

const guarded = new WeakSet<MiniProgram>()

function protectSession(mini: MiniProgram) {
  if (guarded.has(mini)) {
    return mini
  }
  // Page/Element 与 MiniProgram 共用协议连接，在这一边界拦截，避免通过 tool()/page.send 绕过。
  const wire = (mini as unknown as { connection: { send: (method: string, params?: Record<string, unknown>, options?: { timeout?: number }) => Promise<any> } }).connection
  const send = wire.send.bind(wire)
  wire.send = async (method, params, options) => {
    if (method === 'App.exit' || (method.startsWith('Tool.') && method !== 'Tool.getInfo'
      && method !== 'Tool.compile' && !(method === 'Tool.clearCache' && params?.clean === 'compile' && Object.keys(params).length === 1))) {
      throw new Error(`E2E 禁止改变微信 IDE 登录态或退出 IDE：${method}`)
    }
    return send(method, params, options)
  }
  mini.close = async () => {
    throw new Error('E2E 禁止 MiniProgram.close；请使用 closeWechatProject 仅清理本次项目。')
  }
  guarded.add(mini)
  return mini
}

/** 只连接已有微信 IDE；禁止使用上游 launch 隐式启动 IDE 或改变账号。 */
export class Launcher {
  async connect(options: IConnectOptions): Promise<MiniProgram> {
    const endpoint = new URL(options.wsEndpoint)
    if (options.platform && options.platform !== 'wechat') {
      throw new Error('微信 E2E 只允许 devtools provider。')
    }
    if (endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1') {
      throw new Error('微信 E2E 只允许连接本机已绑定的自动化端口。')
    }
    const mini = await new RawLauncher().connect(options)
    if (!(mini instanceof MiniProgram)) {
      throw new TypeError('未取得微信 DevTools MiniProgram 连接。')
    }
    return protectSession(mini)
  }

  async launch(options: Pick<ILaunchOptions, 'cliPath' | 'projectPath' | 'port' | 'timeout' | 'runtimeProvider'>): Promise<MiniProgram> {
    const allowed = new Set(['cliPath', 'projectPath', 'port', 'timeout', 'runtimeProvider'])
    if (Object.keys(options).some(key => !allowed.has(key)) || (options.runtimeProvider && options.runtimeProvider !== 'devtools')) {
      throw new Error('微信 E2E 不接受账号、票据、自定义 CLI 参数或非 devtools provider。')
    }
    if (!options.projectPath?.trim()) {
      throw new Error('微信 IDE 操作必须指定本次测试的项目路径。')
    }
    const deadline = Date.now() + (options.timeout ?? 30_000)
    const remaining = () => {
      const ms = deadline - Date.now()
      if (ms <= 0) {
        throw new Error('微信 IDE 本轮自动化连接超时；不启动或重启 IDE。')
      }
      return ms
    }
    const service = await existingWechatService(options.cliPath)
    await assertWechatLogin(service.httpPort, remaining())
    const port = options.port ?? await availablePort()
    const result = await wechatRequest(service.httpPort, { kind: 'auto', project: options.projectPath, port }, remaining())
    if (result.autoPort !== port) {
      throw new Error('微信 IDE 自动化端口与本轮请求不一致，拒绝连接旧会话。')
    }
    await assertWechatLogin(service.httpPort, remaining())
    let mini: MiniProgram | undefined
    while (!mini) {
      const timeout = Math.min(3000, remaining())
      try {
        mini = await this.connect({ wsEndpoint: `ws://127.0.0.1:${port}`, timeout })
      }
      catch (error) {
        if (Date.now() >= deadline) {
          throw error
        }
        await delay(Math.min(100, remaining()))
      }
    }
    try {
      await mini.waitForAppReady(remaining())
      remaining()
      return mini
    }
    catch (error) {
      return runWithCleanup(() => Promise.reject(error), () => mini.disconnect())
    }
  }
}
