import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { createWatchCommandSession } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'
import { waitFor, writeWatchedFilePreserveEol } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { createProject, readOutput, readProbeDeclarations } from './issue-1214/project'

const multiples: Record<string, number> = {
  '.w-32': 32,
  '.h-32': 32,
  '.p-4': 4,
  '.mt-4': 4,
  '.gap-4': 4,
  '.-mt-4': -4,
  '.p-0_d5': 0.5,
  '.-mt-0_d5': -0.5,
}

function authorSource(phase: string, override: boolean) {
  return `.scope { --issue-1214-author-phase: ${phase}; ${override ? '--spacing: 2rpx;' : ''} }\n`
}

it('Issue #1214 同一微信 watch 进程按 author.css 内容和导入关系重新判断静态值', async () => {
  const project = await createProject()
  const mainFile = path.join(project.root, 'src', 'main.ts')
  const authorFile = path.join(project.root, 'src', 'author.css')
  const originalMain = await readFile(mainFile, 'utf8')
  const withAuthorImport = `${originalMain}\nimport './author.css'\n`
  // 先放置未进入模块图的样式，验证未导入文件不会污染当前输出。
  await writeFile(authorFile, authorSource('initial-file', true))
  const session = await createWatchCommandSession(project.root, ['exec', process.execPath, project.uniBin, '-p', 'mp-weixin'], { quietSass: true }, {
    ...project.env,
    NODE_ENV: 'development',
    WEAPP_TW_HMR_TIMING: '0',
  })
  const startedAt = session.startedAt ?? Date.now()
  const pid = session.child.pid
  const snapshots: Record<string, unknown> = {}
  let lastObserved = ''

  async function verify(phase: string, since: number, dynamic: boolean, authorPhase?: string) {
    try {
      await waitFor(async () => {
        if (session.lastCompileSuccessAt() < since) {
          return false
        }
        const { css, wxml } = await readOutput(project)
        const declarations = readProbeDeclarations(css)
        const authorPhases = [...css.matchAll(/--issue-1214-author-phase:\s*([\w-]+)/g)].map(match => match[1])
        const hasOverride = /--spacing:\s*2rpx/.test(css)
        lastObserved = JSON.stringify({ declarations, authorPhases, hasOverride, wxml })
        if (!wxml.includes('issue-1214-initial')) {
          return false
        }
        if (authorPhase ? !authorPhases.length || authorPhases.some(value => value !== authorPhase) : authorPhases.length > 0) {
          return false
        }
        if (hasOverride !== dynamic || Object.keys(declarations).length !== Object.keys(multiples).length) {
          return false
        }
        for (const [selector, multiple] of Object.entries(multiples)) {
          const values = declarations[selector]
          const expected = dynamic ? `calc(var(--spacing)*${multiple})` : `${multiple}rpx`
          // 所有同选择器声明都必须更新，不能让新的 calc 遮住遗留静态 fallback。
          if (!values?.length || values.some(value => value !== expected)) {
            return false
          }
        }
        snapshots[phase] = { declarations, authorPhase: authorPhases[0] ?? null, hasOverride }
        return true
      }, {
        timeoutMs: 60_000,
        pollMs: 100,
        message: `[issue-1214] ${phase} 未按当前 author.css 模块图恢复 calc 或静态值`,
        onTick: session.ensureRunning,
      })
      expect(pid).toBeTypeOf('number')
      expect(session.child.pid).toBe(pid)
      session.ensureRunning()
    }
    catch (error) {
      throw new Error(`${String(error)}\n最近产物: ${lastObserved}\n编译器日志:\n${session.logs()}`, { cause: error })
    }
  }

  async function update(file: string, source: string) {
    const since = Math.max(Date.now(), session.lastCompileSuccessAt() + 1)
    await writeWatchedFilePreserveEol(file, source, await readFile(file, 'utf8'))
    return since
  }

  try {
    await verify('unimported-file', startedAt, false)

    const importedAt = await update(mainFile, withAuthorImport)
    await verify('import-added', importedAt, true, 'initial-file')

    const clearedAt = await update(authorFile, authorSource('cleared', false))
    await verify('override-removed', clearedAt, false, 'cleared')

    const restoredAt = await update(authorFile, authorSource('restored', true))
    await verify('override-restored', restoredAt, true, 'restored')

    // 保留 author.css 中的覆盖，只删除模块导入，验证失效依据来自构建图。
    const detachedAt = await update(mainFile, originalMain)
    await verify('import-removed', detachedAt, false)

    const reimportedAt = await update(mainFile, withAuthorImport)
    await verify('import-restored', reimportedAt, true, 'restored')

    const finalClearedAt = await update(authorFile, authorSource('final-cleared', false))
    await verify('override-final-removed', finalClearedAt, false, 'final-cleared')

    await expect(`${JSON.stringify(snapshots, null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1214/author-watch.json')
  }
  finally {
    await session.stop()
    await project.close()
  }
}, 450_000)
