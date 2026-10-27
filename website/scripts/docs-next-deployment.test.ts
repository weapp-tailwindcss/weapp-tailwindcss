import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

function readWorkflow(name: string) {
  return YAML.parse(readFileSync(fileURLToPath(new URL(`../../.github/workflows/${name}`, import.meta.url)), 'utf8'))
}
const production = readWorkflow('docs.yml')
const next = readWorkflow('docs-next.yml')

interface Step {
  'id'?: string
  'if'?: string
  'run'?: string
  'env'?: Record<string, string>
  'continue-on-error'?: boolean
}

describe('固定 next 文档部署', () => {
  it('main 推送和手动触发，使用独立串行队列', () => {
    expect(next.on).toEqual(production.on)
    expect(next.permissions).toEqual({ contents: 'read' })
    expect(next.concurrency).toEqual({ 'group': 'docs-worker-next', 'cancel-in-progress': false })
    expect(next.jobs['deploy-next'].if).toEqual(production.jobs['deploy-production'].if)
    expect(next.jobs['deploy-next'].env).toEqual({ SITE_URL: 'https://next.tw.weapp.dev' })
  })

  it('复用全部生产质量门禁，上传前检查最新 main，密钥只注入上传步骤', () => {
    const steps: Step[] = next.jobs['deploy-next'].steps
    const deployIndex = steps.findIndex(step => step.id === 'deploy')
    const latestIndex = steps.findIndex(step => step.id === 'latest')
    expect(latestIndex).toBe(deployIndex - 1)
    const normalize = (command: string) => command
      .replaceAll('build:next', 'build')
      .replaceAll('test:worker -- --target next', 'test:worker')
      .replaceAll('deploy:worker:next:dry-run', 'deploy:worker:dry-run')
    const productionSteps: Step[] = production.jobs['deploy-production'].steps
    expect(steps.slice(0, latestIndex + 1).map(step => normalize(step.run ?? '')))
      .toEqual(productionSteps.slice(0, latestIndex + 1).map(step => step.run ?? ''))
    for (const step of steps.slice(0, deployIndex)) {
      expect(step.if).toBeUndefined()
      expect(step['continue-on-error']).toBeUndefined()
    }
    expect(steps[deployIndex].if).toBe('steps.latest.outputs.deploy == \'true\'')
    expect(steps[deployIndex].run).toMatch(/--credentials[\s\S]*deployments list[^\n]*--env next[\s\S]*pnpm deploy:docs:worker:next/)
    expect(steps.filter(step => step.env?.CLOUDFLARE_API_TOKEN)).toEqual([steps[deployIndex]])
    expect(steps[deployIndex].env).toEqual(productionSteps[deployIndex].env)
    expect(next.env).toBeUndefined()
    expect(steps[deployIndex + 1].if).toBe('steps.deploy.outcome == \'success\'')
    expect(steps[deployIndex + 1].run).toContain('https://next.tw.weapp.dev --target next')
    expect(steps.every(step => !step['continue-on-error'])).toBe(true)
  })
})
