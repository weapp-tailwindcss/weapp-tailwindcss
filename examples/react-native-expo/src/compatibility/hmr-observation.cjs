const key = '__WEAPP_TAILWIND_E2E_HMR_OBSERVATION__'
const ownedStates = new WeakSet()

function observerState(identity, realm, limits) {
  const existing = Object.getOwnPropertyDescriptor(realm, key)
  if (existing) {
    if (existing.configurable || existing.writable || !ownedStates.has(existing.value) || existing.value?.schemaVersion !== 1
      || existing.value.identity.runId !== identity.runId || existing.value.identity.invocationId !== identity.invocationId) {
      throw new Error('HMR 观察槽位已被其它会话占用')
    }
    return existing.value
  }
  if (!identity?.runId || !identity?.invocationId) {
    throw new Error('HMR 观察缺少本轮身份')
  }
  const state = {
    schemaVersion: 1,
    identity: { runId: identity.runId, invocationId: identity.invocationId },
    boundary: 'original-metro-client-websocket',
    initialBundle: 'not-captured',
    evaluator: 'not-captured',
    connections: [],
    records: [],
    errors: [],
    characters: 0,
    limits: { maxCharacters: limits.maxCharacters ?? 32 * 1024 * 1024, maxRecords: limits.maxRecords ?? 4096 },
  }
  let recordFailed = false
  Object.defineProperties(state, {
    failRecord: { value: () => { recordFailed = true } },
    recordFailed: { get: () => recordFailed },
  })
  if (Object.values(state.limits).some(value => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error('HMR 观察预算必须为正整数')
  }
  Object.defineProperty(realm, key, { value: state, configurable: false, writable: false, enumerable: false })
  ownedStates.add(state)
  return state
}

/** 观察异常只作缺口登记；不从原 HMR 的 dispatch 或 send 抛出。 */
function recordFailure(state, error) {
  try {
    state.failRecord()
    if (state.errors.length < 16) {
      state.errors.push(String(error))
    }
  }
  catch {}
}

function append(state, connectionId, kind, data) {
  try {
    if (state.recordFailed) {
      return
    }
    if (typeof data !== 'string' || state.characters + data.length > state.limits.maxCharacters || state.records.length >= state.limits.maxRecords) {
      throw new Error('HMR 观察遇到非字符串或超过完整记录预算')
    }
    state.records.push({ sequence: state.records.length + 1, connectionId, kind, receivedAtMs: Date.now(), data })
    state.characters += data.length
  }
  catch (error) {
    recordFailure(state, error)
  }
}

/** 构造原客户端一次，附加到其既有 socket；不更换消息 handler、全局 WebSocket 或 evaluator。 */
function createObservedHmrClient(Base, identity, realm = globalThis, limits = {}) {
  let state
  try {
    state = observerState(identity, realm, limits)
  }
  catch {
    return Base
  }
  function ObservedHmrClient(...args) {
    const client = Reflect.construct(Base, args, Base)
    try {
      const socket = client._ws
      if (!socket || typeof socket.addEventListener !== 'function' || typeof socket.send !== 'function' || typeof args[0] !== 'string') {
        throw new Error('原 HMR 客户端 socket shape 不匹配')
      }
      const id = state.connections.length + 1
      state.connections.push({ id, url: args[0] })
      socket.addEventListener('message', (event) => {
        try {
          append(state, id, 'message-received', event.data)
        }
        catch (error) {
          recordFailure(state, error)
        }
      }, { capture: true })
      const originalSend = socket.send
      const ownDescriptor = Object.getOwnPropertyDescriptor(socket, 'send')
      Object.defineProperty(socket, 'send', {
        ...(ownDescriptor ?? { configurable: true, enumerable: false, writable: true }),
        value(...values) {
          const result = originalSend.apply(this, values)
          append(state, id, 'send-returned', values[0])
          return result
        },
      })
    }
    catch (error) {
      recordFailure(state, error)
    }
    return client
  }
  Object.setPrototypeOf(ObservedHmrClient, Base)
  ObservedHmrClient.prototype = Base.prototype
  return ObservedHmrClient
}

/** 复制累计原始记录；不清空消息，不将接收或 send 返回解释为执行或网络投递完成。 */
function readHmrObservation(realm = globalThis) {
  const state = Object.getOwnPropertyDescriptor(realm, key)?.value
  if (!state || !ownedStates.has(state) || state.schemaVersion !== 1) {
    throw new Error('缺少原 HMR 连接观察')
  }
  const { characters, limits, ...snapshot } = state
  return JSON.parse(JSON.stringify({ ...snapshot, failed: state.recordFailed }))
}

module.exports = { createObservedHmrClient, readHmrObservation }
