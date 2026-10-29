import assert from 'node:assert/strict'
import linux from './linux.cjs'

function successfulUnref(records, intent, resource) {
  const references = records.filter(entry => entry.kind === 'launch-reference' && entry.isolate === intent.isolate && entry.launch === intent.launch && entry.resource === resource)
  assert.ok(references.length && references.every(entry => typeof entry.referenced === 'boolean') && references.at(-1).referenced === false, `缺少最终成功 unref：${resource}`)
}

function stopped(target, expected, proof) {
  assert.ok(target && linux.sameEntity(target.expected, expected), '外部停止目标出生身份不符')
  assert.ok(target.firstSeen && target.lastSeen && target.firstGone && target.lastObserved, '外部停止缺少独立首见活或消失证据')
  assert.ok(linux.sameEntity(target.firstSeen.identity, expected) && target.firstSeen.identity.state !== 'Z', '外部首见不是匹配的活实例')
  assert.ok(linux.sameEntity(target.lastSeen.identity, expected), '外部最后存活出生身份不符')
  assert.equal(target.firstSeen.identity.executable, expected.executable)
  assert.deepEqual(target.firstSeen.identity.argv, expected.argv)
  assert.equal(target.firstSeen.identity.pgid, expected.pgid)
  assert.equal(target.firstSeen.identity.ppid, expected.ppid)
  assert.ok(target.firstSeen.at <= target.lastSeen.at && target.lastSeen.at <= target.firstGone.at && target.firstSeen.at <= proof.rootClose.observedAt, '外部停止时间次序不符')
  assert.ok(['absent', 'reused'].includes(target.firstGone.state) && ['absent', 'reused'].includes(target.lastObserved.state), '外部停止尚有活实例或未回收 zombie')
  assert.ok(target.firstGone.at <= proof.deadline && target.lastObserved.at >= proof.rootClose.observedAt && target.lastObserved.at <= proof.deadline, '外部停止超过截止或未在 root close 后复核')
  if (target.firstGone.state === 'reused') assert.ok(target.firstGone.replacement && !linux.sameEntity(target.firstGone.replacement, expected) && target.firstGone.replacement.bootId === expected.bootId, '外部停止的 PID/TID 复用证据不符')
}

/** 仅证明精确 unref 服务已停止；不会补造内部 close 或独立退出状态。 */
export function validateExternalTermination({ session, root, intent, start, child, records, proof, digest }) {
  assert.ok(session.unrefServices?.length && root.osIdentity, '未批准外部停止证据')
  assert.ok(root.osIdentity.pid === root.pid && root.osIdentity.tid === root.pid && root.osIdentity.birth === root.osIdentity.processBirth, '外部停止 root 的 OS 线程组身份不符')
  assert.ok(proof?.available === true && proof.observationErrors?.length === 0 && proof.schemaVersion === 1 && proof.session === session.id && proof.rootPid === root.pid && proof.beforeCleanup === true, '外部停止会话、首错或清理边界不符')
  assert.ok(Array.isArray(proof.controllerSignals) && proof.controllerSignals.length === 0, '外部停止受控制器 signal 干预')
  assert.ok(proof.rootClose?.code === 0 && proof.rootClose.signal === null && proof.rootClose.pid === root.pid && proof.rootClose.exit?.code === 0 && proof.rootClose.exit.signal === null, '外部停止缺少真实 root exit/close 0')
  assert.ok(Number.isFinite(proof.deadline) && Number.isFinite(proof.finishedAt) && proof.finishedAt <= proof.deadline && proof.rootClose.exit.observedAt <= proof.rootClose.observedAt && proof.rootClose.observedAt <= proof.finishedAt, '外部停止截止或 root 事件次序无效')
  const rootTarget = proof.targets.find(item => item.key === 'root')
  stopped(rootTarget, root.osIdentity, proof)
  const service = session.unrefServices.find(item => intent.targetKind === 'worker'
    ? item.entry === intent.filename && item.sha256 === intent.sha256 && item.version === intent.serviceVersion
    : item.helper.path === intent.filename && item.helper.sha256 === intent.sha256 && JSON.stringify(item.helper.args) === JSON.stringify(intent.args))
  assert.ok(service, '外部停止不是精确批准的官方 esbuild service')
  assert.equal(digest(service.entry), service.sha256, '外部停止 service 源码发生变化')
  assert.equal(digest(service.manifest), service.manifestSha256, '外部停止 service manifest 发生变化')
  const load = records.find(entry => entry.kind === 'service-load' && entry.isolate === intent.isolate && entry.filename === service.entry && entry.sha256 === service.sha256 && entry.version === service.version && entry.sequence < intent.sequence)
  assert.ok(load, '外部停止缺少父 isolate 的准确 service 加载证据')
  successfulUnref(records, intent, 'handle')
  let target
  if (intent.targetKind === 'worker') {
    const actual = child?.osIdentity
    assert.ok(actual && actual.pid === root.pid && actual.tid !== root.osIdentity.tid && actual.processBirth === root.osIdentity.processBirth && actual.bootId === root.osIdentity.bootId, '外部停止的 Worker OS task 身份不符')
    assert.ok(records.some(entry => entry.kind === 'service-load' && entry.isolate === child.isolate && entry.filename === service.entry && entry.sha256 === service.sha256 && entry.version === service.version), '外部停止缺少子 Worker 的准确 service 加载证据')
    const helperIntents = records.filter(entry => entry.kind === 'launch-intent' && entry.isolate === child.isolate)
    assert.equal(helperIntents.length, 1, '外部停止 service Worker 启动了额外资源')
    assert.equal(helperIntents[0].targetKind, 'native')
    assert.equal(helperIntents[0].filename, service.helper.path)
    assert.equal(helperIntents[0].sha256, service.helper.sha256)
    assert.deepEqual(helperIntents[0].args, service.helper.args)
    target = proof.targets.find(item => item.key === `isolate:${child.isolate}`)
    stopped(target, actual, proof)
  }
  else {
    const actual = start.osIdentity
    assert.ok(actual && actual.pid === start.targetPid && actual.tid === actual.pid && actual.ppid === intent.pid && actual.pgid === root.osIdentity.pgid && actual.executable === service.helper.path && actual.sha256 === service.helper.sha256, '外部停止的 helper OS 身份不符')
    assert.deepEqual(actual.argv.slice(1), service.helper.args)
    successfulUnref(records, intent, 'stdin')
    successfulUnref(records, intent, 'stdout')
    target = proof.targets.find(item => item.key === `launch:${intent.launch}`)
    stopped(target, actual, proof)
    assert.equal(target.firstSeen.identity.sha256, service.helper.sha256, '外部首见 helper 内容未独立核对')
    assert.ok(actual.executableIdentity?.inode && actual.executableIdentity?.device, '外部停止缺少真实 exe 映像身份')
    assert.deepEqual(target.firstSeen.identity.executableIdentity, actual.executableIdentity, '外部首见 helper 映像与启动时不符')
  }
  return {
    kind: intent.targetKind === 'worker' ? 'thread-stopped-at-root-boundary' : 'observed-stopped-after-root-exit',
    internalClose: false, statusKnown: false, code: 'unknown', signal: 'unknown', cause: 'unknown',
    identity: target.expected, firstSeen: target.firstSeen.at, lastSeen: target.lastSeen.at,
    firstGone: target.firstGone, lastObserved: target.lastObserved,
  }
}
