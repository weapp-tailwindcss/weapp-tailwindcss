import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { identity, setup, validateMetroHttpArchive } from './react-native/http-archive-test-fixture'

describe('Metro HTTP 独立原件观察', () => {
  it('真实分块响应按调用时字节归档，不改变URL、回调或正文', async () => {
    const callback = vi.fn()
    const test = await setup((_request, response) => {
      const bytes = Buffer.from([0xA1, 0xB2])
      response.setHeader('X-Metro-Delta-ID', 'rev-1')
      response.write('é', 'latin1', callback)
      response.write(bytes)
      response.end(new Uint8Array([0xC3, 0xD4]))
    })
    const response = await fetch(`${test.url}/index.bundle?platform=ios&dev=true`)
    const body = Buffer.from(await response.arrayBuffer())
    const result = await test.drain()
    expect(callback).toHaveBeenCalledOnce()
    expect(test.inner).toHaveBeenCalledOnce()
    expect(test.next).not.toHaveBeenCalled()
    expect(result.records).toHaveLength(1)
    const record = result.records[0]
    expect(record.request.rawUrl).toBe('/index.bundle?platform=ios&dev=true')
    expect(record.response.headers['x-metro-delta-id']).toBe('rev-1')
    expect(await readFile(path.join(test.directory, record.body.file))).toEqual(body)
    expect(body).toEqual(Buffer.from([0xE9, 0xA1, 0xB2, 0xC3, 0xD4]))
    expect(result.claim).toEqual({ http: 'host-response-observation', device: 'unattributed', websocket: 'not-captured', received: 'not-captured', evaluated: 'not-captured', servedBundle: 'not-captured', phaseAttribution: 'not-captured' })
  })

  it('调用后立即修改Buffer会影响Node异步发送，调用快照不能冒充客户端接收', async () => {
    const test = await setup((_request, response) => {
      const bytes = Buffer.from('original')
      response.write(bytes)
      bytes.fill(0)
      response.end()
    })
    const response = await fetch(`${test.url}/index.bundle`)
    const received = Buffer.from(await response.arrayBuffer())
    const result = await test.drain()
    const record = result.records[0]
    expect(await readFile(path.join(test.directory, record.body.file))).toEqual(Buffer.from('original'))
    expect(received).toEqual(Buffer.alloc(8))
    expect(result.claim.received).toBe('not-captured')
  })

  it('外层gzip与归档前编码实体分开，不能以归档字节冒充线上压缩字节', async () => {
    const test = await setup((_request, response) => response.end('console.log("original")'), true)
    const response = await fetch(`${test.url}/index.bundle`)
    expect(response.headers.get('content-encoding')).toBe('gzip')
    const entity = Buffer.from(await response.arrayBuffer())
    const result = await test.drain()
    expect(result.boundary).toBe('metro-response-before-content-encoding')
    expect(await readFile(path.join(test.directory, result.records[0].body.file))).toEqual(entity)
  })

  it.each([204, 304])('状态%s保留尝试写入，但不制造发送实体', async (status) => {
    const test = await setup((_request, response) => {
      response.statusCode = status
      response.end('not-sent')
    })
    const response = await fetch(`${test.url}/index.bundle`)
    expect(await response.text()).toBe('')
    const result = await test.drain()
    expect(result.records[0].response.bodySuppressed).toBe(true)
    expect(result.records[0].body.byteLength).toBe(8)
    expect(result.records[0].body.meaning).toBe('attempted-application-writes')
    expect(result.claim.servedBundle).toBe('not-captured')
  })

  it('HEAD的尝试正文不能登记为实体；状态探针不加入bundle归档', async () => {
    const test = await setup((_request, response) => response.end('not-sent'))
    await fetch(`${test.url}/status`)
    const response = await fetch(`${test.url}/index.bundle`, { method: 'HEAD' })
    expect(await response.text()).toBe('')
    const result = await test.drain()
    expect(result.records).toHaveLength(1)
    expect(result.records[0].response.bodySuppressed).toBe(true)
  })

  it('multipart原件不拆改，外200内错误也不能提升为交付成功', async () => {
    const body = '--boundary\r\nContent-Type: application/json\r\n\r\n{"done":1}\r\n--boundary\r\nX-Http-Status: 500\r\n\r\nerror\r\n--boundary--\r\n'
    const test = await setup((_request, response) => {
      response.setHeader('Content-Type', 'multipart/mixed; boundary="boundary"')
      response.end(body)
    })
    expect(await (await fetch(`${test.url}/index.bundle`)).text()).toBe(body)
    const result = await test.drain()
    expect((await readFile(path.join(test.directory, result.records[0].body.file))).toString()).toBe(body)
    expect(result.records[0].entityValidation).toBe('not-performed')
    expect(result.claim.servedBundle).toBe('not-captured')
  })

  it('未drain、旧调用、原件或回执篡改全部拒绝', async () => {
    const test = await setup((_request, response) => response.end('original'))
    await expect(validateMetroHttpArchive(test.directory, identity)).rejects.toThrow()
    await (await fetch(`${test.url}/index.bundle`)).text()
    const result = await test.drain()
    await expect(validateMetroHttpArchive(test.directory, { ...identity, invocationId: randomUUID() })).rejects.toThrow(/身份/)
    const file = path.join(test.directory, result.records[0].body.file)
    await writeFile(file, 'tampered')
    await expect(validateMetroHttpArchive(test.directory, identity)).rejects.toThrow(/原件/)
    const indexPath = path.join(test.directory, 'index.json')
    const index = JSON.parse(await readFile(indexPath, 'utf8'))
    index.claim.received = 'captured'
    await writeFile(indexPath, JSON.stringify(index))
    await expect(validateMetroHttpArchive(test.directory, identity)).rejects.toThrow(/边界/)
  })

  it('控制入口需本轮token，缺凭据不能关闭归档', async () => {
    const test = await setup((_request, response) => response.end('data'))
    expect((await fetch(`${test.url}${test.archive.controlPath}`, { method: 'POST' })).status).toBe(403)
    await (await fetch(`${test.url}/index.bundle`)).text()
    expect((await test.drain()).records).toHaveLength(1)
  })

  it('原write/end的this、返回值及回调原样保留', async () => {
    const test = await setup((_request, response) => response.end())
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      getHeaders: () => ({}),
      write: vi.fn(function (this: unknown, ...args: any[]) {
        expect(this).toBe(response)
        args.at(-1)?.()
        return false
      }),
      end: vi.fn(function (this: unknown, _chunk: string) {
        expect(this).toBe(response)
        response.emit('finish')
        return response
      }),
    })
    const request = { url: '/fake.bundle', method: 'GET', headers: {}, socket: {} }
    const handler = test.archive.enhance(() => {})
    handler(request, response, () => {})
    const callback = vi.fn()
    expect(response.write('one', 'utf8', callback)).toBe(false)
    expect(callback).toHaveBeenCalledOnce()
    expect(response.end('two')).toBe(response)
    const result = await test.drain()
    expect(result.records[0].body.sha256).toBe(createHash('sha256').update('onetwo').digest('hex'))
  })

  it('end内部再调用write不双计；close-before-finish保留aborted', async () => {
    const test = await setup((_request, response) => response.end())
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      getHeaders: () => ({}),
      write: (_chunk: string) => true,
      end(this: EventEmitter & { write: (chunk: string) => boolean }, chunk: string) {
        this.write(chunk)
        this.emit('close')
        return this
      },
    })
    test.archive.enhance(() => {})({ url: '/abort.bundle', method: 'GET', headers: {}, socket: {} }, response, () => {})
    response.end('once')
    const result = await test.drain()
    expect(result.records[0].state).toBe('aborted')
    expect(result.records[0].body.byteLength).toBe(4)
    expect(result.claim.received).toBe('not-captured')
  })

  it('原write同步异常保留原对象，并拒绝完整归档', async () => {
    const test = await setup((_request, response) => response.end())
    const failure = new Error('原始write故障')
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      getHeaders: () => ({}),
      write(_chunk: string) {
        throw failure
      },
      end() {},
    })
    test.archive.enhance(() => {})({ url: '/error.bundle', method: 'GET', headers: {}, socket: {} }, response, () => {})
    expect(() => response.write('original')).toThrow(failure)
    await expect(test.drain()).rejects.toThrow()
    const index = JSON.parse(await readFile(path.join(test.directory, 'index.json'), 'utf8'))
    expect(index.records[0].state).toBe('write-error')
    expect(index.records[0].errors).toContain('Error: 原始write故障')
    await expect(validateMetroHttpArchive(test.directory, identity)).rejects.toThrow(/回执/)
  })
})
