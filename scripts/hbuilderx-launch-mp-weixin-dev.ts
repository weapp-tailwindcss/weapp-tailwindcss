/// <reference types="node" />

import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { inspect } from 'node:util'
import { createHBuilderXRunner } from '../packages/hbuilderx-runner/src/index'
import { createHBuilderXProjectAlias } from './hbuilderx-project-alias.mjs'
import { withHBuilderXProjectCleanup } from './hbuilderx-project-lifecycle'
import { watchWechatWithHBuilderXCompiler } from './hbuilderx/wechat-watch'

export async function launchHBuilderXMiniProgram(projectRoot = process.cwd()) {
  if (process.env.HBUILDERX_COMPILE_ONLY === undefined || process.env.HBUILDERX_COMPILE_ONLY === '0') {
    return watchWechatWithHBuilderXCompiler(projectRoot)
  }
  // HBuilderX 的运行模式会经 launcher 调用微信 CLI；必须在解析 runner 或修改产物前阻断。
  if (process.env.HBUILDERX_COMPILE_ONLY !== '1') {
    throw new Error('已阻断 HBuilderX 微信 watch：launch mp-weixin 的运行模式会间接启动微信开发者工具，不能保证登录态。仅允许显式 HBUILDERX_COMPILE_ONLY=1 的一次性静态编译；watch/HMR 需使用独立编译器，并由 scripts/wechat 连接用户已开启的 IDE。')
  }
  const hbuilderx = await createHBuilderXRunner({ cwd: projectRoot })
  const projectAlias = await createHBuilderXProjectAlias(projectRoot)
  const projectName = process.env.HBUILDERX_PROJECT_NAME || projectAlias.projectName
  const { channel, host, path, version } = hbuilderx.resolution
  process.stdout.write(`[hbuilderx] channel=${channel} version=${version} host=${host} cli=${path}\n`)

  await withHBuilderXProjectCleanup(projectAlias, async () => {
    await rm(resolve(projectRoot, 'unpackage/dist/dev/mp-weixin'), {
      recursive: true,
      force: true,
    })
    await rm(resolve(projectRoot, '.debug'), {
      recursive: true,
      force: true,
    })
    await hbuilderx.run({
      args: ['project', 'open', '--path', projectAlias.projectPath],
      cwd: projectRoot,
      stdio: 'inherit',
      timeoutMs: 120_000,
    })

    // HBuilderX 5.14 在 launch 阶段用绝对路径可能误判根目录项目类型，导入后用项目名更稳定。
    const launch = hbuilderx.spawn({
      args: ['launch', 'mp-weixin', '--project', projectName, '--compile', 'true', '--runtime-log', 'true'],
      cwd: projectRoot,
      stdio: 'inherit',
    })
    let rejectStop: (error: unknown) => void
    const stopFailure = new Promise<never>((_resolve, reject) => {
      rejectStop = reject
    })
    let stopping: Promise<void> | undefined
    const onSignal = (signal: NodeJS.Signals) => {
      stopping ??= launch.stop(signal)
      void stopping.catch(error => rejectStop(error))
    }
    const signalHandlers = {
      SIGINT: () => onSignal('SIGINT'),
      SIGTERM: () => onSignal('SIGTERM'),
    }
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, signalHandlers[signal])
    }
    let launchFailure: { error: unknown } | undefined
    try {
      const exit = await Promise.race([launch.closed, stopFailure])
      if (exit.code !== 0) {
        throw new Error(`hbuilderx launch mp-weixin failed: ${exit.signal ?? exit.code}`)
      }
    }
    catch (error) {
      launchFailure = { error }
    }
    finally {
      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.removeListener(signal, signalHandlers[signal])
      }
      try {
        await stopping
      }
      catch (error) {
        launchFailure = { error: launchFailure && launchFailure.error !== error
          ? new AggregateError([launchFailure.error, error], 'HBuilderX 运行与进程停止均失败。', { cause: launchFailure.error })
          : error }
      }
    }
    if (launchFailure) {
      throw launchFailure.error
    }
  }, () => hbuilderx.run({
    args: ['project', 'close', '--path', projectAlias.projectPath],
    cwd: projectRoot,
    allowFailure: false,
    stdio: 'inherit',
    timeoutMs: 120_000,
  }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  launchHBuilderXMiniProgram().catch((error) => {
    process.stderr.write(`${inspect(error, { depth: null, colors: false })}\n`)
    process.exitCode = 1
  })
}
