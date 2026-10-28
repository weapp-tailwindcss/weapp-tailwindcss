/** 保留字面抛出值、首错、cause 与 AggregateError 的完整关系。 */
export function describeFailure(value, seen = new Map()) {
  if (!(value instanceof Error)) return { thrownType: typeof value, value: value === undefined ? '<undefined>' : String(value) }
  if (seen.has(value)) return { reference: seen.get(value), name: value.name, message: value.message }
  const id = seen.size + 1
  seen.set(value, id)
  return {
    id,
    name: value.name,
    message: value.message,
    stack: value.stack,
    ...(Object.hasOwn(value, 'cause') ? { cause: describeFailure(value.cause, seen) } : {}),
    ...(value instanceof AggregateError ? { errors: value.errors.map(error => describeFailure(error, seen)) } : {}),
  }
}

/** 所有收尾都执行；首错不会被后续诊断或资源归还异常覆盖。 */
export async function runWithCleanup(run, cleanups) {
  let outcome
  try { outcome = { failed: false, value: await run() } }
  catch (error) { outcome = { failed: true, error } }
  const failures = outcome.failed ? [outcome.error] : []
  for (const cleanup of cleanups) {
    try { await cleanup({ ...outcome, failures: [...failures] }) }
    catch (error) { failures.push(error) }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length) throw new AggregateError(failures, `执行与收尾存在多个失败；首错：${failures[0] instanceof Error ? failures[0].message : String(failures[0])}`, { cause: failures[0] })
  return outcome.value
}
