import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import YAML from 'yaml'

export const root = path.resolve(import.meta.dirname, '../../../../..')
const require = createRequire(path.join(root, 'package.json'))
const manifest = require.resolve('repoctl/package.json')
export const repoCli = path.join(path.dirname(manifest), require(manifest).bin.repo)
const hookManifest = require.resolve('lefthook/package.json')
export const lefthookCli = path.join(path.dirname(hookManifest), require(hookManifest).bin.lefthook)
export const hookConfig = fs.readFileSync(path.join(root, 'lefthook.yml'), 'utf8')

export function write(cwd: string, file: string, content: string) {
  const target = path.join(cwd, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

export function environment(cwd: string, source = process.env): NodeJS.ProcessEnv {
  const env = { ...source }
  // Windows 可能使用 Path，传给子进程前统一键名，避免丢失 git.exe 的原搜索目录。
  const searchPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1]
  for (const key of Object.keys(env).filter(key => key.toLowerCase() === 'path')) {
    delete env[key]
  }
  for (const key of ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_COUNT']) {
    delete env[key]
  }
  return {
    ...env,
    PATH: [path.join(root, 'node_modules', '.bin'), path.dirname(process.execPath), searchPath].filter(Boolean).join(path.delimiter),
    CI: 'false',
    LEFTHOOK: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(cwd, 'global.gitconfig'),
    npm_config_verify_deps_before_run: 'false',
    npm_config_manage_package_manager_versions: 'false',
  }
}

export function run(cwd: string, command: string, args: string[], env = environment(cwd)) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 30_000 })
  if (result.error) {
    throw result.error
  }
  return { ...result, output: `${result.stdout}${result.stderr}` }
}

export function git(cwd: string, ...args: string[]) {
  const result = run(cwd, 'git', args)
  if (result.status !== 0) {
    throw new Error(result.output)
  }
  return result.stdout.trim()
}

export function repository() {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'weapp-hooks-')))
  write(cwd, 'global.gitconfig', '')
  git(cwd, 'init', '--quiet', '--initial-branch=main')
  git(cwd, 'config', 'user.name', 'Hook Fixture')
  git(cwd, 'config', 'user.email', 'hooks@example.test')
  git(cwd, 'config', 'commit.gpgsign', 'false')
  git(cwd, 'config', 'core.autocrlf', 'false')
  write(cwd, 'package.json', JSON.stringify({
    private: true,
    type: 'module',
    scripts: { prepare: 'repo tooling hooks install --json' },
  }))
  write(cwd, '.gitignore', 'node_modules/\nglobal.gitconfig\n.npmrc\n')
  write(cwd, '.npmrc', 'verify-deps-before-run=false\nmanage-package-manager-versions=false\n')
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(cwd, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  write(cwd, 'lefthook.yml', hookConfig)
  write(cwd, 'pnpm-workspace.yaml', 'allowBuilds:\n  lefthook: false\n')
  return cwd
}

export function install(cwd: string, overrides: NodeJS.ProcessEnv = {}) {
  const result = run(cwd, process.execPath, [repoCli, 'tooling', 'hooks', 'install', '--json'], { ...environment(cwd), ...overrides })
  if (result.status !== 0) {
    throw new Error(result.output)
  }
  return JSON.parse(result.stdout)
}

export function commit(cwd: string, message = 'chore: verify hooks') {
  return run(cwd, 'git', ['commit', '--quiet', '-m', message])
}

export function hookRepository() {
  const cwd = repository()
  write(cwd, path.join('scripts', 'git-hooks', 'staged-eslint.mjs'), fs.readFileSync(path.join(root, 'scripts', 'git-hooks', 'staged-eslint.mjs'), 'utf8'))
  write(cwd, 'eslint.config.js', `export default [{ files: ['**/*.{js,ts}'], rules: { quotes: ['error', 'single'], semi: ['error', 'never'], 'no-undef': 'error' } }]\n`)
  write(cwd, 'commitlint.config.ts', fs.readFileSync(path.join(root, 'commitlint.config.ts'), 'utf8'))
  git(cwd, 'add', '.')
  git(cwd, '-c', `core.hooksPath=${path.join(cwd, 'no-hooks')}`, 'commit', '--quiet', '-m', 'chore: initial fixture')
  install(cwd)
  return cwd
}

export function addFailure(cwd: string) {
  const config = YAML.parse(hookConfig)
  config['pre-commit'].jobs.push({ name: 'failure', run: 'node -e "process.exit(1)"' })
  write(cwd, 'lefthook.yml', YAML.stringify(config))
}
