import type { HBuilderXCliResolution, HBuilderXRunner } from '../packages/hbuilderx-runner/src/types'
import { realpath } from 'node:fs/promises'
import process from 'node:process'
import { createHBuilderXProjectAlias } from './hbuilderx-project-alias.mjs'
import { closeHBuilderXProjectAlias } from './hbuilderx-project-lifecycle'

type AppPlatform = 'app-android' | 'app-ios' | 'app-harmony'
type HostResolution = Pick<HBuilderXCliResolution, 'channel' | 'version' | 'host'>

interface AppProjectOptions {
  projectRoot: string
  platform: AppPlatform
  runner: { resolution: HostResolution, run: HBuilderXRunner['run'] }
  timeoutMs: number
  env?: Record<string, string | undefined> | undefined
}

/** 仅启用已核对的 Alpha 5.31 起的绝对路径临时 workspace 能力。 */
export function supportsCanonicalHarmonyProject(resolution: HostResolution) {
  const version = resolution.version?.match(/^(\d+)\.(\d+)\.\d+(?:\.\d+)*(?:-[0-9a-z.-]+)?$/i)
  if (resolution.channel !== 'alpha' || !version) {
    return false
  }
  const major = Number(version[1])
  const minor = Number(version[2])
  return major > 5 || (major === 5 && minor >= 31)
}

/** 项目注册与本轮 launch 进程分开归属，真实项目不获得 open/close 权限。 */
export async function createHBuilderXAppProject(options: AppProjectOptions) {
  const { platform, runner, timeoutMs, env } = options
  if (platform === 'app-harmony' && supportsCanonicalHarmonyProject(runner.resolution)) {
    // resolve 不能消除目录符号链接，ArkTS 的入口和模块图必须使用同一个真实根。
    const projectRoot = await realpath(options.projectRoot)
    const session = {
      kind: 'canonical-root' as const,
      projectRoot,
      projectPath: projectRoot,
      launchProject: projectRoot,
      async open() {},
      async cleanup() {},
    }
    logProjectIdentity(options, session)
    return session
  }

  const alias = await createHBuilderXProjectAlias(options.projectRoot)
  let openAttempted = false
  let opened = false
  let cleaned = false
  const session = {
    kind: 'owned-alias' as const,
    projectRoot: options.projectRoot,
    projectPath: alias.projectPath,
    launchProject: platform === 'app-harmony' ? alias.projectPath : alias.projectName,
    async open() {
      if (cleaned) {
        throw new Error('HBuilderX 本轮项目别名已释放，不能再次打开。')
      }
      if (!opened) {
        openAttempted = true
        await runner.run({ args: ['project', 'open', '--path', alias.projectPath], cwd: options.projectRoot, timeoutMs, ...(env ? { env } : {}) })
        opened = true
      }
    },
    async cleanup() {
      if (cleaned) {
        return
      }
      if (openAttempted) {
        await closeHBuilderXProjectAlias(alias, () => runner.run({
          args: ['project', 'close', '--path', alias.projectPath],
          cwd: options.projectRoot,
          timeoutMs,
          allowFailure: false,
          ...(env ? { env } : {}),
        }))
      }
      else {
        await alias.cleanup()
      }
      cleaned = true
    },
  }
  logProjectIdentity(options, session)
  return session
}

function logProjectIdentity(options: AppProjectOptions, session: { kind: string, projectRoot: string, launchProject: string }) {
  process.stdout.write(`[hbuilderx-app-project] ${JSON.stringify({
    ...options.runner.resolution,
    platform: options.platform,
    configuredRoot: options.projectRoot,
    kind: session.kind,
    projectRoot: session.projectRoot,
    launchProject: session.launchProject,
  })}\n`)
}
