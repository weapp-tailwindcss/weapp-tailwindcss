import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('PR 汇总门禁的取消生命周期', () => {
  for (const [filename, jobName] of [['pr-gate.yml', 'pr-gate'], ['demo-matrix.yml', 'gate']] as const) {
    it.each(['success', 'failure', 'skipped', 'cancelled'])(`${filename}/${jobName} 在 %s 依赖状态下仅在工作流取消时退出`, (status) => {
      const workflow = YAML.parse(fs.readFileSync(path.join(repoRoot, '.github', 'workflows', filename), 'utf8'))
      const condition = workflow.jobs[jobName].if as string
      // 显式状态函数使依赖失败或跳过时仍能执行汇总，不能退回默认 success 门槛。
      expect(condition).toMatch(/\b(?:always|success|failure|cancelled)\(\)/)
      const shouldRun = runInNewContext(condition, {
        always: () => true,
        success: () => status === 'success',
        failure: () => status === 'failure',
        cancelled: () => status === 'cancelled',
      })
      expect(shouldRun).toBe(status !== 'cancelled')
    })
  }
})
