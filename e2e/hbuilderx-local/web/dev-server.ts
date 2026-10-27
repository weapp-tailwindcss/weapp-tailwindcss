import type { SpawnedHBuilderXCommand } from '../../../packages/hbuilderx-runner/src/types'
import process from 'node:process'
import { createHBuilderXProjectAlias } from '../../../scripts/hbuilderx-project-alias.mjs'
import { closeHBuilderXProjectAlias, withHBuilderXProjectCleanup } from '../../../scripts/hbuilderx-project-lifecycle'
import { createLocalHBuilderXRunner, pollIntervalMs, serverTimeoutMs, spawnPnpm, wait } from '../process'

let devServer: SpawnedHBuilderXCommand | undefined

function assertReleased() {
  if (devServer) {
    throw new Error(`上轮 Web 服务尚未确认停止，不能覆盖 pid=${devServer.child.pid} 的受管句柄。`)
  }
}

/** 会话和 afterEach 共用同一次严格收尾；失败时保留句柄，禁止覆盖。 */
function ownDevServer(command: SpawnedHBuilderXCommand, persistentCli = false): SpawnedHBuilderXCommand {
  let stopping: Promise<void> | undefined
  const owned = {
    ...command,
    stop(signal?: NodeJS.Signals) {
      if (stopping) {
        return stopping
      }
      const child = command.child
      const earlyExit = persistentCli && (child.exitCode !== null || child.signalCode !== null)
        ? new Error(`Web 服务在停止前已退出：${child.signalCode ?? child.exitCode}\n${command.logs.join('')}`)
        : undefined
      let cleanup: Promise<void>
      try {
        // 状态检查与 stop 之间不能 await：底层须在根仍有效时保存本轮进程组。
        cleanup = command.stop(signal)
      }
      catch (error) {
        cleanup = Promise.reject(error)
      }
      stopping = cleanup.then(() => {
        if (earlyExit) {
          throw earlyExit
        }
        if (devServer === owned) {
          devServer = undefined
        }
      }, (error) => {
        throw earlyExit
          ? Object.assign(new AggregateError([earlyExit, error], 'Web 服务提前退出且收尾失败。'), { cause: earlyExit })
          : error
      })
      return stopping
    },
  }
  devServer = owned
  return owned
}

export async function stopDevServer() {
  await devServer?.stop()
}

function unsetVitestEnv(env: Record<string, string | undefined>) {
  env.VITEST = undefined
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('VITEST_')) {
      env[key] = undefined
    }
  }
  return env
}

export function createDevServer(projectRoot: string, port: number) {
  assertReleased()
  const childEnv = unsetVitestEnv({
    BROWSER: 'none',
    BROWSERSLIST_ENV: 'development',
    NODE_ENV: 'development',
    WEAPP_TW_HMR_TIMING: '1',
    WEAPP_TW_WATCH_REGRESSION: '1',
    VITE_WEAPP_TW_WATCH_REGRESSION: '1',
    HOST: '127.0.0.1',
    PORT: String(port),
    UNI_CLI_SERVER_HOST: '127.0.0.1',
    UNI_CLI_SERVER_PORT: String(port),
    CHOKIDAR_USEPOLLING: process.env['CHOKIDAR_USEPOLLING'] ?? '1',
    CHOKIDAR_INTERVAL: process.env['CHOKIDAR_INTERVAL'] ?? '50',
  })

  const command = spawnPnpm(projectRoot, [
    'exec',
    'cross-env',
    'WEAPP_TW_HMR_TIMING=1',
    'UNI_INPUT_DIR=.',
    'uni',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ], childEnv)
  return ownDevServer(command, true)
}

export async function createHBuilderXDevServer(projectRoot: string) {
  assertReleased()
  const env = unsetVitestEnv({
    BROWSER: 'none',
    WEAPP_TW_HMR_TIMING: '1',
    WEAPP_TW_WATCH_REGRESSION: '1',
    VITE_WEAPP_TW_WATCH_REGRESSION: '1',
  })
  const hbuilderx = await createLocalHBuilderXRunner(projectRoot, env)
  const identity = await createHBuilderXProjectAlias(projectRoot, process.env['E2E_HBUILDERX_ALIAS_ROOT'])
  const projectOptions = { cwd: identity.projectPath, env, timeoutMs: serverTimeoutMs }
  const closeProject = () => hbuilderx.closeProject({ ...projectOptions, allowFailure: false })
  const cleanup = () => closeHBuilderXProjectAlias(identity, closeProject)
  try {
    await hbuilderx.openProject(projectOptions)
    const startedAt = Date.now()
    let registered = false
    while (Date.now() - startedAt < serverTimeoutMs) {
      const listed = await hbuilderx.run({ ...projectOptions, args: ['project', 'list'] })
      if (listed.output.includes(` - ${identity.projectName}(`)) {
        registered = true
        break
      }
      await wait(pollIntervalMs)
    }
    if (!registered) {
      throw new Error(`等待 HBuilderX 项目注册超时：${identity.projectPath}`)
    }
    const launch = hbuilderx.spawn({
      args: ['launch', 'web', '--project', identity.projectPath, '--browser', 'Chrome'],
      cwd: projectRoot,
      env,
    })
    return { ...ownDevServer(launch), cleanup }
  }
  catch (error) {
    return await withHBuilderXProjectCleanup(identity, async () => {
      throw error
    }, closeProject)
  }
}
