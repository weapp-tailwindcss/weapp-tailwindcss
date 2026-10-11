import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { waitFor } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { build, classes, createProject, pageSource, readOutput, themeSource } from './issue-1241/project'
import { save } from './issue-1241/support'
import { watchSession } from './issue-1241/watch-session'

it('Issue 1241 同进程双入口主题、source、导入及候选变化与干净构建一致', async () => {
  const project = await createProject('watch', { secondTheme: '1rpx', preserveDeletedCss: false })
  const author = path.join(project.root, 'src', 'second.css')
  await writeFile(path.join(project.root, 'src', 'author.css'), '.scope{--spacing:3rpx;--author-phase:active}')
  await writeFile(path.join(project.root, 'src', 'alternate.vue'), pageSource('alternate', 'p-4'))
  const main = path.join(project.root, 'src', 'main.ts')

  const session = watchSession(project)
  const pid = session.child.pid
  const results = []
  let since = Date.now()
  let candidates = classes
  let pageStyle = ''
  const phases = [
    { name: 'initial', width: '32rpx' },
    { name: 'theme-2', width: 'calc(var(--spacing)*32)', file: author, source: themeSource({ spacing: '2rpx' }) },
    { name: 'remove', width: undefined, candidates: 'p-4' },
    { name: 'restore', width: 'calc(var(--spacing)*32)', candidates: classes },
    { name: 'source-empty', width: '32rpx', file: author, source: themeSource({ spacing: '2rpx' }).replace('@source \'./pages/index.vue\';', '') },
    { name: 'detach', width: '32rpx', file: main, source: project.main.replace('import \'./second.css\'', '') },
    { name: 'reimport', width: '32rpx', file: main, source: project.main },
    { name: 'source-restored', width: 'calc(var(--spacing)*32)', file: author, source: themeSource({ spacing: '2rpx' }) },
    { name: 'themes-match', width: '64rpx', file: project.themeFile, source: themeSource({ spacing: '2rpx' }) },
    { name: 'author-add', width: 'calc(var(--spacing)*32)', file: main, source: `${project.main}\nimport './author.css'\n` },
    { name: 'author-remove', width: '64rpx', file: main, source: project.main },
    { name: 'first-source-empty', width: '64rpx', file: project.themeFile, source: themeSource({ spacing: '2rpx' }).replace('@source \'./pages/index.vue\';', '') },
    { name: 'source-retarget', width: undefined, file: author, source: themeSource({ spacing: '2rpx' }).replace('./pages/index.vue', './alternate.vue') },
    { name: 'alternate-add', width: '64rpx', file: path.join(project.root, 'src', 'alternate.vue'), source: pageSource('alternate-add', 'w-32 p-4') },
    { name: 'alternate-remove', width: undefined, file: path.join(project.root, 'src', 'alternate.vue'), source: pageSource('alternate-remove', 'p-4') },
    { name: 'source-retarget-restore', width: '64rpx', file: author, source: themeSource({ spacing: '2rpx' }) },
    { name: 'page-author-add', width: 'calc(var(--spacing)*32)', pageStyle: '<style>.scope{--spacing:3rpx}</style>' },
    { name: 'page-author-remove', width: '64rpx', pageStyle: '' },
    { name: 'page-author-restore', width: 'calc(var(--spacing)*32)', pageStyle: '<style>.scope{--spacing:3rpx}</style>' },
    { name: 'page-author-empty', width: '64rpx', pageStyle: '<style></style>' },
  ]
  try {
    for (const phase of phases) {
      since = Date.now()
      if (phase.file) {
        await writeFile(phase.file, phase.source!)
      }
      if (phase.candidates) {
        candidates = phase.candidates
      }
      if (phase.pageStyle !== undefined) {
        pageStyle = phase.pageStyle
      }
      const marker = `watch-${phase.name}`
      await writeFile(project.pageFile, `${pageSource(marker, candidates)}${pageStyle}`)
      let output: Awaited<ReturnType<typeof readOutput>> | undefined
      await waitFor(async () => {
        if (session.lastCompileSuccessAt() < since) {
          return false
        }
        output = await readOutput(project).catch(() => undefined)
        if (!output?.wxml.includes(marker)) {
          return false
        }
        const widths = output.declarations['.w-32']
        return phase.width ? !!widths?.length && widths.every(value => value === phase.width) : !widths
      }, { timeoutMs: 60_000, pollMs: 100, message: `Issue 1241 watch ${phase.name} 未完成`, onTick: session.ensureRunning })
      expect(session.child.pid).toBe(pid)
      expect(output!.css).not.toContain('deferred-source:')
      const cleanRoot = path.join(project.root, `clean-${phase.name}`)
      await build(project, `clean-${phase.name}`, cleanRoot)
      const clean = await readOutput(project, cleanRoot)
      expect(Object.keys(output!.declarations).sort()).toEqual(Object.keys(clean.declarations).sort())
      for (const [selector, values] of Object.entries(clean.declarations)) {
        // 开发产物可重复输出同值别名；逐条核对，仍拒绝任何旧值或不同的 fallback。
        expect(new Set(values).size).toBe(1)
        for (const value of output!.declarations[selector]!) {
          expect(value, selector).toBe(values[0])
        }
      }
      const authorValues = (css: string) => [...css.matchAll(/--author-phase:\s*([\w-]+)/g)].map(match => match[1])
      expect(authorValues(output!.css)).toEqual(authorValues(clean.css))
      const entry = { phase: phase.name, pid, declarations: output!.declarations, author: authorValues(output!.css) }
      results.push(entry)
      await save(`workspace/watch/${phase.name}.json`, { watch: output, clean })
      await save('watch.json', results)
    }
    await expect(JSON.stringify(results.map(({ pid: _pid, ...entry }) => entry), null, 2)).toMatchFileSnapshot('./__snapshots__/issue-1241/watch.json')
  }
  finally {
    await save('workspace/watch/watch.log', session.logs())
    await save('workspace/watch/final-output.json', await readOutput(project).catch(error => ({ error: String(error) })))
    await save('workspace/watch/final-source.vue', await readFile(project.pageFile, 'utf8'))
    await session.stop()
  }
}, 600_000)
