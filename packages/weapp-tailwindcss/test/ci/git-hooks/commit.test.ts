import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'
import { addFailure, commit, environment, git, hookRepository, lefthookCli, messageFileEnv, run, write } from './fixture'

const directories: string[] = []
function repository(prefix?: string) {
  const cwd = hookRepository(prefix)
  directories.push(cwd)
  return cwd
}
afterEach(() => {
  for (const cwd of directories.splice(0)) {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

it('真实提交只修复暂存文件，文件名不经过 shell 插值', () => {
  const cwd = repository()
  const files = ['root.ts', '-root.ts', 'src/中文 component\'s.ts', 'src/$(echo injected).ts']
  if (process.platform !== 'win32') {
    files.push('src/line\nbreak.ts', 'src/double"quote.ts')
  }
  for (const file of files) {
    write(cwd, file, 'export const value = "staged";\n')
  }
  write(cwd, '.agents/skip.ts', 'not valid javascript\n')
  write(cwd, 'e2e/__snapshots__/skip.ts', 'not valid javascript\n')
  git(cwd, 'add', '--', ...files, '.agents', 'e2e')
  write(cwd, 'unstaged.ts', 'UNSTAGED_SENTINEL\n')
  const result = commit(cwd)
  expect(result.status, result.output).toBe(0)
  for (const file of files) {
    expect(git(cwd, 'show', `HEAD:${file}`)).toBe('export const value = \'staged\'')
  }
  expect(git(cwd, 'show', 'HEAD:.agents/skip.ts')).toBe('not valid javascript')
  expect(runFile(cwd, 'unstaged.ts')).toBe('UNSTAGED_SENTINEL\n')
  expect(git(cwd, 'ls-files')).not.toContain('unstaged.ts')
})

function runFile(cwd: string, file: string) {
  return fs.readFileSync(path.join(cwd, file), 'utf8')
}

it.each([false, true])('部分暂存内容被修复，未暂存内容在后续检查失败=%s时仍恢复', (fail) => {
  const cwd = repository()
  const middle = Array.from({ length: 20 }, (_, index) => `// line ${index}`).join('\n')
  const before = `export const value = 'original'\n${middle}\nexport const tail = 'original'\n`
  write(cwd, 'partial.ts', before)
  git(cwd, 'add', 'partial.ts')
  expect(commit(cwd).status).toBe(0)
  const head = git(cwd, 'rev-parse', 'HEAD')
  const staged = before.replace('\'original\'', '"staged";')
  write(cwd, 'partial.ts', staged)
  git(cwd, 'add', 'partial.ts')
  write(cwd, 'partial.ts', staged.replace('export const tail = \'original\'', 'UNSTAGED_SENTINEL'))
  if (fail) {
    addFailure(cwd)
  }
  const result = commit(cwd)
  expect(result.status === 0, result.output).toBe(!fail)
  const fixed = before.replace('\'original\'', '\'staged\'')
  expect(git(cwd, 'show', `${fail ? '' : 'HEAD'}:partial.ts`)).toBe(fixed.trim())
  expect(runFile(cwd, 'partial.ts')).toBe(fixed.replace('export const tail = \'original\'', 'UNSTAGED_SENTINEL'))
  expect(git(cwd, 'stash', 'list')).toBe('')
  if (fail) {
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(head)
  }
})

it('恢复发生冲突时阻止提交，保留原暂存内容及未暂存修改', () => {
  const cwd = repository()
  write(cwd, 'conflict.ts', 'export const value = \'original\'\n')
  git(cwd, 'add', 'conflict.ts')
  expect(commit(cwd).status).toBe(0)
  const head = git(cwd, 'rev-parse', 'HEAD')
  write(cwd, 'conflict.ts', 'export const value = "staged";\n')
  git(cwd, 'add', 'conflict.ts')
  write(cwd, 'conflict.ts', 'export const value = "unstaged";\n')
  const result = commit(cwd)
  expect(result.status, result.output).not.toBe(0)
  expect(git(cwd, 'rev-parse', 'HEAD')).toBe(head)
  expect(git(cwd, 'show', ':conflict.ts')).toBe('export const value = "staged";')
  expect(runFile(cwd, 'conflict.ts')).toBe('export const value = "unstaged";\n')
})

it('处理重命名与删除，并通过真实 commitlint 拒绝无效提交消息', () => {
  const cwd = repository()
  write(cwd, 'old.ts', 'export const value = \'original\'\n')
  write(cwd, 'deleted.ts', 'export const removed = true\n')
  git(cwd, 'add', 'old.ts', 'deleted.ts')
  expect(commit(cwd).status).toBe(0)
  git(cwd, 'mv', 'old.ts', 'renamed 中文.ts')
  git(cwd, 'rm', 'deleted.ts')
  write(cwd, 'renamed 中文.ts', 'export const value = "renamed";\n')
  git(cwd, 'add', 'renamed 中文.ts')
  const head = git(cwd, 'rev-parse', 'HEAD')
  expect(commit(cwd, 'invalid message').status).not.toBe(0)
  expect(git(cwd, 'rev-parse', 'HEAD')).toBe(head)
  const result = commit(cwd)
  expect(result.status, result.output).toBe(0)
  expect(git(cwd, 'show', 'HEAD:renamed 中文.ts')).toBe('export const value = \'renamed\'')
  expect(git(cwd, 'ls-files')).not.toContain('deleted.ts')
  git(cwd, 'rm', 'renamed 中文.ts')
  const deletion = commit(cwd)
  expect(deletion.status, deletion.output).toBe(0)
})

it('commit-msg 将包含空格、中文和单引号的消息文件路径传给 commitlint', () => {
  const cwd = repository('weapp-hooks 中文\'s-')
  const file = path.join(cwd, 'message 中文\'s.txt')
  write(cwd, path.relative(cwd, file), 'chore: verify message path\n')
  const result = run(cwd, 'git', ['hook', 'run', 'commit-msg', '--', file])
  expect(result.status, result.output).toBe(0)
  fs.writeFileSync(file, 'invalid message\n')
  expect(run(cwd, 'git', ['hook', 'run', 'commit-msg', '--', file]).status).not.toBe(0)
})

it('绕过官方 Git hook 的裸 Lefthook 调用缺少原始路径时失败关闭', () => {
  const cwd = repository()
  const file = path.join(cwd, 'message.txt')
  fs.writeFileSync(file, 'chore: verify message path\n')
  const result = run(cwd, process.execPath, [lefthookCli, 'run', 'commit-msg', file])
  expect(result.status, result.output).not.toBe(0)
  expect(result.output).toContain('缺少 Git 提交消息路径')
})

it('官方 Git hook 用本次原始路径覆盖陈旧环境变量', () => {
  const cwd = repository()
  const file = path.join(cwd, 'message 中文\'s.txt')
  const stale = path.join(cwd, 'stale.txt')
  const env = { ...environment(cwd), [messageFileEnv]: stale }
  fs.writeFileSync(stale, 'invalid message\n')
  fs.writeFileSync(file, 'chore: use original argument\n')
  const result = run(cwd, 'git', ['hook', 'run', 'commit-msg', '--', file], env)
  expect(result.status, result.output).toBe(0)
  fs.writeFileSync(stale, 'chore: stale argument\n')
  fs.writeFileSync(file, 'invalid message\n')
  expect(run(cwd, 'git', ['hook', 'run', 'commit-msg', '--', file], env).status).not.toBe(0)
})

it('官方 Git hook 缺少本次路径时清空陈旧环境变量并拒绝检查', () => {
  const cwd = repository()
  const stale = path.join(cwd, 'stale.txt')
  fs.writeFileSync(stale, 'chore: stale argument\n')
  const result = run(cwd, 'git', ['hook', 'run', 'commit-msg'], { ...environment(cwd), [messageFileEnv]: stale })
  expect(result.status, result.output).not.toBe(0)
  expect(result.output).toContain('缺少 Git 提交消息路径')
})
