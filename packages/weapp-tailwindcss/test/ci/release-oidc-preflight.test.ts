import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { auditNpmOidc } from '../../../../scripts/release-oidc-preflight'

const repository = 'weapp-tailwindcss/weapp-tailwindcss'
const workflow = `${repository}/.github/workflows/release.yml@refs/heads/main`
const claims = {
  iss: 'https://token.actions.githubusercontent.com',
  aud: 'npm:registry.npmjs.org',
  sub: 'repo:weapp-tailwindcss@321281321/weapp-tailwindcss@448897619:ref:refs/heads/main',
  repository,
  workflow_ref: workflow,
  runner_environment: 'github-hosted',
  jti: '不应输出的字段',
}
const idToken = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`
const env = {
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com/idtoken?api-version=2.0',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'github-request-secret',
  GITHUB_REPOSITORY: repository,
  GITHUB_WORKFLOW_REF: workflow,
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

describe('发布 OIDC 核验', () => {
  it('检查全部包并保留 npm 顶层错误原因，报告不含凭据', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ value: idToken }))
      .mockResolvedValueOnce(json({ token: 'npm-exchange-secret' }))
      .mockResolvedValueOnce(json({ message: 'OIDC token exchange error - package not found' }, 404))
      .mockResolvedValueOnce(json({ message: `拒绝 ${idToken} ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` }, 401))
    const report = await auditNpmOidc(['@scope/first', 'second', 'third'], env, fetcher)

    expect(report.ok).toBe(false)
    expect(report.identity.sub).toBe(claims.sub)
    expect(report.identity).not.toHaveProperty('jti')
    expect(report.results).toEqual([
      { package: '@scope/first', ok: true, status: 200, message: 'OIDC 凭据交换通过' },
      { package: 'second', ok: false, status: 404, message: 'OIDC token exchange error - package not found' },
      { package: 'third', ok: false, status: 401, message: '拒绝 [已隐藏] [已隐藏]' },
    ])
    const output = JSON.stringify(report)
    for (const secret of [idToken, env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, 'npm-exchange-secret']) {
      expect(output).not.toContain(secret)
    }
    const urls = fetcher.mock.calls.map(([url]) => String(url))
    expect(urls[0]).toContain('audience=npm%3Aregistry.npmjs.org')
    expect(urls[1]).toBe('https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/%40scope%2Ffirst')
    expect(urls.every(url => !url.includes(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN))).toBe(true)
  })

  it('网络异常后继续核验后续包，也拒绝缺少 token 的成功响应', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ value: idToken }))
      .mockRejectedValueOnce(new Error('transport error'))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ token: 'valid' }))
    const report = await auditNpmOidc(['first', 'second', 'third'], env, fetcher)
    expect(report.results.map(result => result.ok)).toEqual([false, false, true])
    expect(report.results[0]?.status).toBeNull()
    expect(report.ok).toBe(false)
  })

  it('缺少权限时在请求 npm 前失败', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(auditNpmOidc(['first'], {}, fetcher)).rejects.toThrow('缺少 GitHub OIDC 环境')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('身份来自其他仓库时拒绝交换', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ value: idToken }))
    await expect(auditNpmOidc(['first'], { ...env, GITHUB_REPOSITORY: 'another/repository' }, fetcher))
      .rejects
      .toThrow('身份与当前 workflow 不一致')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
