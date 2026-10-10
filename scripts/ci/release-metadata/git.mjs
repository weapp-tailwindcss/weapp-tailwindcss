import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import process from 'node:process'

/**
 * 变更范围的显式边界；未提供时使用 GitHub 事件中的对应字段。
 * @typedef {object} ChangeRangeOptions
 * @property {string} [base] PR 的目标提交。
 * @property {string} [head] PR head 或 push 后的提交。
 * @property {string} [before] push 前的提交。
 * @property {string} [eventName] 只允许 PR 或 push 事件。
 * @property {string | null} [eventPath] GitHub 事件文件；null 表示不读取文件。
 * @property {string} [cwd] Git 仓库的文件系统目录。
 */

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
}

function commit(ref, cwd) {
  if (!ref || /^0+$/.test(ref)) {
    throw new Error('缺少可验证的变更边界')
  }
  return git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], cwd).trim()
}

/**
 * 读取真实的 PR 或 push 差异，不以提交标题推测变更来源。
 * @param {ChangeRangeOptions} [options] 变更范围的边界和事件。
 */
export function readChangeRange({ base, head, before, eventName = process.env.GITHUB_EVENT_NAME, eventPath = process.env.GITHUB_EVENT_PATH, cwd } = {}) {
  let from
  let to
  if (eventName === 'pull_request') {
    const baseCommit = commit(base || process.env.GITHUB_BASE_SHA, cwd)
    to = commit(head || process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA, cwd)
    from = git(['merge-base', baseCommit, to], cwd).trim()
  }
  else if (eventName === 'push') {
    const event = eventPath ? JSON.parse(fs.readFileSync(eventPath, 'utf8')) : {}
    from = commit(before || event.before, cwd)
    to = commit(head || event.after || process.env.GITHUB_SHA, cwd)
  }
  else {
    throw new Error('当前事件没有明确的 PR 或 push 变更边界')
  }
  const fields = git(['diff', '--no-renames', '--name-status', '-z', from, to, '--'], cwd).split('\0')
  const changes = []
  for (let index = 0; fields[index]; index += 2) {
    const status = fields[index]
    const file = fields[index + 1]
    if (!['A', 'M', 'D', 'T'].includes(status) || !file) {
      throw new Error('无法确认变更文件身份')
    }
    changes.push({ status, file })
  }
  return { from, to, changes }
}

export function readSnapshot(ref, cwd) {
  const entries = new Map()
  for (const field of git(['ls-tree', '-r', '-z', ref], cwd).split('\0').filter(Boolean)) {
    const separator = field.indexOf('\t')
    const [mode, type, hash] = field.slice(0, separator).split(' ')
    entries.set(field.slice(separator + 1), { mode, type, hash })
  }
  const cache = new Map()
  return {
    paths: [...entries.keys()],
    read(file) {
      const entry = entries.get(file)
      if (!entry) {
        return null
      }
      if (entry.mode !== '100644' || entry.type !== 'blob') {
        throw new Error(`元数据不是普通文本文件：${file}`)
      }
      if (!cache.has(file)) {
        cache.set(file, git(['cat-file', 'blob', entry.hash], cwd))
      }
      return cache.get(file)
    },
  }
}
