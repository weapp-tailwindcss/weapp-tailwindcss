import type { HBuilderXCommandOptions } from '../../packages/hbuilderx-runner/src/types'
import { access, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { resolveHBuilderXCli } from '../../packages/hbuilderx-runner/src/hbuilderx'

type Environment = Record<string, string | undefined>
type PathApi = Pick<typeof path, 'dirname' | 'join' | 'resolve'>

export function pluginRootCandidates(cliPath: string, paths: PathApi = path) {
  return [paths.join(paths.dirname(cliPath), 'plugins'), paths.resolve(paths.dirname(cliPath), '..', 'HBuilderX', 'plugins')]
}

async function identity(root: string, name: string) {
  const manifest = path.join(root, 'package.json')
  const pkg = JSON.parse(await readFile(manifest, 'utf8'))
  if (pkg.name !== name || typeof pkg.version !== 'string' || !pkg.version) {
    throw new Error(`HBuilderX 编译组件身份无效：${manifest}`)
  }
  return pkg.version as string
}

/** 编译路由只来自本轮安装和项目，禁止继承 IDE RPC 或其他目标的环境。 */
export function compilerEnvironment(input: {
  projectRoot: string
  pluginsRoot: string
  compilerRoot: string
  outputDir: string
  version: string
}, inherited: Environment) {
  const env = { ...inherited }
  const preserved = ['UNI_MINIMIZE', 'UNI_CUSTOM_CONTEXT', 'UNI_CUSTOM_DEFINE', 'UNI_APP_SOURCEMAP']
  const rebound = ['PIPE_NAME', 'HBUILDERPROCESSID', 'RUN_BY_HBUILDERX', 'VITE_ROOT_DIR', 'NODE_ENV', 'BROWSERSLIST_ENV', 'NODE_SKIP_PLATFORM_CHECK', 'NO_COLOR']
  for (const key of Object.keys(env)) {
    const upper = key.toUpperCase()
    if (/^(?:HX_|UNI_|VITEST)/.test(upper) || rebound.includes(upper)) {
      env[key] = undefined
    }
  }
  for (const key of preserved) {
    const source = Object.keys(inherited).find(candidate => candidate.toUpperCase() === key)
    if (source) {
      env[key] = inherited[source]
    }
  }
  return {
    ...env,
    HX_APP_ROOT: path.dirname(input.pluginsRoot),
    HX_Version: input.version,
    UNI_HBUILDERX_PLUGINS: input.pluginsRoot,
    UNI_HBUILDERX_LANGID: inherited.UNI_HBUILDERX_LANGID || 'zh_CN',
    UNI_CLI_CONTEXT: input.compilerRoot,
    VITE_ROOT_DIR: input.projectRoot,
    UNI_INPUT_DIR: input.projectRoot,
    UNI_OUTPUT_DIR: input.outputDir,
    UNI_PLATFORM: 'mp-weixin',
    HX_RUN_DEVICE_TYPE: 'mp-weixin',
    HX_DEPENDENCIES_DIR: path.join(input.projectRoot, 'unpackage', 'cache', 'uts_cache'),
    UNI_APP_X_CACHE_DIR: path.join(input.projectRoot, 'unpackage', 'cache', '.mp-weixin'),
    NODE_ENV: 'development',
    BROWSERSLIST_ENV: 'development',
    NODE_SKIP_PLATFORM_CHECK: '1',
    NO_COLOR: '1',
  }
}

/** 读取安装身份后生成纯编译命令，不执行 HBuilderX CLI、项目导入或微信启动。 */
export async function createWechatCompilerPlan(project: string, options: {
  env?: Environment
  cliPath?: string
  platform?: NodeJS.Platform
} = {}) {
  const inherited = options.env ?? process.env
  const cliPath = options.cliPath ?? await resolveHBuilderXCli({ env: inherited })
  const candidates = pluginRootCandidates(cliPath)
  const roots: string[] = []
  for (const candidate of candidates) {
    if (await access(path.join(candidate, 'about', 'package.json')).then(() => true, () => false)) {
      roots.push(await realpath(candidate))
    }
  }
  const distinct = [...new Set(roots)]
  if (distinct.length !== 1) {
    throw new Error(`无法唯一确定 HBuilderX 编译安装：${candidates.join(', ')}`)
  }
  const pluginsRoot = distinct[0]!
  const compilerRoot = path.join(pluginsRoot, 'uniapp-cli-vite')
  const projectRoot = await realpath(project)
  const outputDir = path.join(projectRoot, 'unpackage', 'dist', 'dev', 'mp-weixin')
  const command = path.join(pluginsRoot, 'node', (options.platform ?? process.platform) === 'win32' ? 'node.exe' : 'node')
  const entry = path.join(compilerRoot, 'node_modules', '@dcloudio', 'vite-plugin-uni', 'bin', 'uni.js')
  const [version, compilerVersion, nodeVersion] = await Promise.all([
    identity(path.join(pluginsRoot, 'about'), 'about'),
    identity(compilerRoot, 'uniapp-cli-vite'),
    identity(path.join(pluginsRoot, 'node'), 'node'),
    access(entry),
    access(command),
    access(path.join(projectRoot, 'manifest.json')),
  ])
  const env = compilerEnvironment({ projectRoot, pluginsRoot, compilerRoot, outputDir, version }, inherited)
  const optionsForSpawn: HBuilderXCommandOptions = {
    command,
    args: ['--no-warnings', entry, '-p', 'mp-weixin'],
    cwd: compilerRoot,
    env,
    stdio: 'inherit',
  }
  return { ...optionsForSpawn, projectRoot, outputDir, version, compilerVersion, nodeVersion }
}
