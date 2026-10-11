import { afterEach, describe, expect, it } from 'vitest'
import { FrameworkCompilerSession } from '@/compiler'
import { resolveTailwindV4Source } from '@/generator'

const source = resolveTailwindV4Source({
  base: process.cwd(),
  css: '@theme { --spacing: 0.25rem; } @tailwind utilities;',
})

describe('FrameworkCompilerSession', () => {
  const sessions: FrameworkCompilerSession[] = []

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map(session => session.dispose()))
  })

  it('为不同 scope/source 生成稳定 opaque root 并合并 snapshot', async () => {
    const session = new FrameworkCompilerSession({} as any)
    sessions.push(session)
    const [main, subpackage] = await Promise.all([
      session.generate('scope:main?query', 'module\\main.css?inline', await source, {
        candidates: ['p-4'],
        scanSources: false,
        target: 'weapp',
      }),
      session.generate('scope:sub', 'module/main.css', await source, {
        candidates: ['m-2'],
        scanSources: false,
        target: 'weapp',
      }),
    ])

    expect(main.snapshot.roots[0]?.id).toContain('framework:')
    expect(main.snapshot.roots[0]?.id).not.toContain('scope:main')
    expect(main.snapshot.roots[0]?.id).not.toBe(subpackage.snapshot.roots[0]?.id)
    const merged = session.mergeSnapshots([main.snapshot, subpackage.snapshot])
    expect(merged.classSet.has('p-4')).toBe(true)
    expect(merged.classSet.has('m-2')).toBe(true)

    await session.syncScope('scope:main?query', [])
    await session.removeScope('scope:sub')
  })

  it('释放后拒绝新的生成任务，并且 dispose 幂等', async () => {
    const session = new FrameworkCompilerSession({} as any)
    await session.dispose()
    await session.dispose()
    await expect(session.generate('scope', 'source', await source, {
      candidates: ['p-4'],
      scanSources: false,
    })).rejects.toThrow('已释放')
  })
})
