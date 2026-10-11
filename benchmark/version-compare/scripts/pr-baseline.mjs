import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function resolvePrBaseline({ cwd, head, base }) {
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const tested = git(['rev-parse', 'HEAD'])
  const expectedHead = git(['rev-parse', `${head}^{commit}`])
  const eventBase = git(['rev-parse', `${base}^{commit}`])
  if (tested === expectedHead) return { tested, baseline: eventBase }
  const parents = git(['show', '-s', '--format=%P', tested]).split(' ')
  assert.equal(parents.length, 2, 'PR 性能检查必须使用已确认的 head 或临时合并提交')
  assert.equal(parents[1], expectedHead, '临时合并提交不属于本次 PR head')
  // GitHub 可能重新生成 merge ref，而事件的 base.sha 仍停在较旧的主分支。
  git(['merge-base', '--is-ancestor', eventBase, parents[0]])
  return { tested, baseline: parents[0] }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = resolvePrBaseline({ cwd: process.cwd(), head: process.env.PR_HEAD_SHA, base: process.env.PR_BASE_SHA })
  console.log(`PR 性能对照：${result.baseline} -> ${result.tested}`)
  assert.ok(process.env.GITHUB_OUTPUT, '缺少 Actions 输出文件')
  await appendFile(process.env.GITHUB_OUTPUT, `baseline=${result.baseline}\ntested=${result.tested}\n`)
}
