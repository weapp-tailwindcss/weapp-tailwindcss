import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { format as formatMessage } from 'node:util'
import { createHBuilderXRunner, fileExists } from '../../packages/hbuilderx-runner/src'
import { createHBuilderXProjectAlias } from '../../scripts/hbuilderx-project-alias.mjs'
import { withHBuilderXProjectCleanup } from '../../scripts/hbuilderx-project-lifecycle'

function wait(timeoutMs: number) {
  return new Promise(resolve => setTimeout(resolve, timeoutMs))
}

async function runHBuilderXCli(root: string, args: string[], env: Record<string, string | undefined>, timeoutMs: number) {
  const stdio = process.env['E2E_DEBUG_BUILD'] === '1' ? 'inherit' : 'pipe'
  try {
    const runner = await createHBuilderXRunner({
      cwd: root,
      env,
    })
    const { channel, host, path: cliPath, version } = runner.resolution
    process.stdout.write(`[e2e] HBuilderX channel=${channel} version=${version} host=${host} cli=${cliPath}\n`)
    await runner.run({ args, cwd: root, env, stdio, timeoutMs })
  }
  catch (error) {
    if (stdio !== 'inherit') {
      process.stderr.write(`${formatMessage('[e2e] HBuilderX command failed in %s: %s\n%o', root, args.join(' '), error)}\n`)
    }
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
    await runHBuilderXCli(root, ['launch', 'mp-weixin', '--project', projectAlias.projectName, '--compile', 'true'], childEnv, timeoutMs)

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
    throw new Error(`[e2e] HBuilderX mp-weixin compile output did not become ready in ${timeoutMs}ms: ${outputRoots.join(', ')}`)
  }, () => runHBuilderXCli(root, ['project', 'close', '--path', projectAlias.projectPath], childEnv, timeoutMs))
}
