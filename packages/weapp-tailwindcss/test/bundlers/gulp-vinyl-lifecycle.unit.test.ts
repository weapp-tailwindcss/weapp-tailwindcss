import type { Transform } from 'node:stream'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import Vinyl from 'vinyl'
import { describe, expect, it } from 'vitest'
import { createVinylTransform } from '@/bundlers/gulp/vinyl-transform'
import { runCompilerOwnerActivity, runCompilerOwnerExternalActivity } from '@/compiler/compiler-owner-state'
import { disposeCompilerOwner } from '@/compiler/owner-lifecycle'

const file = (name: string) => new Vinyl({ cwd: process.cwd(), base: process.cwd(), path: path.resolve(name), contents: Buffer.from(name) })
function write(stream: Transform, name: string, events: string[]) {
  return new Promise<void>((resolve, reject) => {
    stream.write(file(name), (error) => {
      events.push(`callback:${name}`)
      if (error) {
        reject(error)
      }
      else { resolve() }
    })
  })
}

describe('Gulp Vinyl 活动使用唯一 owner 租约', () => {
  it('关闭等待所有已接收的 buffered write、handler 和 write callback', async () => {
    const owner = {}
    const gate = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    const events: string[] = []
    const stream = createVinylTransform('test', async (input) => {
      events.push(`start:${input.stem}`)
      if (input.stem === 'first') {
        entered.resolve()
        await gate.promise
      }
      await runCompilerOwnerActivity(owner, () => events.push(`nested:${input.stem}`))
      events.push(`done:${input.stem}`)
    }, undefined, operation => runCompilerOwnerExternalActivity(owner, operation))
    stream.resume()
    const first = write(stream, 'first', events)
    const second = write(stream, 'second', events)
    await entered.promise
    const closing = disposeCompilerOwner(owner, { beforeDispose: () => {
      events.push('closed')
    } })
    await Promise.resolve()
    expect(events).toEqual(['start:first'])
    gate.resolve()
    await Promise.all([first, second, closing])
    expect(events).toContain('nested:second')
    expect(events.indexOf('done:first')).toBeLessThan(events.indexOf('start:second'))
    expect(events.indexOf('callback:first')).toBeLessThan(events.indexOf('closed'))
    expect(events.indexOf('callback:second')).toBeLessThan(events.indexOf('closed'))
    expect(events.at(-1)).toBe('closed')
    stream.end()
  })

  it('关闭期间宿主 write callback 重入的新写入不能借用内部租约', async () => {
    const owner = {}
    const gate = Promise.withResolvers<void>()
    const events: string[] = []
    const stream = createVinylTransform('test', async (input) => {
      events.push(input.stem)
      await gate.promise
      await runCompilerOwnerActivity(owner, () => events.push('nested'))
    }, undefined, operation => runCompilerOwnerExternalActivity(owner, operation))
    stream.resume()
    stream.on('error', () => {})
    const reentered = Promise.withResolvers<void>()
    stream.write(file('accepted'), () => {
      stream.write(file('reentered'), (error) => {
        try {
          expect(error?.message).toMatch(/释放/)
          reentered.resolve()
        }
        catch (error) { reentered.reject(error) }
      })
    })
    const closing = disposeCompilerOwner(owner)
    gate.resolve()
    await Promise.all([closing, reentered.promise])
    expect(events).toEqual(['accepted', 'nested'])
  })

  it('end(chunk) 使用相同接收边界，关闭后不再启动处理', async () => {
    const owner = {}
    const events: string[] = []
    const stream = createVinylTransform('test', async (input) => {
      events.push(input.stem)
    }, undefined, operation => runCompilerOwnerExternalActivity(owner, operation))
    stream.resume()
    await new Promise<void>((resolve, reject) => stream.end(file('last'), (error?: Error | null) => error ? reject(error) : resolve()))
    await disposeCompilerOwner(owner)
    expect(events).toEqual(['last'])
    const next = createVinylTransform('test', async () => {
      events.push('unexpected')
    }, undefined, operation => runCompilerOwnerExternalActivity(owner, operation))
    next.on('error', () => {})
    await expect(write(next, 'rejected', events)).rejects.toThrow('已释放')
    expect(events).not.toContain('unexpected')
  })

  it('关闭后 end(chunk) 仍通过结束回调与 error 报告拒绝', async () => {
    const owner = {}
    const stream = createVinylTransform('test', async () => {}, undefined, operation => runCompilerOwnerExternalActivity(owner, operation))
    stream.resume()
    const failure = Promise.withResolvers<Error>()
    stream.on('error', failure.resolve)
    await disposeCompilerOwner(owner)
    const ended = new Promise<void>((resolve, reject) => stream.end(file('late'), (error?: Error | null) => error ? reject(error) : resolve()))
    await expect(ended).rejects.toThrow('stream was destroyed')
    expect((await failure.promise).message).toContain('已释放')
  })

  it('保留原生背压与 drain，所有接受的排队文件均完成后才关闭', async () => {
    const owner = {}
    const gate = Promise.withResolvers<void>()
    const events: string[] = []
    const stream = createVinylTransform('test', async (input) => {
      await gate.promise
      events.push(input.stem)
    }, undefined, operation => runCompilerOwnerExternalActivity(owner, operation))
    stream.resume()
    const drained = new Promise<void>(resolve => stream.once('drain', resolve))
    const capacity = stream.writableHighWaterMark
    expect(() => stream.write(null)).toThrow('May not write null values to stream')
    const accepted = Array.from({ length: capacity }, (_, index) => stream.write(file(`queued-${index}`)))
    expect(accepted.at(-1)).toBe(false)
    const closing = disposeCompilerOwner(owner)
    gate.resolve()
    await Promise.all([drained, closing])
    expect(events).toHaveLength(capacity)
    stream.end()
  })

  it('destroy 提前回调也必须等实际 handler 结束再释放', async () => {
    const owner = {}
    const gate = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    const events: string[] = []
    const stream = createVinylTransform('test', async () => {
      entered.resolve()
      await gate.promise
      events.push('handler-finished')
    }, undefined, operation => runCompilerOwnerExternalActivity(owner, operation))
    stream.on('error', error => events.push(error.message))
    const accepted = write(stream, 'cancelled', events)
    const buffered = write(stream, 'buffered', events).catch(() => undefined)
    const observed = accepted.catch(() => undefined)
    await entered.promise
    stream.destroy(new Error('cancelled'))
    const closing = disposeCompilerOwner(owner, { beforeDispose: () => {
      events.push('closed')
    } })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(events).not.toContain('closed')
    gate.resolve()
    await Promise.all([observed, buffered, closing])
    expect(events).toContain('cancelled')
    expect(events.at(-1)).toBe('closed')
    expect(events).toContain('handler-finished')
  })
})
