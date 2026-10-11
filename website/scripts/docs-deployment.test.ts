import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import YAML from 'yaml'
import { isLatestProductionCommit, requireCloudflareCredentials } from '../../scripts/deploy-docs-gate'

const workflow = YAML.parse(readFileSync(fileURLToPath(new URL('../../.github/workflows/docs.yml', import.meta.url)), 'utf8'))
const sha = 'a'.repeat(40)
const context = {
  GITHUB_REPOSITORY: 'weapp-tailwindcss/weapp-tailwindcss',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_SHA: sha,
}

interface Step {
  'name': string
  'id'?: string
  'if'?: string
  'run'?: string
  'env'?: Record<string, string>
  'continue-on-error'?: boolean
}

describe('生产文档部署工作流', () => {
  it('仅由 main 推送或手动触发，不开放 PR 部署', () => {
    expect(workflow.on.push?.branches).toEqual(['main'])
    expect(workflow.on).toHaveProperty('workflow_dispatch')
    expect(workflow.on).not.toHaveProperty('pull_request')
    expect(workflow.on).not.toHaveProperty('pull_request_target')
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.concurrency).toEqual({ 'group': 'docs-worker-production', 'cancel-in-progress': false })
  })

  it('质量门禁成功后才检查最新提交并上传，密钥只进入上传步骤', () => {
    const job = workflow.jobs['deploy-production']
    expect(job.if).toBe('github.repository == \'weapp-tailwindcss/weapp-tailwindcss\' && github.ref == \'refs/heads/main\' && (github.event_name == \'push\' || github.event_name == \'workflow_dispatch\')')
    expect(job.env.SITE_URL).toBe('https://tw.weapp.dev')
    expect(workflow.env).toBeUndefined()
    expect(Object.keys(job.env)).not.toContain('CLOUDFLARE_API_TOKEN')
    const steps: Step[] = job.steps
    const deployIndex = steps.findIndex(step => step.id === 'deploy')
    const latestIndex = steps.findIndex(step => step.id === 'latest')
    expect(latestIndex).toBe(deployIndex - 1)
    for (const command of ['check:docs-audience', 'seo:few-keywords', ' build', 'seo:quality:strict', 'test:worker', 'deploy:worker:dry-run']) {
      const index = steps.findIndex(step => step.run?.includes(command))
      expect(index).toBeGreaterThan(-1)
      expect(index).toBeLessThan(latestIndex)
    }
    for (const step of steps.slice(0, deployIndex)) {
      expect(step.if).toBeUndefined()
      expect(step['continue-on-error']).toBeUndefined()
    }
    expect(steps[deployIndex].if).toBe('steps.latest.outputs.deploy == \'true\'')
    expect(steps[deployIndex]['continue-on-error']).toBeUndefined()
    expect(steps[deployIndex].run).toMatch(/--credentials[\s\S]*deployments list[\s\S]*pnpm deploy:docs:worker/)
    expect(steps.filter(step => step.env?.CLOUDFLARE_API_TOKEN)).toEqual([steps[deployIndex]])
    expect(steps[deployIndex].env).toEqual({
      CLOUDFLARE_ACCOUNT_ID: '$' + '{{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
      CLOUDFLARE_API_TOKEN: '$' + '{{ secrets.CLOUDFLARE_API_TOKEN }}',
    })
    const verification = steps[deployIndex + 1]
    expect(verification.if).toBe('steps.deploy.outcome == \'success\'')
    expect(verification.run).toContain('verify:deployment -- https://tw.weapp.dev')
    expect(verification['continue-on-error']).toBeUndefined()
    expect(steps.map(step => step.run ?? '').join('\n')).not.toMatch(/deploy:worker:next|build:next|--env next/)
  })
})

describe('生产部署执行门禁', () => {
  it.each(['push', 'workflow_dispatch'])('允许 %s 的最新 main', async (event) => {
    await expect(isLatestProductionCommit({ ...context, GITHUB_EVENT_NAME: event }, async () => sha)).resolves.toBe(true)
  })

  it.each([
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_EVENT_NAME: 'pull_request_target' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_REF: 'refs/tags/main' },
    { GITHUB_REPOSITORY: 'fork/weapp-tailwindcss' },
  ])('拒绝非生产上下文 %j，且不读取远端', async (override) => {
    const readLatest = vi.fn()
    await expect(isLatestProductionCommit({ ...context, ...override }, readLatest)).rejects.toThrow('仅允许')
    expect(readLatest).not.toHaveBeenCalled()
  })

  it('旧提交跳过上传', async () => {
    await expect(isLatestProductionCommit(context, async () => 'b'.repeat(40))).resolves.toBe(false)
  })

  it('远端读取失败或 SHA 无效时停止，不能按最新提交放行', async () => {
    await expect(isLatestProductionCommit(context, async () => '')).rejects.toThrow('远端 main SHA')
    await expect(isLatestProductionCommit(context, async () => {
      throw new Error('network failed')
    })).rejects.toThrow('network failed')
    await expect(isLatestProductionCommit({ ...context, GITHUB_SHA: '' }, async () => sha)).rejects.toThrow('GITHUB_SHA')
  })

  it.each(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'])('缺少 %s 时不能回退本地认证', (missing) => {
    const env = { CLOUDFLARE_ACCOUNT_ID: 'account-fixture', CLOUDFLARE_API_TOKEN: 'token-fixture', [missing]: ' ' }
    expect(() => requireCloudflareCredentials(env)).toThrow(`缺少 ${missing}`)
    expect(() => requireCloudflareCredentials(env)).not.toThrow('token-fixture')
  })

  it('两项凭据齐备时通过非空检查', () => {
    expect(() => requireCloudflareCredentials({ CLOUDFLARE_ACCOUNT_ID: 'account-fixture', CLOUDFLARE_API_TOKEN: 'token-fixture' })).not.toThrow()
  })
})
