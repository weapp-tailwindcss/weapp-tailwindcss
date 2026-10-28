import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import micromatch from 'micromatch'

export const stagedGlob = '**/*.{js,jsx,mjs,ts,tsx,mts,vue,json,md,mdx,css,html,yml,yaml,scss}'
export const stagedExcludes = ['.agents/**', '**/.agents/**', 'e2e/__snapshots__/**']

/** Git 的 NUL 输出保留空格、换行和引号；这里处理的是仓库逻辑路径。 */
export function selectStagedFiles(output) {
  return micromatch(output.split('\0').filter(Boolean), stagedGlob, {
    dot: true,
    ignore: stagedExcludes,
  })
}

/** 只检查暂存文件；隐藏、恢复未暂存内容和重新暂存由 Lefthook 统一负责。 */
export async function runStagedEslint(cwd = process.cwd()) {
  const { stdout: root } = await execa('git', ['rev-parse', '--show-toplevel'], { cwd })
  const { stdout } = await execa('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
    cwd: root,
    stripFinalNewline: false,
  })
  const files = selectStagedFiles(stdout)
  if (!files.length) {
    return
  }
  const require = createRequire(import.meta.url)
  const cli = path.join(path.dirname(require.resolve('eslint/package.json')), 'bin', 'eslint.js')
  const args = ['--fix', ...stagedExcludes.flatMap(pattern => ['--ignore-pattern', pattern]), '--']
  // 分批限制参数长度，同时使用 Node 和参数数组避免 Windows shell 重新解释文件名。
  let batch = []
  let length = 0
  const run = selected => execa(process.execPath, [cli, ...args, ...selected], { cwd: root, stdio: 'inherit' })
  for (const file of files) {
    if (batch.length && length + file.length > 7000) {
      await run(batch)
      batch = []
      length = 0
    }
    batch.push(file)
    length += file.length + 3
  }
  await run(batch)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runStagedEslint().catch((error) => {
    process.stderr.write(`${error.shortMessage ?? error.message}\n`)
    process.exitCode = error.exitCode || 1
  })
}
