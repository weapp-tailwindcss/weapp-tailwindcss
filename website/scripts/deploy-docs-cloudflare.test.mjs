import { describe, expect, it, vi } from 'vitest'
import {
  deployDocsCloudflare,
  nextDeploymentSteps,
  productionDeploymentSteps,
} from '../../scripts/deploy-docs-cloudflare.mjs'

describe('Cloudflare 文档部署计划', () => {
  it('生产 Connected Build 只部署并验证生产 Worker', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)

    await deployDocsCloudflare({ branch: 'main', execute, target: 'production' })

    expect(execute.mock.calls.map(([, args]) => args)).toEqual(productionDeploymentSteps)
    expect(productionDeploymentSteps.flat()).not.toContain('deploy:worker:next')
    expect(productionDeploymentSteps.flat()).not.toContain('https://next.tw.weapp.dev')
  })

  it('预览 Worker 使用独立部署计划', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)

    await deployDocsCloudflare({ branch: 'main', execute, target: 'next' })

    expect(execute.mock.calls.map(([, args]) => args)).toEqual(nextDeploymentSteps)
    expect(nextDeploymentSteps.flat()).not.toContain('deploy:worker')
    expect(nextDeploymentSteps.flat()).not.toContain('https://tw.weapp.dev')
  })

  it('拒绝从非 main 分支部署', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)

    await expect(deployDocsCloudflare({ branch: 'feature', execute })).rejects.toThrow('仅允许从 main 部署')
    expect(execute).not.toHaveBeenCalled()
  })

  it('拒绝未知部署目标', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)

    await expect(deployDocsCloudflare({ branch: 'main', execute, target: 'preview' })).rejects.toThrow('未知文档部署目标')
    expect(execute).not.toHaveBeenCalled()
  })
})
