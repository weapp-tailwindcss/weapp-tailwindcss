import { assertWechatLogin, ownedWechatPort, wechatRequest } from './wechat/service'

interface Connection {
  disconnect: () => void
}

export async function closeWechatProject(projectPath: string, connection?: Connection, timeoutMs = 10_000, boundPort?: string) {
  if (!projectPath.trim()) {
    throw new Error('微信 IDE 清理必须指定本次测试的项目路径。')
  }
  try {
    connection?.disconnect()
  }
  finally {
    const port = boundPort ?? ownedWechatPort(projectPath)
    // 认证异常后服务边界拒绝继续请求；只断开连接并保留现场，绝不启动 CLI 或全局退出。
    await assertWechatLogin(port, timeoutMs)
    await wechatRequest(port, { kind: 'close', project: projectPath }, timeoutMs)
    await assertWechatLogin(port, timeoutMs)
  }
}
