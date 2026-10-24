import type { SourceCandidateCollectorOptions } from '@/project-sources/candidates'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSourceCandidateCollector } from '@/project-sources/candidates'
import * as fileIo from '@/project-sources/candidates/file-io'

const methods = ['sync', 'syncSource', 'syncCss', 'merge', 'syncModuleSource', 'syncCurrentSource'] as const

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createExtractor(prefix: string) {
  return vi.fn((source: string) => [`${prefix}:${source}`])
}

function createDelayedCollector(label: string) {
  const gate = deferred<void>()
  const oldSource = `${label}:old`
  const newSource = `${label}:new`
  const extractor = vi.fn(async (source: string) => {
    if (source === oldSource) {
      await gate.promise
      return ['old-candidate']
    }
    return ['new-candidate']
  })
  return { collector: createSourceCandidateCollector({ extractor }), extractor, gate, oldSource, newSource }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('source candidate extractor cache identity', () => {
  it('isolates closures created from the same function body with different captured values', async () => {
    const firstExtractor = createExtractor('first')
    const secondExtractor = createExtractor('second')
    const first = createSourceCandidateCollector({ extractor: firstExtractor })
    const second = createSourceCandidateCollector({ extractor: secondExtractor })
    const source = 'same-body-closure-content'

    await first.sync(path.resolve('first.html'), source)
    await second.sync(path.resolve('second.html'), source)

    expect(first.values()).toEqual(new Set([`first:${source}`]))
    expect(second.values()).toEqual(new Set([`second:${source}`]))
    expect(firstExtractor).toHaveBeenCalledTimes(1)
    expect(secondExtractor).toHaveBeenCalledTimes(1)
  })

  it('keeps interleaved collectors independent for the same source and file identities', async () => {
    const first = createSourceCandidateCollector({ extractor: createExtractor('left') })
    const second = createSourceCandidateCollector({ extractor: createExtractor('right') })
    const file = path.resolve('interleaved.html')

    await first.sync(file, 'interleaved-alpha')
    await second.sync(file, 'interleaved-alpha')
    await second.sync(file, 'interleaved-beta')
    await first.sync(file, 'interleaved-beta')

    expect(first.values()).toEqual(new Set(['left:interleaved-beta']))
    expect(second.values()).toEqual(new Set(['right:interleaved-beta']))
    first.remove(file)
    expect(first.values()).toEqual(new Set())
    expect(second.values()).toEqual(new Set(['right:interleaved-beta']))
  })

  it('preserves content cache hits across collectors that use the same function object', async () => {
    const extractor = createExtractor('shared')
    const options: SourceCandidateCollectorOptions = { extractor }
    const first = createSourceCandidateCollector(options)
    const second = createSourceCandidateCollector(options)
    const source = 'same-function-global-cache'
    const file = path.resolve('shared.html')

    await first.sync(file, source)
    await second.merge(path.resolve('other.html'), source)
    first.remove(file)
    second.clear()
    await first.sync(file, source)

    expect(extractor).toHaveBeenCalledTimes(1)
    expect(first.values()).toEqual(new Set([`shared:${source}`]))
  })
})

describe('source candidate asynchronous ownership', () => {
  it.each(methods)('%s cannot revive removed work after a new task with the same id completes', async (method) => {
    const { collector, extractor, gate, oldSource, newSource } = createDelayedCollector(`${method}:remove`)
    const file = path.resolve(`${method}-remove.html`)
    const oldTask = collector[method](file, oldSource)
    try {
      expect(extractor).toHaveBeenCalledTimes(1)
      collector.remove(file)
      await collector[method](file, newSource)
      expect(collector.values()).toEqual(new Set(['new-candidate']))
    }
    finally {
      gate.resolve()
      await oldTask
    }

    expect(collector.values()).toEqual(new Set(['new-candidate']))
    expect(collector.source(file)).toBe(newSource)
  })

  it.each(methods)('%s cannot restore candidates or source after clear', async (method) => {
    const { collector, gate, oldSource } = createDelayedCollector(`${method}:clear`)
    const file = path.resolve(`${method}-clear.html`)
    const oldTask = collector[method](file, oldSource)
    collector.clear()
    const clearedRevision = collector.getRevision()
    gate.resolve()
    await oldTask

    expect(collector.values()).toEqual(new Set())
    expect(collector.source(file)).toBeUndefined()
    expect([...collector.sources()]).toEqual([])
    expect(collector.getRevision()).toBe(clearedRevision)
  })

  it.each(methods)('%s gives the newest request in its layer commit ownership', async (method) => {
    const { collector, gate, oldSource, newSource } = createDelayedCollector(`${method}:latest`)
    const file = path.resolve(`${method}-latest.html`)
    const oldTask = collector[method](file, oldSource)
    try {
      await collector[method](file, newSource)
    }
    finally {
      gate.resolve()
      await oldTask
    }

    expect(collector.values()).toEqual(new Set(['new-candidate']))
    expect(collector.source(file)).toBe(newSource)
  })

  it.each(methods)('%s preserves valid state when extraction fails and accepts a later update', async (method) => {
    const { collector, gate, oldSource, newSource } = createDelayedCollector(`${method}:failure`)
    const file = path.resolve(`${method}-failure.html`)
    await collector[method](file, newSource)
    const snapshot = collector.snapshot()
    const revision = collector.getRevision()
    const task = collector[method](file, oldSource)
    const error = new Error('failed extraction')
    gate.reject(error)

    await expect(task).rejects.toBe(error)
    expect(collector.snapshot()).toEqual(snapshot)
    expect(collector.getRevision()).toBe(revision)
    await collector[method](file, `${newSource}:retry`)
    expect(collector.source(file)).toBe(`${newSource}:retry`)
  })

  it('keeps a newer pending task revocable after an older task finishes', async () => {
    const first = deferred<void>()
    const second = deferred<void>()
    const collector = createSourceCandidateCollector({
      extractor: async (source) => {
        if (source === 'first') {
          await first.promise
        }
        if (source === 'second') {
          await second.promise
        }
        return [source]
      },
    })
    const file = path.resolve('pending-owner.html')
    const firstTask = collector.sync(file, 'first')
    const secondTask = collector.sync(file, 'second')
    first.resolve()
    await firstTask
    collector.remove(file)
    await collector.sync(file, 'latest')
    second.resolve()
    await secondTask
    expect(collector.values()).toEqual(new Set(['latest']))
  })

  it.each(['syncModuleSource', 'syncCurrentSource'] as const)('%s returns no changes after its task is revoked', async (method) => {
    const { collector, gate, oldSource } = createDelayedCollector(`${method}:result`)
    const task = collector[method](path.resolve(`${method}-result.html`), oldSource)
    collector.clear()
    gate.resolve()
    expect(await task).toEqual(method === 'syncModuleSource'
      ? new Set()
      : { addedCandidates: new Set(), removedCandidates: new Set() })
  })

  it('keeps transform and CSS tasks for the same source independent', async () => {
    const { collector, gate, oldSource, newSource } = createDelayedCollector('different-layers')
    const file = path.resolve('different-layers.html')
    const transformTask = collector.merge(file, oldSource)
    try {
      await collector.syncCss(file, newSource)
    }
    finally {
      gate.resolve()
      await transformTask
    }

    expect(collector.values()).toEqual(new Set(['old-candidate', 'new-candidate']))
    expect(collector.snapshot().transformSourceById).toEqual([[file, oldSource]])
    expect(collector.snapshot().cssSourceById).toEqual([[file, newSource]])
  })

  it.each([
    '/source-owner/page.html',
    String.raw`C:\source-owner\page.html`,
    String.raw`C:\page.html`,
    'relative-owner/page.html',
  ])('revokes normalized source identity %s across request suffixes', async (file) => {
    const { collector, gate, oldSource, newSource } = createDelayedCollector(`normalized:${file}`)
    const oldTask = collector.sync(`${file}?old`, oldSource)
    try {
      collector.remove(`${file}#remove`)
      await collector.sync(file, newSource)
    }
    finally {
      gate.resolve()
      await oldTask
    }
    expect(collector.values()).toEqual(new Set(['new-candidate']))
    expect(collector.source(file)).toBe(newSource)
  })

  it.each(['syncFile', 'syncCurrentFile'] as const)('%s cannot register an older read after remove', async (method) => {
    const read = deferred<string>()
    vi.spyOn(fileIo, 'readSourceCandidateFile').mockReturnValueOnce(read.promise)
    const extractor = createExtractor(`read:${method}`)
    const collector = createSourceCandidateCollector({ extractor })
    const file = path.resolve(`${method}-read.html`)
    const oldTask = collector[method](file)
    collector.remove(file)
    await collector.sync(file, 'new-read-source')
    read.resolve('old-read-source')
    await oldTask

    expect(collector.source(file)).toBe('new-read-source')
    expect(collector.values()).toEqual(new Set([`read:${method}:new-read-source`]))
    expect(extractor).toHaveBeenCalledTimes(1)
  })

  it.each(['syncFile', 'syncCurrentFile'] as const)('%s cannot remove a new source after an older read fails', async (method) => {
    const read = deferred<string>()
    vi.spyOn(fileIo, 'readSourceCandidateFile').mockReturnValueOnce(read.promise)
    const collector = createSourceCandidateCollector({ extractor: createExtractor(`missing:${method}`) })
    const file = path.resolve(`${method}-missing.html`)
    const oldTask = collector[method](file)
    collector.remove(file)
    await collector.sync(file, 'new-missing-source')
    read.reject(Object.assign(new Error('missing old source'), { code: 'ENOENT' }))
    await oldTask

    expect(collector.source(file)).toBe('new-missing-source')
    expect(collector.values()).toEqual(new Set([`missing:${method}:new-missing-source`]))
  })
})
