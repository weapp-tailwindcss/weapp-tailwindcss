const { createHash } = require('node:crypto')
const { readFile, readdir } = require('node:fs/promises')
const path = require('node:path')
const { isDeepStrictEqual } = require('node:util')

const boundary = 'metro-response-before-content-encoding'
const claim = Object.freeze({ http: 'host-response-observation', device: 'unattributed', websocket: 'not-captured', received: 'not-captured', evaluated: 'not-captured', servedBundle: 'not-captured', phaseAttribution: 'not-captured' })

/** 只验证原件完整性；不从 HTTP 状态、finish 或本机地址推导交付与执行成功。 */
async function validateMetroHttpArchive(directory, identity) {
  const index = JSON.parse(await readFile(path.join(directory, 'index.json'), 'utf8'))
  const sourceIdentity = JSON.parse(await readFile(path.join(directory, 'identity.json'), 'utf8'))
  if (!isDeepStrictEqual(sourceIdentity, identity) || !isDeepStrictEqual(index.identity, identity)) {
    throw new Error('Metro HTTP 观察身份不符')
  }
  if (index.schemaVersion !== 1 || index.state !== 'drained' || !isDeepStrictEqual(index.claim, claim) || index.boundary !== boundary) {
    throw new Error('Metro HTTP 观察证据边界不符')
  }
  const opened = Date.parse(index.openedAt)
  const stopped = Date.parse(index.stoppedAcceptingAt)
  const closed = Date.parse(index.closedAt)
  if (!Array.isArray(index.records) || !Array.isArray(index.errors) || index.errors.length || ![opened, stopped, closed].every(Number.isFinite) || stopped < opened || closed < stopped) {
    throw new Error('Metro HTTP 观察未完成')
  }
  const expectedFiles = ['identity.json', 'index.json']
  for (const [position, record] of index.records.entries()) {
    const sequence = position + 1
    if (record.sequence !== sequence || !Number.isSafeInteger(record.socketId) || record.socketId < 1 || record.body?.file !== `body-${sequence}.bin` || record.body?.meaning !== 'attempted-application-writes' || record.entityValidation !== 'not-performed' || !['finished', 'aborted', 'response-error', 'write-error'].includes(record.state) || !Array.isArray(record.errors) || record.errors.length || !record.response || typeof record.request?.rawUrl !== 'string') {
      throw new Error('Metro HTTP 观察回执不完整')
    }
    let requestUrl
    try {
      requestUrl = new URL(record.request.rawUrl, 'http://metro.invalid')
    }
    catch {
      throw new Error('Metro HTTP 观察URL不符')
    }
    const headers = record.response.headers
    if (!requestUrl.pathname.endsWith('.bundle') || !['GET', 'HEAD'].includes(record.request.method) || !Number.isInteger(record.response.status) || record.response.status < 100 || record.response.status > 599 || !headers || typeof headers !== 'object' || Array.isArray(headers) || Object.values(headers).some(value => typeof value !== 'string' && typeof value !== 'number' && !(Array.isArray(value) && value.every(item => typeof item === 'string'))) || !Number.isSafeInteger(record.body.byteLength) || record.body.byteLength < 0 || !/^[a-f0-9]{64}$/.test(record.body.sha256)) {
      throw new Error('Metro HTTP 观察元数据不符')
    }
    const start = Date.parse(record.startedAt)
    const end = Date.parse(record.endedAt)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || start < opened || start > stopped || end > closed) {
      throw new Error('Metro HTTP 观察时间不符')
    }
    const suppressed = record.request.method === 'HEAD' || record.response.status === 204 || record.response.status === 304 || record.response.status < 200
    if (record.response.bodySuppressed !== suppressed) {
      throw new Error('Metro HTTP 观察实体边界不符')
    }
    const bytes = await readFile(path.join(directory, record.body.file))
    const raw = JSON.parse(await readFile(path.join(directory, `request-${sequence}.json`), 'utf8'))
    if (!isDeepStrictEqual(raw, record) || bytes.length !== record.body.byteLength || createHash('sha256').update(bytes).digest('hex') !== record.body.sha256) {
      throw new Error('Metro HTTP 观察原件不符')
    }
    expectedFiles.push(record.body.file, `request-${sequence}.json`)
  }
  if (!isDeepStrictEqual((await readdir(directory)).sort(), expectedFiles.sort())) {
    throw new Error('Metro HTTP 观察存在未结算原件')
  }
  return index
}

module.exports = { validateMetroHttpArchive, claim, boundary }
