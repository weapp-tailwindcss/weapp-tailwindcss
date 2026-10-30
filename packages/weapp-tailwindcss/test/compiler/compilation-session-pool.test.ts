import { describe, expect, it, vi } from 'vitest'
import { CompilationSessionPool, createCompilationDependencyChanges } from '@/compiler'

const componentScope = { id: 'pages/index.css', kind: 'component' as const }

describe('CompilationSessionPool', () => {
  it('owns candidates and validation for one scope revision', async () => {
    const pool = new CompilationSessionPool()
    expect(pool.getRegisteredScopeDependencyRevision(componentScope.id)).toBeUndefined()
    const compile = vi.fn(async (compilation) => ({
      classSet: compilation.candidates,
      css: '.generated{}',
    }))
    const first = await pool.run({
      scope: componentScope,
      outputId: 'pages/index.css',
      sources: [{ id: '/src/app.css', kind: 'css', candidates: ['p-4'], content: '@import "tailwindcss";' }],
    }, compile)
    const second = await pool.run({
      scope: componentScope,
      outputId: 'pages/index.css',
      sources: [{ id: '/src/app.css', kind: 'css', candidates: ['text-red-500'], content: '@import "tailwindcss";' }],
    }, compile)

    expect(first.compilation.revision).toBe(1)
    expect(first.compilation.validatedClassSet).toEqual(new Set(['p-4']))
    expect(second.compilation.revision).toBe(2)
    expect(second.compilation.candidates).toEqual(new Set(['text-red-500']))
    expect(second.compilation.candidatesBySource.get('/src/app.css')).toEqual(new Set(['text-red-500']))
    expect(second.compilation.invalidatedScopes).toEqual(new Set([componentScope.id]))
    expect(pool.getRegisteredScopeDependencyRevision(componentScope.id)).toBe(0)
    pool.invalidateScope(componentScope.id)
    expect(pool.getRegisteredScopeDependencyRevision(componentScope.id)).toBeUndefined()
    await pool.dispose()
  })

  it('invalidates compiled proof across dependency changes, scope recreation and pool replacement', async () => {
    const request = {
      scope: componentScope,
      outputId: 'pages/index.css',
      sources: [{ id: '/src/label.css', kind: 'css' as const, dependencies: [{ id: '/src/theme.css', kind: 'css' as const }] }],
    }
    const compile = async () => undefined
    const pool = new CompilationSessionPool()
    expect(pool.getRegisteredScopeVersion(componentScope.id)).toBeUndefined()
    await pool.run(request, compile)
    const initial = pool.getRegisteredScopeVersion(componentScope.id)
    expect(initial).toBeDefined()
    pool.recordDependencyChanges(createCompilationDependencyChanges(['/src/theme.css']))
    expect(pool.getRegisteredScopeVersion(componentScope.id)).not.toBe(initial)
    pool.invalidateScope(componentScope.id)
    expect(pool.getRegisteredScopeVersion(componentScope.id)).toBeUndefined()
    await pool.run(request, compile)
    expect(pool.getRegisteredScopeDependencyRevision(componentScope.id)).toBe(0)
    const recreated = pool.getRegisteredScopeVersion(componentScope.id)
    expect(recreated).toBeDefined()
    expect(recreated).not.toBe(initial)
    const replacement = new CompilationSessionPool()
    await replacement.run(request, compile)
    expect(replacement.getRegisteredScopeVersion(componentScope.id)).not.toBe(recreated)
    await pool.dispose()
    await replacement.dispose()
    expect(pool.getRegisteredScopeVersion(componentScope.id)).toBeUndefined()
  })

  it('isolates scopes and ignores stale revision commits without blocking generation', async () => {
    const pool = new CompilationSessionPool()
    let releaseFirst: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const first = pool.run({
      scope: componentScope,
      outputId: 'pages/index.css',
      sources: [{ id: '/src/app.css', kind: 'css', candidates: ['p-4'] }],
    }, async compilation => {
      await pending
      return {
        classSet: compilation.candidates,
        dependenciesBySource: [[
          '/src/app.css',
          [{ id: '/src/stale.config.js', kind: 'config' as const }],
        ]] as const,
      }
    })
    const secondCompile = vi.fn(async compilation => ({
      classSet: compilation.candidates,
      dependenciesBySource: [[
        '/src/app.css',
        [{ id: '/src/current.config.js', kind: 'config' as const }],
      ]] as const,
    }))
    const second = pool.run({
      scope: componentScope,
      outputId: 'pages/index.css',
      sources: [{ id: '/src/app.css', kind: 'css', candidates: ['m-2'] }],
    }, secondCompile)
    const global = await pool.run({
      scope: { id: 'app.css', kind: 'global' },
      outputId: 'app.css',
      sources: [{ id: '/src/global.css', kind: 'css', candidates: ['text-lg'] }],
    }, async compilation => ({ classSet: compilation.candidates }))

    await vi.waitFor(() => {
      expect(secondCompile).toHaveBeenCalledTimes(1)
    })
    expect(global.compilation.candidates).toEqual(new Set(['text-lg']))
    releaseFirst?.()
    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult.committed).toBe(false)
    expect(secondResult.committed).toBe(true)
    expect(secondResult.compilation.graphNodes).toContainEqual(expect.objectContaining({
      id: 'dependency:/src/current.config.js',
    }))
    expect(secondResult.compilation.graphNodes).not.toContainEqual(expect.objectContaining({
      id: 'dependency:/src/stale.config.js',
    }))
  })

  it('waits for active executions before disposing a scope session', async () => {
    const pool = new CompilationSessionPool()
    let releaseCompile: (() => void) | undefined
    const compilePending = new Promise<void>((resolve) => {
      releaseCompile = resolve
    })
    const execution = pool.run({
      scope: componentScope,
      outputId: 'pages/index.css',
      sources: [{ id: '/src/app.css', kind: 'css', candidates: ['p-4'] }],
    }, async compilation => {
      await compilePending
      return { classSet: compilation.candidates }
    })

    await vi.waitFor(() => {
      expect(pool.size).toBe(1)
    })
    let disposed = false
    const disposal = pool.dispose().then(() => {
      disposed = true
    })
    await Promise.resolve()
    expect(disposed).toBe(false)

    releaseCompile?.()
    await expect(execution).resolves.toMatchObject({ committed: false })
    await disposal
    expect(disposed).toBe(true)
    expect(() => pool.run({
      scope: componentScope,
      outputId: 'pages/index.css',
      sources: [],
    }, async () => undefined)).toThrow('已释放')
  })

  it('retains deleted candidates only when the scope requests it', async () => {
    const pool = new CompilationSessionPool()
    await pool.run({
      scope: componentScope,
      outputId: 'pages/index.css',
      sources: [{ id: '/src/app.css', kind: 'css', candidates: ['p-4'] }],
      preserveDeletedCss: true,
    }, async compilation => ({ classSet: compilation.candidates }))
    const retained = await pool.run({
      scope: componentScope,
      outputId: 'pages/index.css',
      sources: [{ id: '/src/app.css', kind: 'css', candidates: ['m-2'] }],
      preserveDeletedCss: true,
    }, async compilation => ({ classSet: compilation.candidates }))
    const removed = await pool.run({
      scope: componentScope,
      outputId: 'pages/index.css',
      sources: [{ id: '/src/app.css', kind: 'css', candidates: ['m-2'] }],
      preserveDeletedCss: false,
    }, async compilation => ({ classSet: compilation.candidates }))

    expect(retained.compilation.candidates).toEqual(new Set(['p-4', 'm-2']))
    expect(retained.compilation.validatedClassSet).toEqual(new Set(['p-4', 'm-2']))
    expect(removed.compilation.candidates).toEqual(new Set(['m-2']))
    expect(removed.compilation.validatedClassSet).toEqual(new Set(['m-2']))
  })

  it('tracks explicit source dependencies and invalidates changed dependency sets', async () => {
    const pool = new CompilationSessionPool()
    const first = await pool.run({
      scope: componentScope,
      outputId: 'pages/index.css',
      sources: [{
        id: '/src/app.css',
        kind: 'css',
        candidates: ['p-4'],
        dependencies: [
          { id: '/src/theme.css', kind: 'css' },
          { id: '/tailwind.config.js', kind: 'config' },
        ],
      }],
    }, async compilation => ({ classSet: compilation.candidates }))
    const second = await pool.run({
      scope: componentScope,
      outputId: 'pages/index.css',
      sources: [{
        id: '/src/app.css',
        kind: 'css',
        candidates: ['p-4'],
        dependencies: [
          { id: '/src/theme.css', kind: 'css' },
          { id: '/tailwind.config.ts', kind: 'config' },
        ],
      }],
    }, async compilation => ({ classSet: compilation.candidates }))

    expect(first.compilation.graphNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dependency:/src/theme.css', kind: 'css' }),
      expect.objectContaining({ id: 'dependency:/tailwind.config.js', kind: 'config' }),
    ]))
    expect(first.compilation.graphEdges).toEqual(expect.arrayContaining([
      {
        from: 'source:/src/app.css',
        to: 'dependency:/src/theme.css',
        kind: 'depends-on',
      },
      {
        from: 'source:/src/app.css',
        to: 'asset:pages/index.css',
        kind: 'emits-to',
      },
    ]))
    expect(second.compilation.invalidatedScopes).toEqual(new Set([componentScope.id]))
  })

  it('commits generated dependencies to the active revision and replaces previous results', async () => {
    const pool = new CompilationSessionPool()
    const request = {
      scope: componentScope,
      outputId: 'pages/index.css',
      sources: [{ id: '/src/app.css', kind: 'css' as const, candidates: ['p-4'] }],
    }
    const first = await pool.run(request, async compilation => ({
      classSet: compilation.candidates,
      dependenciesBySource: [[
        '/src/app.css',
        [{ id: '/src/plugin-a.js', kind: 'config' as const }],
      ]] as const,
    }))
    const changes = createCompilationDependencyChanges(['/src/plugin-a.js'])
    expect(pool.getAffectedScopes(changes)).toEqual(new Set([componentScope.id]))
    expect(pool.getScopeDependencyRevision(componentScope.id)).toBe(0)
    expect(pool.recordDependencyChanges(changes)).toEqual(new Set([componentScope.id]))
    expect(pool.getScopeDependencyRevision(componentScope.id)).toBe(1)
    const second = await pool.run({ ...request, changes }, async compilation => ({
      classSet: compilation.candidates,
      dependenciesBySource: [[
        '/src/app.css',
        [{ id: '/src/plugin-b.js', kind: 'config' as const }],
      ]] as const,
    }))

    expect(first.compilation.revision).toBe(1)
    expect(first.compilation.graphEdges).toContainEqual({
      from: 'source:/src/app.css',
      to: 'dependency:/src/plugin-a.js',
      kind: 'depends-on',
    })
    expect(second.compilation.revision).toBe(2)
    expect(second.compilation.invalidatedScopes).toEqual(new Set([componentScope.id]))
    expect(pool.getScopeDependencyRevision(componentScope.id)).toBe(1)
    expect(second.compilation.graphNodes).toContainEqual(expect.objectContaining({
      id: 'dependency:/src/plugin-b.js',
      kind: 'config',
    }))
    expect(second.compilation.graphNodes).not.toContainEqual(expect.objectContaining({
      id: 'dependency:/src/plugin-a.js',
    }))
  })
})
