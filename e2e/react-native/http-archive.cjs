const { Buffer } = require('node:buffer')
const { createHash } = require('node:crypto')
const { createWriteStream, mkdirSync, writeFileSync } = require('node:fs')
const { writeFile } = require('node:fs/promises')
const path = require('node:path')
const process = require('node:process')
const { validateMetroHttpArchive, claim, boundary } = require('./http-archive-validation.cjs')

/** CJS 入口供 Expo 的 CJS Metro 配置直接加载，不安装额外转译钩子。 */
function createMetroHttpArchive({ directory, identity, token, maxPendingBytes = 64 * 1024 * 1024, maxActiveRequests = 8, maxRecords = 256 }) {
  if (!path.isAbsolute(directory) || !token || !identity?.runId || !identity?.invocationId || [maxPendingBytes, maxActiveRequests, maxRecords].some(value => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error('Metro HTTP 观察配置不完整')
  }
  mkdirSync(directory)
  writeFileSync(path.join(directory, 'identity.json'), `${JSON.stringify(identity)}\n`, { flag: 'wx' })
  const controlPath = `/__weapp_metro_observation/${identity.invocationId}/drain`
  const sockets = new WeakMap()
  const records = []
  const pending = new Set()
  const errors = []
  const openedAt = new Date().toISOString()
  let socketSequence = 0
  let queuedBytes = 0
  let stopped = false
  let stoppedAcceptingAt
  let draining

  function observe(request, response) {
    const sequence = records.length + 1
    if (!sockets.has(request.socket)) {
      sockets.set(request.socket, ++socketSequence)
    }
    const record = {
      sequence,
      socketId: sockets.get(request.socket),
      request: { rawUrl: request.url, method: request.method, host: request.headers.host ?? null },
      startedAt: new Date().toISOString(),
      endedAt: null,
      state: 'pending',
      entityValidation: 'not-performed',
      response: null,
      body: { file: `body-${sequence}.bin`, meaning: 'attempted-application-writes', byteLength: 0, sha256: null },
      errors: [],
    }
    const recordFile = path.join(directory, `request-${sequence}.json`)
    writeFileSync(recordFile, `${JSON.stringify(record)}\n`, { flag: 'wx' })
    records.push(record)
    const stream = createWriteStream(path.join(directory, record.body.file), { flags: 'wx' })
    const hash = createHash('sha256')
    stream.on('error', error => record.errors.push(String(error)))
    let terminal = false
    let settled
    const completion = new Promise((resolve) => {
      settled = resolve
    })
    pending.add(completion)
    const originalWrite = response.write
    const originalEnd = response.end
    let originalDepth = 0

    function append(chunk, encoding) {
      if (terminal || originalDepth || chunk === undefined || chunk === null || typeof chunk === 'function') {
        return
      }
      try {
        const length = typeof chunk === 'string' ? Buffer.byteLength(chunk, typeof encoding === 'string' ? encoding : 'utf8') : chunk.byteLength
        if (queuedBytes + length > maxPendingBytes || stream.destroyed) {
          throw new Error('Metro HTTP 观察写盘队列超限或已关闭')
        }
        const bytes = typeof chunk === 'string' ? Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8') : Buffer.from(chunk)
        hash.update(bytes)
        record.body.byteLength += bytes.length
        queuedBytes += bytes.length
        stream.write(bytes, () => {
          queuedBytes -= bytes.length
        })
      }
      catch (error) { record.errors.push(String(error)) }
    }

    function finalize(state) {
      if (terminal) {
        return
      }
      terminal = true
      record.state = state
      record.endedAt = new Date().toISOString()
      const status = response.statusCode
      record.response = {
        status,
        headers: response.getHeaders(),
        bodySuppressed: request.method === 'HEAD' || status === 204 || status === 304 || status < 200,
      }
      record.body.sha256 = hash.digest('hex')
      // finish 只表示 Node 完成写出；不将它当设备接收或实体语义验证。
      stream.end()
      void (async () => {
        if (!stream.closed) {
          await new Promise(resolve => stream.once('close', resolve))
        }
        try {
          await writeFile(recordFile, `${JSON.stringify(record)}\n`)
        }
        catch (error) { errors.push(String(error)) }
        pending.delete(completion)
        settled()
      })()
    }

    response.write = function (...args) {
      append(args[0], args[1])
      originalDepth++
      try {
        return originalWrite.apply(this, args)
      }
      catch (error) {
        record.errors.push(String(error))
        finalize('write-error')
        throw error
      }
      finally { originalDepth-- }
    }
    response.end = function (...args) {
      append(args[0], args[1])
      originalDepth++
      try {
        return originalEnd.apply(this, args)
      }
      catch (error) {
        record.errors.push(String(error))
        finalize('write-error')
        throw error
      }
      finally { originalDepth-- }
    }
    response.once('finish', () => finalize('finished'))
    response.once('close', () => finalize('aborted'))
    response.once('error', (error) => {
      record.errors.push(String(error))
      finalize('response-error')
    })
  }

  async function settle() {
    stopped = true
    stoppedAcceptingAt ??= new Date().toISOString()
    await Promise.all([...pending])
  }

  async function drain() {
    await settle()
    const index = { schemaVersion: 1, identity, boundary, claim, openedAt, stoppedAcceptingAt, closedAt: new Date().toISOString(), state: 'drained', records, errors }
    await writeFile(path.join(directory, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, { flag: 'wx' })
    if (errors.length || records.some(record => record.errors.length)) {
      throw new Error('Metro HTTP 观察原件写入失败')
    }
    return index
  }

  return {
    controlPath,
    settle,
    enhance(inner) {
      return function (request, response, next) {
        if (request.url === controlPath) {
          if (request.method !== 'POST' || request.headers.authorization !== `Bearer ${token}`) {
            response.writeHead(403).end()
            return
          }
          draining ??= drain()
          void draining.then(() => response.writeHead(200).end('drained'), error => response.writeHead(503).end(String(error)))
          return
        }
        let bundle = false
        try {
          bundle = new URL(request.url, 'http://metro.invalid').pathname.endsWith('.bundle')
        }
        catch {}
        if (!stopped && bundle) {
          try {
            if (pending.size >= maxActiveRequests || records.length >= maxRecords) {
              throw new Error('Metro HTTP 观察并发或记录数超限')
            }
            observe(request, response)
          }
          catch (error) { errors.push(String(error)) }
        }
        return inner.call(this, request, response, next)
      }
    },
  }
}

/** 只有本任务原生 runner 显式传入配置时才启用，不改用户正常 Expo 会话。 */
function withMetroHttpArchive(config, environment = process.env) {
  const source = environment.RN_METRO_HTTP_ARCHIVE
  if (!source) {
    return config
  }
  const options = JSON.parse(source)
  const archive = createMetroHttpArchive(options)
  const previous = config.server?.enhanceMiddleware
  return {
    ...config,
    server: {
      ...config.server,
      enhanceMiddleware(metroMiddleware, metroServer) {
        const inner = previous ? previous.call(config.server, metroMiddleware, metroServer) : metroMiddleware
        return archive.enhance(inner)
      },
    },
  }
}

module.exports = { createMetroHttpArchive, withMetroHttpArchive, validateMetroHttpArchive }
