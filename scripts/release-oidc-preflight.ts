import { Buffer } from 'node:buffer'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { getWorkspacePackages } from 'repoctl'

const registry = 'https://registry.npmjs.org'
const audience = 'npm:registry.npmjs.org'
const identityKeys = [
  'iss',
  'aud',
  'sub',
  'repository',
  'repository_id',
  'repository_owner_id',
  'workflow_ref',
  'job_workflow_ref',
  'event_name',
  'runner_environment',
  'environment',
] as const

interface ExchangeResult {
  package: string
  ok: boolean
  status: number | null
  message: string
}

function publicMessage(value: unknown, secrets: string[]) {
  let message = typeof value === 'string' ? value : 'npm 未返回可识别的错误原因'
  for (const secret of secrets) {
    if (secret) {
      message = message.replaceAll(secret, '[已隐藏]')
    }
  }
  return message.slice(0, 500)
}

/** 仅交换短时凭据并汇总结果，不上传包或保存凭据。 */
export async function auditNpmOidc(
  packages: string[],
  env = process.env,
  fetcher: typeof fetch = fetch,
) {
  const requestUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL
  const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!requestUrl || !requestToken) {
    throw new Error('缺少 GitHub OIDC 环境，请在具有 id-token: write 的 GitHub-hosted job 中核验')
  }
  if (!packages.length) {
    throw new Error('没有发现可核验的公开包')
  }
  const url = new URL(requestUrl)
  url.searchParams.set('audience', audience)
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${requestToken}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw new Error(`GitHub OIDC 请求失败：HTTP ${response.status}`)
  }
  const { value: idToken } = await response.json() as { value?: string }
  if (typeof idToken !== 'string' || !idToken) {
    throw new Error('GitHub OIDC 响应缺少身份凭据')
  }
  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'))
  }
  catch {
    throw new Error('GitHub OIDC 身份字段无法解析')
  }
  if (claims.iss !== 'https://token.actions.githubusercontent.com'
    || claims.aud !== audience
    || claims.repository !== env.GITHUB_REPOSITORY
    || claims.workflow_ref !== env.GITHUB_WORKFLOW_REF
    || claims.runner_environment !== 'github-hosted') {
    throw new Error('GitHub OIDC 身份与当前 workflow 不一致')
  }
  const identity = Object.fromEntries(identityKeys
    .filter(key => typeof claims[key] === 'string')
    .map(key => [key, publicMessage(claims[key], [idToken, requestToken])]))
  const results: ExchangeResult[] = []
  for (let start = 0; start < packages.length; start += 4) {
    const batch = await Promise.all(packages.slice(start, start + 4).map(async (name): Promise<ExchangeResult> => {
      try {
        const exchange = await fetcher(new URL(`/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(name)}`, registry), {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' },
          body: '',
          signal: AbortSignal.timeout(15_000),
        })
        const body = await exchange.json().catch(() => ({})) as {
          token?: unknown
          message?: unknown
          body?: { message?: unknown }
        }
        const ok = exchange.ok && typeof body.token === 'string' && body.token.length > 0
        return {
          package: name,
          ok,
          status: exchange.status,
          message: ok ? 'OIDC 凭据交换通过' : publicMessage(body.message ?? body.body?.message, [idToken, requestToken, typeof body.token === 'string' ? body.token : '']),
        }
      }
      catch {
        return { package: name, ok: false, status: null, message: 'npm 凭据交换请求失败或超时' }
      }
    }))
    results.push(...batch)
  }
  return { identity, results, ok: results.every(result => result.ok) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const packages = (await getWorkspacePackages(process.cwd()))
      .map(pkg => pkg.manifest.name)
      .filter((name): name is string => Boolean(name))
      .sort()
    const report = await auditNpmOidc(packages)
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) {
      process.exitCode = 1
    }
  }
  catch {
    console.error('OIDC 核验无法完成，请检查 GitHub-hosted runner、id-token 权限和网络；未保存凭据')
    process.exitCode = 1
  }
}
