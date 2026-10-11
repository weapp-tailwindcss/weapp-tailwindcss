import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

export function issue1144IdentityPlugin(projectRoot) {
  return {
    name: 'issue-1144-server-identity',
    configureServer(server) {
      // 身份在服务启动时固定，不能让旧服务在请求时读取新一轮标识。
      const sessionFile = resolve(projectRoot, '.hbuilderx-acceptance.json')
      const session = existsSync(sessionFile) ? JSON.parse(readFileSync(sessionFile, 'utf8')) : {}
      const identity = { root: realpathSync(projectRoot), runId: session.runId, instanceId: randomUUID(), startedAt: Date.now(), ideVersion: process.env.HX_Version }
      if (identity.runId) {
        console.log(`[wt-acceptance] ${identity.runId}`)
        // GUI 不输出 CLI 的版本行，只记录 IDE 实际注入的元数据，缺失时不猜测。
        console.log(`[wt-ide-version] ${identity.runId} ${identity.ideVersion || 'unavailable'}`)
      }
      let completed = false
      server.middlewares.use('/__issue1144_identity', (request, response) => {
        const url = new URL(request.url, 'http://localhost')
        if (identity.runId && url.searchParams.get('complete') === identity.runId && !completed) {
          completed = true
          console.log(`[wt-acceptance-complete] ${identity.runId}`)
        }
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        response.end(JSON.stringify(identity))
      })
    },
  }
}
