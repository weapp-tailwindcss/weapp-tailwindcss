import { describe, expect, it } from 'vitest'
import { parseDeploymentVerificationOptions } from './deployment-verification-options'

describe('parseDeploymentVerificationOptions', () => {
  it.each([
    ['production', 'https://tw.weapp.dev'],
    ['next', 'https://next.tw.weapp.dev'],
  ])('显式验证 %s 的 canonical origin', (target, origin) => {
    expect(parseDeploymentVerificationOptions(['--', origin, '--target', target])).toEqual({
      target,
      canonicalOrigin: origin,
      siteUrl: new URL(origin),
    })
  })

  it('允许 Worker 预览和本地地址验证指定目标的 canonical', () => {
    expect(parseDeploymentVerificationOptions([
      'http://127.0.0.1:45678',
      '--target=next',
      '--canonical-origin=https://next.tw.weapp.dev/',
    ])).toEqual({
      target: 'next',
      canonicalOrigin: 'https://next.tw.weapp.dev',
      siteUrl: new URL('http://127.0.0.1:45678'),
    })
  })

  it('拒绝未指定目标、未知目标或混用两个官方站点', () => {
    expect(() => parseDeploymentVerificationOptions(['https://tw.weapp.dev'])).toThrow('必须显式')
    expect(() => parseDeploymentVerificationOptions(['https://tw.weapp.dev', '--target=preview'])).toThrow('--target 必须')
    expect(() => parseDeploymentVerificationOptions(['https://tw.weapp.dev', '--target=next'])).toThrow('不匹配')
    expect(() => parseDeploymentVerificationOptions(['https://example.workers.dev', '--target=next', '--canonical-origin', 'https://tw.weapp.dev'])).toThrow('next canonical origin')
  })

  it('拒绝缺少值和未知参数', () => {
    expect(() => parseDeploymentVerificationOptions(['https://example.com', '--canonical-origin'])).toThrow('--canonical-origin 缺少 URL')
    expect(() => parseDeploymentVerificationOptions(['https://example.com', '--unexpected'])).toThrow('未知参数')
  })
})
