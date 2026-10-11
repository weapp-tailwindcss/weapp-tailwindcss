import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'

export const ROOT = process.cwd()
export const DEFAULT_TEMPLATES_JSONC = path.join(ROOT, 'templates.jsonc')
export const TEMPLATE_CACHE_ROOT = path.join(ROOT, '.cache', 'template-repos')
export const REMOVED_TEMPLATE_NAMES = new Set([
  'native-weapp-tailwindcss-template',
  'taro-react-tailwind-vscode-template',
  'taro-vue3-tailwind-vscode-template',
  'uni-app-vite-vue3-tailwind-vscode-template',
  'uni-app-vue2-tailwind-vscode-template',
  'uni-app-vue3-tailwind-hbuilder-template',
  'uni-app-x-hbuilderx',
  'vue-mini-tailwindcss-template',
  'weapp-native-mina-tailwindcss-template',
])

const NEWLINE_RE = /\r?\n/u
const LEADING_SLASHES_RE = /^\/+/u
const TRAILING_GIT_RE = /\.git$/u
const REF_HEADS_RE = /refs\/heads\/(\S+)/u

function stripCommentLines(content: string): string {
  return content
    .split(NEWLINE_RE)
    .filter(line => !line.trimStart().startsWith('//'))
    .join('\n')
}

export function resolveConfigPath(): string {
  return process.env.TEMPLATES_CONFIG
    ? path.resolve(ROOT, process.env.TEMPLATES_CONFIG)
    : DEFAULT_TEMPLATES_JSONC
}

export function ensureConfigExists(configPath: string): void {
  if (!existsSync(configPath)) {
    console.error(`未找到 ${configPath}，操作无法继续。`)
    process.exit(1)
  }
}

export function readTemplateUrls(configPath: string): string[] {
  const raw = readFileSync(configPath, 'utf8')
  try {
    return JSON.parse(stripCommentLines(raw))
  }
  catch (error) {
    console.error('解析 templates.jsonc 失败，请确认文件格式正确。')
    throw error
  }
}

export function toSshUrl(url: string): string {
  const target = new URL(url)
  const repoPath = target.pathname.replace(LEADING_SLASHES_RE, '').replace(TRAILING_GIT_RE, '')
  return `git@${target.host}:${repoPath}.git`
}

export function repoFolderName(url: string): string {
  const target = new URL(url)
  const segments = target.pathname.split('/').filter(Boolean)
  return segments.at(-1)?.replace(TRAILING_GIT_RE, '') ?? ''
}

export function isRemovedTemplateName(name: string): boolean {
  return REMOVED_TEMPLATE_NAMES.has(name)
}

async function ensureCacheRepoRemote(repoDir: string, sshUrl: string): Promise<void> {
  try {
    const { stdout: remoteUrl } = await execa('git', ['remote', 'get-url', 'origin'], { cwd: repoDir })
    if (remoteUrl.trim() !== sshUrl) {
      console.warn(`缓存仓库 ${repoDir} 的 origin 与配置不符，更新为 ${sshUrl}`)
      await execa('git', ['remote', 'set-url', 'origin', sshUrl], { cwd: repoDir, stdio: 'inherit' })
    }
  }
  catch {
    await execa('git', ['remote', 'add', 'origin', sshUrl], { cwd: repoDir, stdio: 'inherit' })
  }
}

export async function prepareTemplateCacheRepo(repoName: string, sshUrl: string, options: { cleanIgnored?: boolean } = {}): Promise<{ repoDir: string, branch: string }> {
  const branch = await resolveDefaultBranch(sshUrl)

  if (!existsSync(TEMPLATE_CACHE_ROOT)) {
    mkdirSync(TEMPLATE_CACHE_ROOT, { recursive: true })
  }

  const repoDir = path.join(TEMPLATE_CACHE_ROOT, repoName)
  if (!existsSync(repoDir)) {
    console.log(`\n>>> 首次克隆 ${sshUrl} 到 ${repoDir} (分支 ${branch})`)
    await execa('git', ['clone', '--branch', branch, '--single-branch', sshUrl, repoDir], { stdio: 'inherit' })
  }
  else {
    console.log(`\n>>> 使用缓存仓库 ${repoDir}`)
    await ensureCacheRepoRemote(repoDir, sshUrl)
  }

  await execa('git', ['fetch', 'origin', branch], { cwd: repoDir, stdio: 'inherit' })

  try {
    await execa('git', ['checkout', branch], { cwd: repoDir, stdio: 'inherit' })
  }
  catch {
    await execa('git', ['checkout', '-B', branch, `origin/${branch}`], { cwd: repoDir, stdio: 'inherit' })
  }

  await execa('git', ['reset', '--hard', `origin/${branch}`], { cwd: repoDir, stdio: 'inherit' })
  const cleanArgs = options.cleanIgnored ? ['clean', '-fdx'] : ['clean', '-fd']
  await execa('git', cleanArgs, { cwd: repoDir, stdio: 'inherit' })

  return { repoDir, branch }
}

export async function resolveDefaultBranch(repo: string): Promise<string> {
  const { stdout } = await execa('git', ['ls-remote', '--symref', repo, 'HEAD'], {
    cwd: ROOT,
  })

  const refLine = stdout.split('\n').find(line => line.startsWith('ref: '))
  if (!refLine) {
    throw new Error(`无法解析 ${repo} 的默认分支。命令输出：\n${stdout}`)
  }

  const branchMatch = refLine.match(REF_HEADS_RE)
  if (!branchMatch) {
    throw new Error(`未找到 ${repo} 的默认分支信息。命令输出：\n${stdout}`)
  }

  return branchMatch[1]!
}

export async function ensureCleanWorkingTree(message: string): Promise<void> {
  const { stdout } = await execa('git', ['status', '--porcelain'], {
    cwd: ROOT,
  })
  if (stdout.trim().length > 0) {
    console.error(message)
    process.exit(1)
  }
}
