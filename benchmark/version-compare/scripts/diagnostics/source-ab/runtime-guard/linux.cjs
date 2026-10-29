const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

function parseStat(source) {
  const boundary = source.lastIndexOf(')')
  const pid = Number(source.slice(0, source.indexOf(' ')))
  const fields = source.slice(boundary + 2).trim().split(/\s+/)
  if (boundary < 0 || !Number.isInteger(pid) || pid <= 0 || !/^\d+$/.test(fields[19])) throw new Error('Invalid Linux process birth identity')
  return { id: pid, state: fields[0], ppid: Number(fields[1]), pgid: Number(fields[2]), birth: fields[19] }
}

function readEntity(pid, tid = pid, { proc = '/proc', executable = false, hashExecutable = false, files = fs } = {}) {
  const processFile = path.join(proc, String(pid), 'stat')
  const taskFile = path.join(proc, String(pid), 'task', String(tid), 'stat')
  const leader = parseStat(files.readFileSync(processFile, 'utf8'))
  const task = parseStat(files.readFileSync(taskFile, 'utf8'))
  if (leader.id !== pid || task.id !== tid) throw new Error('Linux process/task identity mismatch')
  const result = {
    pid, tid, birth: task.birth, processBirth: leader.birth, state: task.state,
    ppid: leader.ppid, pgid: leader.pgid,
    bootId: files.readFileSync(path.join(proc, 'sys', 'kernel', 'random', 'boot_id'), 'utf8').trim(),
  }
  if (!/^[a-f\d-]{36}$/.test(result.bootId)) throw new Error('Linux boot identity missing')
  if (executable && leader.state !== 'Z' && task.state !== 'Z') {
    const executableFile = path.join(proc, String(pid), 'exe')
    result.executable = files.realpathSync(executableFile)
    result.argv = files.readFileSync(path.join(proc, String(pid), 'cmdline')).toString().split('\0').filter(Boolean)
    if (hashExecutable) {
      // 从内核的 exe 入口持有真实映像句柄，不能改读可能已被原位替换的普通路径。
      const descriptor = files.openSync(executableFile, 'r')
      try {
        const before = files.fstatSync(descriptor, { bigint: true })
        result.sha256 = createHash('sha256').update(files.readFileSync(descriptor)).digest('hex')
        const after = files.statSync(executableFile, { bigint: true })
        if (before.dev !== after.dev || before.ino !== after.ino || files.realpathSync(executableFile) !== result.executable) throw new Error('Linux executable identity changed during observation')
        result.executableIdentity = { device: String(before.dev), inode: String(before.ino) }
      }
      finally { files.closeSync(descriptor) }
    }
  }
  const after = parseStat(files.readFileSync(processFile, 'utf8'))
  const taskAfter = parseStat(files.readFileSync(taskFile, 'utf8'))
  if (after.birth !== leader.birth || taskAfter.birth !== task.birth) throw new Error('Linux identity changed during observation')
  return result
}

function currentTask() {
  const match = fs.readlinkSync(path.join('/proc', 'thread-self')).match(/^(\d+)\/task\/(\d+)$/)
  if (!match || Number(match[1]) !== process.pid) throw new Error('Linux thread-self identity unavailable')
  return readEntity(process.pid, Number(match[2]), { executable: true })
}

function sameEntity(left, right) {
  return ['pid', 'tid', 'birth', 'processBirth', 'bootId'].every(key => left[key] === right[key])
}

module.exports = { parseStat, readEntity, currentTask, sameEntity }
