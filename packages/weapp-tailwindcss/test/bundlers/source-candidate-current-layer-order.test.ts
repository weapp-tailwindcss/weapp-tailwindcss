import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSourceCandidateCollector } from '@/project-sources/candidates'
import * as fileIo from '@/project-sources/candidates/file-io'

const layers = ['merge', 'syncCss', 'syncModuleSource'] as const

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function fixture(...blockedSources: string[]) {
  const gates = new Map(blockedSources.map(source => [source, deferred()]))
  const collector = createSourceCandidateCollector({
    async extractor(source) {
      await gates.get(source)?.promise
      return [source]
    },
  })
  return { collector, gates, file: path.resolve('current-layer-order.html') }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('当前作者来源按接收顺序替换其他候选层', () => {
  it.each(layers)('当前来源成功后，较早的 %s 提取不能恢复旧候选', async (layer) => {
    const { collector, gates, file } = fixture('old-layer')
    const oldTask = collector[layer](file, 'old-layer')
    let committedRevision = 0
    try {
      await collector.syncCurrentSource(file, 'current-author')
      committedRevision = collector.getRevision()
    }
    finally {
      gates.get('old-layer')!.resolve()
      await oldTask
    }

    expect(collector.values()).toEqual(new Set(['current-author']))
    expect(collector.source(file)).toBe('current-author')
    expect(collector.getRevision()).toBe(committedRevision)
  })

  it.each(layers)('保留当前来源开始后已提交的 %s 层', async (layer) => {
    const { collector, gates, file } = fixture('current-author')
    const current = collector.syncCurrentSource(file, 'current-author')
    try {
      await collector[layer](file, 'newer-layer')
    }
    finally {
      gates.get('current-author')!.resolve()
    }
    const change = await current

    expect(collector.values()).toEqual(new Set(['current-author', 'newer-layer']))
    expect(change.addedCandidates).toEqual(new Set(['current-author']))
    expect(change.removedCandidates).toEqual(new Set())
  })

  it.each(layers)('保留当前来源开始后仍在提取的 %s 层', async (layer) => {
    const { collector, gates, file } = fixture('current-author', 'newer-layer')
    await collector[layer](file, 'previous-valid-layer')
    const current = collector.syncCurrentSource(file, 'current-author')
    const newer = collector[layer](file, 'newer-layer')
    try {
      gates.get('current-author')!.resolve()
      await current
      expect(collector.values()).toEqual(new Set(['current-author']))
    }
    finally {
      gates.get('current-author')!.resolve()
      gates.get('newer-layer')!.resolve()
      await Promise.allSettled([current, newer])
    }

    expect(collector.values()).toEqual(new Set(['current-author', 'newer-layer']))
  })

  it.each(layers)('较早的 %s 在当前来源等待期间提交，仍应由当前来源替换', async (layer) => {
    const { collector, gates, file } = fixture('old-layer', 'current-author')
    const oldTask = collector[layer](file, 'old-layer')
    const current = collector.syncCurrentSource(file, 'current-author')
    try {
      gates.get('old-layer')!.resolve()
      await oldTask
      expect(collector.values()).toEqual(new Set(['old-layer']))
    }
    finally {
      gates.get('old-layer')!.resolve()
      gates.get('current-author')!.resolve()
      await Promise.allSettled([oldTask, current])
    }

    expect(collector.values()).toEqual(new Set(['current-author']))
  })

  it.each(layers)('当前来源提取失败保留 %s 的有效状态与较早在途任务', async (layer) => {
    const { collector, gates, file } = fixture('old-layer', 'failed-author')
    await collector[layer](file, 'previous-valid-layer')
    const snapshot = collector.snapshot()
    const revision = collector.getRevision()
    const oldTask = collector[layer](file, 'old-layer')
    const current = collector.syncCurrentSource(file, 'failed-author')
    const failure = new Error('current author extraction failed')
    const rejected = expect(current).rejects.toBe(failure)
    gates.get('failed-author')!.reject(failure)
    try {
      await rejected
      expect(collector.snapshot()).toEqual(snapshot)
      expect(collector.getRevision()).toBe(revision)
    }
    finally {
      gates.get('old-layer')!.resolve()
      await oldTask
    }

    expect(collector.values()).toEqual(new Set(['old-layer']))
  })

  it.each(layers)('读取当前文件之前就确定顺序，保留读取期间提交的 %s', async (layer) => {
    const read = deferred<string>()
    vi.spyOn(fileIo, 'readSourceCandidateFile').mockReturnValueOnce(read.promise)
    const { collector, file } = fixture()
    const current = collector.syncCurrentFile(file)
    try {
      await collector[layer](file, 'newer-layer-during-read')
    }
    finally {
      read.resolve('current-author-from-file')
    }
    await current

    expect(collector.values()).toEqual(new Set(['current-author-from-file', 'newer-layer-during-read']))
  })

  it.each(layers)('CSS 当前来源保留独立的 %s 层', async (layer) => {
    const { collector, gates } = fixture('old-layer')
    const file = path.resolve('current-layer-order.css')
    const oldTask = collector[layer](file, 'old-layer')
    try {
      await collector.syncCurrentSource(file, 'current-css-author')
    }
    finally {
      gates.get('old-layer')!.resolve()
      await oldTask
    }

    expect(collector.values()).toEqual(new Set(['current-css-author', 'old-layer']))
  })

  it('新 transform、CSS 与 module 的提交仍可同时存在', async () => {
    const { collector, gates, file } = fixture('current-author')
    const current = collector.syncCurrentSource(file, 'current-author')
    try {
      await Promise.all(layers.map(layer => collector[layer](file, `newer-${layer}`)))
    }
    finally {
      gates.get('current-author')!.resolve()
      await current
    }

    expect(collector.values()).toEqual(new Set(['current-author', ...layers.map(layer => `newer-${layer}`)]))
  })
})
