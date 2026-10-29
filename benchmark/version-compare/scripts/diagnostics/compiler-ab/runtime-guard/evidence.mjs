import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

export function readEvidence(session, rootPid, digest) {
  const evidence = { session: session.id, rootPid, isolates: [], launches: [], violations: [] }
  function invalid(message) {
    const error = new Error(`Compiler runtime guard evidence invalid: ${message}`)
    error.evidence = evidence
    throw error
  }
  if (digest(session.bootstrap) !== session.bootstrapSha) invalid('bootstrap hash mismatch')
  for (const [filename, sha] of Object.entries(session.codeHashes)) {
    if (digest(filename) !== sha) invalid('runtime source hash mismatch')
  }
  const records = []
  for (const filename of readdirSync(path.join(session.directory, 'events'))) {
    if (path.extname(filename) !== '.ndjson') invalid('unknown receipt file')
    const source = readFileSync(path.join(session.directory, 'events', filename), 'utf8')
    if (!source.endsWith('\n')) invalid('incomplete receipt')
    let entries
    try { entries = source.trimEnd().split('\n').map(line => JSON.parse(line)) }
    catch { invalid('malformed receipt') }
    evidence.violations.push(...entries.filter(entry => entry.kind === 'violation' || entry.kind === 'unsupported'))
    if (!entries.length || entries[0].kind !== 'ready') invalid('missing ready')
    const ready = entries[0]
    if (JSON.stringify(ready.codeHashes) !== JSON.stringify(session.codeHashes)) invalid('ready source hashes mismatch')
    entries.forEach((entry, index) => {
      if (entry.session !== session.id || entry.isolate !== ready.isolate || entry.pid !== ready.pid || entry.ppid !== ready.ppid || entry.threadId !== ready.threadId || entry.sequence !== index + 1 || entry.bootstrapSha !== session.bootstrapSha) invalid('receipt identity or sequence mismatch')
    })
    evidence.isolates.push(ready)
    records.push(...entries)
  }
  if (evidence.violations.length) invalid(evidence.violations.map(entry => entry.reason).join('; '))
  const root = evidence.isolates.filter(entry => entry.pid === rootPid && entry.threadId === 0)
  if (root.length !== 1) invalid('missing or ambiguous root ready')
  if (!records.some(entry => entry.isolate === root[0].isolate && entry.kind === 'exit' && entry.code === 0)) invalid('root exit not confirmed')
  const reachable = new Set([root[0].isolate])
  const intents = records.filter(entry => entry.kind === 'launch-intent')
  const launches = new Set()
  const targets = new Set()
  for (const intent of intents) {
    if (!['node', 'worker', 'native'].includes(intent.targetKind) || launches.has(intent.launch)) invalid('invalid or duplicate launch intent')
    launches.add(intent.launch)
    const start = records.filter(entry => entry.isolate === intent.isolate && entry.launch === intent.launch && entry.kind === 'launch-start')
    const close = records.filter(entry => entry.isolate === intent.isolate && entry.launch === intent.launch && entry.kind === 'launch-close')
    if (start.length !== 1 || close.length !== 1 || !Number.isInteger(start[0].targetPid) || start[0].targetPid <= 0 || close[0].targetPid !== start[0].targetPid) invalid('launch ready or close missing')
    if (close[0].error || (!Number.isInteger(close[0].code) && typeof close[0].signal !== 'string')) invalid('launch status unavailable')
    if (records.some(entry => entry.isolate === intent.isolate && entry.launch === intent.launch && entry.kind === 'launch-error')) invalid('launch error')
    let child
    if (intent.targetKind !== 'native') {
      child = evidence.isolates.filter(entry => entry.pid === start[0].targetPid && entry.threadId === start[0].targetThreadId)
      if (child.length !== 1) invalid('launch ready missing or ambiguous')
      if (intent.targetKind === 'node' && (child[0].execPath !== intent.filename || child[0].ppid !== intent.pid || child[0].parent?.isolate !== intent.isolate || child[0].parent?.launch !== intent.launch)) invalid('child launch ownership mismatch')
      if (intent.targetKind === 'worker' && (start[0].targetPid !== intent.pid || start[0].targetThreadId <= 0 || close[0].targetThreadId !== start[0].targetThreadId)) invalid('worker launch ownership mismatch')
      if (targets.has(child[0].isolate)) invalid('duplicate child ownership')
      targets.add(child[0].isolate)
    }
    else {
      const helper = session.nativeHelpers.find(item => item.path === intent.filename && item.sha256 === intent.sha256 && JSON.stringify(item.args) === JSON.stringify(intent.args))
      if (!helper || digest(helper.path) !== helper.sha256) invalid('native helper identity mismatch')
    }
    evidence.launches.push({ ...intent, target: start[0], close: close[0], child: child?.[0]?.isolate })
  }
  if (records.some(entry => entry.kind.startsWith('launch-') && !intents.some(intent => intent.launch === entry.launch && intent.isolate === entry.isolate))) invalid('orphan launch receipt')
  while (true) {
    const previous = reachable.size
    for (const launch of evidence.launches) {
      if (reachable.has(launch.isolate) && launch.child) reachable.add(launch.child)
    }
    if (previous === reachable.size) break
  }
  if (evidence.isolates.some(entry => !reachable.has(entry.isolate))) invalid('unowned runtime isolate')
  return { ...evidence, passed: true }
}
