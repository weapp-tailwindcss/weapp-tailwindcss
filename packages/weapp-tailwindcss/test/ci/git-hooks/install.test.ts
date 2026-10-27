import fs from 'node:fs'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { git, hookConfig, install, repository as createRepository, write } from './fixture'

const directories: string[] = []
function repository() {
  const cwd = createRepository()
  directories.push(cwd)
  return cwd
}
afterEach(() => {
  for (const cwd of directories.splice(0)) {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

it('真实安装器迁移遗留的仓库 Husky 路径，重复执行保持配置不变', () => {
  const cwd = repository()
  git(cwd, 'config', '--local', 'core.hooksPath', '.husky/_')
  expect(install(cwd)).toMatchObject({ status: 'installed', migrated: true })
  expect(git(cwd, 'config', '--local', '--get-regexp', '^core\\.')).not.toContain('hookspath')
  const hook = path.join(cwd, '.git', 'hooks', 'pre-commit')
  expect(fs.readFileSync(hook, 'utf8')).toContain('lefthook')
  expect(install(cwd)).toMatchObject({ status: 'installed', migrated: false })
  expect(fs.readFileSync(path.join(cwd, 'lefthook.yml'), 'utf8')).toBe(hookConfig)
})

it.each([
  [{ CI: '1' }, 'ci'],
  [{ LEFTHOOK: '0' }, 'disabled'],
] as const)('禁用环境 %j 在读取配置之前跳过，保留 Git 设置', (env, reason) => {
  const cwd = repository()
  write(cwd, 'repoctl.config.ts', 'throw new Error("must not evaluate")\nexport default {}\n')
  git(cwd, 'config', '--local', 'core.hooksPath', '.husky/_')
  const before = fs.readFileSync(path.join(cwd, '.git', 'config'), 'utf8')
  expect(install(cwd, env)).toMatchObject({ status: 'skipped', reason, migrated: false })
  expect(fs.readFileSync(path.join(cwd, '.git', 'config'), 'utf8')).toBe(before)
  expect(fs.existsSync(path.join(cwd, '.git', 'hooks', 'pre-commit'))).toBe(false)
})

it('保留自定义与全局 hooks 路径，非 Git 目录不安装', () => {
  const cwd = repository()
  git(cwd, 'config', '--local', 'core.hooksPath', 'company-hooks')
  expect(install(cwd)).toMatchObject({ status: 'skipped', reason: 'custom-hooks-path', migrated: false })
  expect(git(cwd, 'config', '--local', '--get', 'core.hooksPath')).toBe('company-hooks')
  git(cwd, 'config', '--local', '--unset-all', 'core.hooksPath')
  git(cwd, 'config', '--file', 'global.gitconfig', 'core.hooksPath', 'global-hooks')
  const global = fs.readFileSync(path.join(cwd, 'global.gitconfig'), 'utf8')
  expect(install(cwd)).toMatchObject({ reason: 'custom-hooks-path', hooksPath: 'global-hooks', migrated: false })
  expect(fs.readFileSync(path.join(cwd, 'global.gitconfig'), 'utf8')).toBe(global)
  expect(fs.existsSync(path.join(cwd, 'global-hooks'))).toBe(false)
  fs.rmSync(path.join(cwd, '.git'), { recursive: true })
  expect(install(cwd)).toMatchObject({ reason: 'not-git', migrated: false })
})

it('无效原生配置不得先清除旧 hooks 路径', () => {
  const cwd = repository()
  git(cwd, 'config', '--local', 'core.hooksPath', '.husky/_')
  write(cwd, 'lefthook.yml', 'pre-commit: [\n')
  expect(() => install(cwd)).toThrow('Could not parse lefthook.yml')
  expect(git(cwd, 'config', '--local', '--get', 'core.hooksPath')).toBe('.husky/_')
})

it('共享 worktree 保留主 checkout 自定义 hooks，禁用安装不改共同 Git 配置', () => {
  const cwd = repository()
  write(cwd, '.husky/pre-commit', 'pnpm exec lint-staged\n')
  write(cwd, 'lint-staged.config.js', 'export default { "*.ts": "company-check" }\n')
  git(cwd, 'add', '.')
  git(cwd, '-c', `core.hooksPath=${path.join(cwd, 'no-hooks')}`, 'commit', '--quiet', '-m', 'chore: initial')
  git(cwd, 'config', '--local', 'core.hooksPath', '.husky/_')
  const linked = path.join(cwd, 'linked')
  git(cwd, 'worktree', 'add', '--detach', linked)
  fs.rmSync(path.join(linked, '.husky'), { recursive: true })
  fs.rmSync(path.join(linked, 'lint-staged.config.js'))
  const config = path.join(cwd, '.git', 'config')
  const before = fs.readFileSync(config, 'utf8')
  expect(install(linked)).toMatchObject({ reason: 'custom-husky', migrated: false })
  expect(install(linked, { LEFTHOOK: '0' })).toMatchObject({ reason: 'disabled', migrated: false })
  expect(fs.readFileSync(config, 'utf8')).toBe(before)
  expect(fs.existsSync(path.join(cwd, '.git', 'hooks', 'pre-commit'))).toBe(false)
})
