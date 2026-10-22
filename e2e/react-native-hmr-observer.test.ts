import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createObservedHmrClient, readHmrObservation } = require('../examples/react-native-expo/src/compatibility/hmr-observation.cjs')

const identity = { runId: 'owned-run', invocationId: 'owned-invocation' }

class Socket extends EventTarget {
  sent: unknown[][] = []
  private messageHandler: ((event: Event) => void) | null = null
  get onmessage() { return this.messageHandler }
  set onmessage(handler: ((event: Event) => void) | null) {
    if (this.messageHandler) {
      this.removeEventListener('message', this.messageHandler)
    }
    this.messageHandler = handler
    if (handler) {
      this.addEventListener('message', handler)
    }
  }

  send(...args: unknown[]) {
    this.sent.push(args)
    return 17
  }

  close() {}
  message(data: string) { this.dispatchEvent(new MessageEvent('message', { data })) }
}

describe('原 HMR socket 观察边界', () => {
  it('只构造一次原实例，不替换原消息处理、WebSocket 或 evaluator', () => {
    const realm = {}
    const handler = vi.fn()
    const Base = vi.fn(function (this: { _ws: Socket }) {
      this._ws = new Socket()
      this._ws.addEventListener('message', handler)
    })
    const Observed = createObservedHmrClient(Base, identity, realm)
    const client = new Observed('wss://metro.example/hot?platform=ios')
    const data = '{"type":"update","body":{"revisionId":"r1","added":[],"modified":[],"deleted":[7,"7"],"isInitialUpdate":false}}'
    client._ws.message(data)
    expect(Base).toHaveBeenCalledTimes(1)
    expect(client).toBeInstanceOf(Base)
    expect(handler).toHaveBeenCalledTimes(1)
    const snapshot = readHmrObservation(realm)
    expect(snapshot.identity).toEqual(identity)
    expect(snapshot.connections).toEqual([{ id: 1, url: 'wss://metro.example/hot?platform=ios' }])
    expect(snapshot.records).toEqual([expect.objectContaining({ sequence: 1, connectionId: 1, kind: 'message-received', data })])
    expect(Object.keys(realm)).not.toContain('eval')
    expect(Object.keys(realm)).not.toContain('globalEvalWithSourceUrl')
    expect(Object.keys(realm)).not.toContain('WebSocket')
    client._ws.message('second')
    expect(snapshot.records).toHaveLength(1)
    expect(readHmrObservation(realm).records).toHaveLength(2)
  })

  it('透传同一 socket 的发送参数、this、返回值及原异常，包含 heartbeat', () => {
    const realm = {}
    class Base { _ws = new Socket() }
    const client = new (createObservedHmrClient(Base, identity, realm))('http://metro/hot')
    expect(client._ws.send('{"type":"heartbeat"}')).toBe(17)
    expect(client._ws.sent).toEqual([['{"type":"heartbeat"}']])
    expect(readHmrObservation(realm).records[0]).toMatchObject({ kind: 'send-returned', data: '{"type":"heartbeat"}' })
    const failure = new Error('native send failed')
    class ThrowingSocket extends Socket {
      send() { throw failure }
    }
    class ThrowingBase { _ws = new ThrowingSocket() }
    const throwing = new (createObservedHmrClient(ThrowingBase, identity, realm))('https://metro/hot')
    expect(() => throwing._ws.send('x')).toThrow(failure)
    expect(readHmrObservation(realm).records).toHaveLength(1)
  })

  it('只观察原实例；shape 或 descriptor 失配保留错误且不产生备用连接', () => {
    const realm = {}
    // 此替身必须可被 Reflect.construct 构造，不能用箭头函数。
    // eslint-disable-next-line prefer-arrow-callback
    const Base = vi.fn(function () {})
    expect(() => new (createObservedHmrClient(Base, identity, realm))('ws://metro/hot')).not.toThrow()
    expect(Base).toHaveBeenCalledTimes(1)
    expect(readHmrObservation(realm).errors).not.toHaveLength(0)
    class LockedBase {
      _ws = new Socket()
      constructor() { Object.freeze(this._ws) }
    }
    const client = new (createObservedHmrClient(LockedBase, identity, realm))('ws://metro/hot')
    expect(client._ws.send('still-original')).toBe(17)
    expect(readHmrObservation(realm).errors.length).toBeGreaterThan(1)
  })

  it('达到记录预算后不破坏原 HMR，并显式拒绝完整性声明', () => {
    const realm = {}
    const handler = vi.fn()
    class Base {
      _ws = new Socket()
      constructor() {
        this._ws.addEventListener('message', handler)
      }
    }
    const client = new (createObservedHmrClient(Base, identity, realm, { maxCharacters: 4, maxRecords: 1 }))('ws://metro/hot')
    client._ws.message('1234')
    client._ws.message('5')
    expect(handler).toHaveBeenCalledTimes(2)
    expect(readHmrObservation(realm).records).toHaveLength(1)
    expect(readHmrObservation(realm).errors).not.toHaveLength(0)
  })

  it('观察写入异常不能阻断原 dispatch，缺少或被占用状态不能制造成功快照', () => {
    expect(() => readHmrObservation({})).toThrow()
    const realm = {}
    class Base { _ws = new Socket() }
    const client = new (createObservedHmrClient(Base, identity, realm))('ws://metro/hot')
    const state = Object.getOwnPropertyDescriptor(realm, '__WEAPP_TAILWIND_E2E_HMR_OBSERVATION__')!.value
    Object.freeze(state.records)
    expect(() => client._ws.message('event')).not.toThrow()
    expect(readHmrObservation(realm).errors).not.toHaveLength(0)
    expect(createObservedHmrClient(Base, { ...identity, runId: 'other' }, realm)).toBe(Base)
    expect(readHmrObservation(realm).identity).toEqual(identity)
    expect(createObservedHmrClient(Base, identity, {}, { maxRecords: -1 })).toBe(Base)
  })

  it.each([undefined, () => {
    throw new Error('forged observer failure')
  }])('拒绝同身份的伪造槽位，不让观察错误改变原行为', (failRecord) => {
    const realm = {}
    Object.defineProperty(realm, '__WEAPP_TAILWIND_E2E_HMR_OBSERVATION__', {
      value: { schemaVersion: 1, identity, records: [], connections: [], errors: [], failRecord },
    })
    class Base { _ws = new Socket() }
    expect(createObservedHmrClient(Base, identity, realm)).toBe(Base)
    expect(() => readHmrObservation(realm)).toThrow()
  })

  it('记录和错误数组都冻结时仍保留失败标记，并继续原消息处理', () => {
    const realm = {}
    const handler = vi.fn()
    class Base { _ws = new Socket() }
    const client = new (createObservedHmrClient(Base, identity, realm))('http://metro/hot')
    client._ws.addEventListener('message', handler)
    const state = Object.getOwnPropertyDescriptor(realm, '__WEAPP_TAILWIND_E2E_HMR_OBSERVATION__')!.value
    Object.freeze(state.records)
    Object.freeze(state.errors)
    expect(() => client._ws.message('event')).not.toThrow()
    expect(handler).toHaveBeenCalledTimes(1)
    expect(readHmrObservation(realm).failed).toBe(true)
  })

  it('真实 Metro 的 disabled pending merge 保持原行为，不把收到或 update-done 当执行成功', () => {
    const realm = {}
    const sockets: Socket[] = []
    const execute = vi.fn()
    const exampleRequire = createRequire(fileURLToPath(new URL('../examples/react-native-expo/package.json', import.meta.url)))
    const rnRequire = createRequire(exampleRequire.resolve('react-native/package.json'))
    const original = rnRequire.resolve('metro-runtime/src/modules/HMRClient')
    const originalRequire = createRequire(original)
    const source = readFileSync(original, 'utf8')
    const module = { exports: undefined as any }
    runInNewContext(source, {
      module,
      require: originalRequire,
      global: {
        WebSocket: class extends Socket {
          constructor() {
            super()
            sockets.push(this)
          }
        },
        globalEvalWithSourceUrl: execute,
      },
      setInterval,
      clearInterval,
    })
    const client = new (createObservedHmrClient(module.exports, identity, realm))('ws://metro/hot')
    const update = (revisionId: string, added: unknown[], modified: unknown[], deleted: unknown[]) => sockets[0]!.message(JSON.stringify({ type: 'update', body: { revisionId, isInitialUpdate: false, added, modified, deleted } }))
    update('r1', [{ module: [7, 'old'], sourceURL: 'http://metro/a' }], [], [])
    update('r2', [], [{ module: [7, 'new'], sourceURL: 'http://metro/a' }], ['7'])
    expect(execute).not.toHaveBeenCalled()
    expect(readHmrObservation(realm).records).toHaveLength(2)
    client.enable()
    expect(execute).toHaveBeenCalledExactlyOnceWith('new', 'http://metro/a')
    sockets[0]!.message('{"type":"update-done"}')
    expect(readHmrObservation(realm)).not.toHaveProperty('evaluated')
    client.close()
  })
})
