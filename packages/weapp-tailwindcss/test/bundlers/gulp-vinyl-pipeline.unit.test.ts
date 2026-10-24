import { Buffer } from 'node:buffer'
import path from 'node:path'
import process from 'node:process'
import Vinyl from 'vinyl'
import { describe, expect, it } from 'vitest'
import { createVinylTransform } from '@/bundlers/gulp/vinyl-transform'
import { runCompilerOwnerActivity, runCompilerOwnerExternalActivity } from '@/compiler/compiler-owner-state'
import { disposeCompilerOwner } from '@/compiler/owner-lifecycle'

function file(index: number) {
  return new Vinyl({ cwd: process.cwd(), base: process.cwd(), path: path.resolve(`${index}.css`), contents: Buffer.from('.p-4{}') })
}

function transform(owner: object, handler: (file: Vinyl) => Promise<void>) {
  return createVinylTransform('test', handler, undefined, (operation, forwarded) => {
    const run = forwarded ? runCompilerOwnerActivity : runCompilerOwnerExternalActivity
    return run(owner, operation)
  })
}

describe('Gulp 受管 pipe 的任务所有权', () => {
  it('关闭时继续同一已接受文件的后续 stage，拒绝 callback 重入的原始入口', async () => {
    const owner = {}
    const gate = Promise.withResolvers<void>()
    const nextGate = Promise.withResolvers<void>()
    const nextEntered = Promise.withResolvers<void>()
    const events: string[] = []
    const source = transform(owner, async () => {
      await gate.promise
    })
    const destination = transform(owner, async () => {
      events.push('next-stage')
      nextEntered.resolve()
      await nextGate.promise
    })
    source.pipe(destination).resume()
    source.on('error', () => {})
    const reentered = Promise.withResolvers<Error | null | undefined>()
    const input = file(0)
    source.write(input, () => source.write(input, reentered.resolve))
    const closing = disposeCompilerOwner(owner, { beforeDispose: () => {
      events.push('closed')
    } })
    gate.resolve()
    await nextEntered.promise
    expect(events).toEqual(['next-stage'])
    expect((await reentered.promise)?.message).toMatch(/释放/)
    nextGate.resolve()
    await closing
    expect(events).toEqual(['next-stage', 'closed'])
    destination.end()
  })

  it('背压期间已缓冲的输出保留原任务，恢复读取后所有 stage 完成再关闭', async () => {
    const owner = {}
    const gate = Promise.withResolvers<void>()
    const events: string[] = []
    const source = transform(owner, async () => {})
    const destination = transform(owner, async (input) => {
      await gate.promise
      events.push(input.stem)
    })
    source.pipe(destination).resume()
    const total = 64
    const writes = Array.from({ length: total }, (_, index) => new Promise<void>((resolve, reject) => {
      source.write(file(index), error => error ? reject(error) : resolve())
    }))
    source.end()
    const closing = disposeCompilerOwner(owner, { beforeDispose: () => {
      events.push('closed')
    } })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(events).toEqual([])
    expect(source.readableLength).toBeGreaterThan(0)
    gate.resolve()
    await Promise.all([...writes, closing])
    expect(events).toEqual([...Array.from({ length: total }, (_, index) => String(index)), 'closed'])
  })

  it('unpipe 后可以释放积压输出，原下游已接受的任务仍会排空', async () => {
    const owner = {}
    const gate = Promise.withResolvers<void>()
    let completed = 0
    const source = transform(owner, async () => {})
    const destination = transform(owner, async () => {
      await gate.promise
      completed++
    })
    source.pipe(destination).resume()
    const writes = Array.from({ length: 64 }, (_, index) => new Promise<void>((resolve, reject) => {
      source.write(file(index), error => error ? reject(error) : resolve())
    }))
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(source.readableLength).toBeGreaterThan(0)
    source.unpipe(destination)
    source.resume()
    const closing = disposeCompilerOwner(owner)
    gate.resolve()
    await Promise.all([...writes, closing])
    expect(completed).toBeGreaterThan(0)
    expect(completed).toBeLessThan(64)
    source.end()
    destination.end()
  })

  it('不同实例的 pipe 不能借用上游租约复活已关闭的下游', async () => {
    const first = {}
    const second = {}
    const gate = Promise.withResolvers<void>()
    let transformed = false
    const source = transform(first, async () => {
      await gate.promise
    })
    const destination = transform(second, async () => {
      transformed = true
    })
    const failed = new Promise<Error>(resolve => destination.once('error', resolve))
    source.pipe(destination).resume()
    source.write(file(0))
    await disposeCompilerOwner(second)
    const closing = disposeCompilerOwner(first)
    gate.resolve()
    expect((await failed).message).toContain('已释放')
    await closing
    expect(transformed).toBe(false)
    source.end()
  })
})
