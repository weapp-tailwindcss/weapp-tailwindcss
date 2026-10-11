import { execa } from 'execa'

export function treeRss(rows, rootPid) {
  const children = new Map()
  for (const row of rows) {
    const siblings = children.get(row.ppid) ?? []
    siblings.push(row)
    children.set(row.ppid, siblings)
  }
  const pending = rows.filter(row => row.pid === rootPid)
  const seen = new Set()
  let bytes = 0
  while (pending.length) {
    const row = pending.pop()
    if (seen.has(row.pid)) continue
    seen.add(row.pid)
    bytes += row.bytes
    pending.push(...(children.get(row.pid) ?? []))
  }
  return seen.size ? bytes / 1024 ** 2 : null
}

export async function samplePosixMemory(pid) {
  if (!pid) return null
  const result = await execa('ps', ['-Ao', 'pid=,ppid=,rss='], { reject: false, timeout: 5000 })
  if (result.exitCode !== 0) return null
  try {
    const rows = result.stdout.trim().split(/\r?\n/).map(line => {
          const [pid, ppid, rss] = line.trim().split(/\s+/).map(Number)
          return { pid, ppid, bytes: rss * 1024 }
        })
    return treeRss(rows, pid)
  }
  catch { return null }
}
