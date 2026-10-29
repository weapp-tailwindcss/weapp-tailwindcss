import type { HBuilderXCommandResult } from '../../packages/hbuilderx-runner/src'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { format as formatMessage } from 'node:util'
import { createHBuilderXRunner, fileExists, HBuilderXCommandError, stripAnsi } from '../../packages/hbuilderx-runner/src'
import { createHBuilderXProjectAlias } from '../../scripts/hbuilderx-project-alias.mjs'
import { withHBuilderXProjectCleanup } from '../../scripts/hbuilderx-project-lifecycle'

function wait(timeoutMs: number) {
  return new Promise(resolve => setTimeout(resolve, timeoutMs))
}

function commandFailure(message: string, result: HBuilderXCommandResult) {
  return new HBuilderXCommandError([
    message,
    `command=${result.command} ${result.args.join(' ')}`,
    `cwd=${result.cwd}`,
    `exit=${result.exit.signal ?? result.exit.code}`,
    `issue=${result.issue.kind}: ${result.issue.message}`,
    result.output,
  ].join('\n'), result)
}

function compilationFailure(result: HBuilderXCommandResult) {
  // output 还保留被末尾日志缓冲裁掉的重要错误；两份证据均参与终态判定。
  const output = stripAnsi(`${result.logs.join('')}\n${result.output}`)
  const lines = output.split(/\r?\n/).map(line => line.trim().replace(/^\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+/, ''))
  const failure = lines.find(line => /^(?:Build failed with errors\.|项目 .+ 编译失败。|Project .+ compilation failed\.)$/i.test(line))
  if (failure) {
    return failure
  }
  // 成功句后可附官方运行日志提示；仍必须验证下方的完整产物合同。
  const completed = lines.some(line => /^(?:(?:DONE\s+)?Build complete\.|项目 .+ (?:编译成功。|UTS编译完毕。)|Project .+ (?:compiled successfully\.|UTS compilation completed\.))(?:\s|$)/i.test(line))
  // 一次性编译成功也会停止；只有缺少本轮成功终态的提前停止才是失败。
  if (!completed) {
    return lines.find(line => /^(?:已停止运行\.\.\.|Stopped running\.\.\.)$/i.test(line))
  }
}

async function runHBuilderXCli(root: string, args: string[], env: Record<string, string | undefined>, timeoutMs: number) {
  try {
    const runner = await createHBuilderXRunner({
      cwd: root,
      env,
    })
    const { channel, host, path: cliPath, version } = runner.resolution
    process.stdout.write(`[e2e] HBuilderX channel=${channel} version=${version} host=${host} cli=${cliPath}\n`)
    const result = await runner.run({ args, cwd: root, env, stdio: 'pipe', timeoutMs })
    // 调试模式回放已捕获的管道内容，不能用 inherit 丢掉结构化诊断。
    if (process.env['E2E_DEBUG_BUILD'] === '1') {
      process.stdout.write(result.logs.join('') || result.output)
    }
    if (result.exit.code !== 0 || result.exit.signal || result.issue.kind !== 'unknown') {
      throw commandFailure('[e2e] HBuilderX command reported failure', result)
    }
    const terminal = args[0] === 'launch' ? compilationFailure(result) : undefined
    if (terminal) {
      throw commandFailure(`[e2e] HBuilderX compilation failed: ${terminal}`, result)
    }
    return result
  }
  catch (error) {
    process.stderr.write(`${formatMessage('[e2e] HBuilderX command failed in %s: %s\n%o', root, args.join(' '), error)}\n`)
    throw error
  }
}

export async function ensureHBuilderXMiniProgramBuilt(
  root: string,
  pkgPath: string,
  pkg?: { name?: string },
  env?: Record<string, string | undefined>,
) {
  const timeoutMs = Number(process.env['E2E_IDE_HBUILDERX_DEV_BUILD_TIMEOUT_MS'] ?? process.env['E2E_IDE_BUILD_TIMEOUT_MS'] ?? 120_000)
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    ...env,
    NODE_ENV: 'development',
    BROWSERSLIST_ENV: 'development',
    RUST_BACKTRACE: process.env['RUST_BACKTRACE'] ?? '1',
    WEAPP_TW_HMR_TIMING: process.env['WEAPP_TW_HMR_TIMING'] ?? '1',
    npm_package_json: pkgPath,
    PNPM_PACKAGE_NAME: pkg?.name ?? process.env['PNPM_PACKAGE_NAME'],
    INIT_CWD: root,
  }

  delete childEnv['VITEST']
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith('VITEST_')) {
      delete childEnv[key]
    }
  }

  await fs.rm(path.resolve(root, 'unpackage/dist/dev/mp-weixin'), {
    recursive: true,
    force: true,
  })
  await fs.rm(path.resolve(root, 'dist/dev/mp-weixin'), {
    recursive: true,
    force: true,
  })

  const projectAlias = await createHBuilderXProjectAlias(root)
  await withHBuilderXProjectCleanup(projectAlias, async () => {
    await runHBuilderXCli(root, ['project', 'open', '--path', projectAlias.projectPath], childEnv, timeoutMs)
    const launch = await runHBuilderXCli(root, ['launch', 'mp-weixin', '--project', projectAlias.projectName, '--compile', 'true'], childEnv, timeoutMs)

    const outputRoots = [
      path.resolve(root, 'unpackage/dist/dev/mp-weixin'),
      path.resolve(root, 'dist/dev/mp-weixin'),
    ]
    const requiredFiles = [
      'app.json',
      'project.config.json',
      'pages/index/index.js',
      'pages/index/index.json',
      'pages/index/index.wxml',
    ]
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      for (const outputRoot of outputRoots) {
        const ready = await Promise.all(requiredFiles.map(file => fileExists(path.resolve(outputRoot, file))))
        if (ready.every(Boolean)) {
          return
        }
      }
      await wait(500)
    }
    throw commandFailure(`[e2e] HBuilderX mp-weixin compile output did not become ready in ${timeoutMs}ms: ${outputRoots.join(', ')}`, launch)
  }, () => runHBuilderXCli(root, ['project', 'close', '--path', projectAlias.projectPath], childEnv, timeoutMs))
}
