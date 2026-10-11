import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

// 在保留原失败客户端的情况下，只读探测宿主是否仍能服务其他 CLI 请求。
assert.ok(process.env.HBUILDERX_CLI_PATH)
assert.ok(process.env.E2E_HBUILDERX_DIAGNOSTIC_DIR)
const results = []
for (const args of [['listhost'], ['version'], ['project', 'list']]) {
  const startedAt = Date.now()
  const result = spawnSync(process.env.HBUILDERX_CLI_PATH, args, {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  })
  results.push({
    args,
    pid: result.pid,
    status: result.status,
    signal: result.signal,
    error: result.error?.code,
    elapsedMs: Date.now() - startedAt,
    stdout: result.stdout,
    stderr: result.stderr,
  })
}
writeFileSync(path.join(process.env.E2E_HBUILDERX_DIAGNOSTIC_DIR, 'cli-health.json'), JSON.stringify(results, null, 2))
