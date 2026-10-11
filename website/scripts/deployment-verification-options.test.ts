import { describe, expect, it } from 'vitest'
import { parseDeploymentVerificationOptions } from './deployment-verification-options'

describe('parseDeploymentVerificationOptions', () => {
  it('默认使用待验证站点作为 canonical origin', () => {
    expect(parseDeploymentVerificationOptions(['--', 'https://tw.weapp.dev'])).toEqual({
      canonicalOrigin: 'https://tw.weapp.dev',
      siteUrl: new URL('https://tw.weapp.dev'),
    })
  })

  it('允许为 Worker 预览地址指定生产 canonical origin', () => {
    expect(parseDeploymentVerificationOptions([
      'https://migration-weapp-tailwindcss.example.workers.dev',
      '--canonical-origin',
      'https://tw.weapp.dev/',
    ])).toEqual({
      canonicalOrigin: 'https://tw.weapp.dev',
      siteUrl: new URL('https://migration-weapp-tailwindcss.example.workers.dev'),
    })
  })

  it('支持等号形式的 canonical origin 参数', () => {
    expect(parseDeploymentVerificationOptions([
      'https://weapp-tw.icebreaker.top',
      '--canonical-origin=https://tw.weapp.dev',
    ]).canonicalOrigin).toBe('https://tw.weapp.dev')
  })

  it('拒绝缺少值和未知参数', () => {
    expect(() => parseDeploymentVerificationOptions(['https://example.com', '--canonical-origin'])).toThrow('--canonical-origin 缺少 URL')
    expect(() => parseDeploymentVerificationOptions(['https://example.com', '--unexpected'])).toThrow('未知参数')
  })
})
