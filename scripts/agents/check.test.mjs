import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'vitest'
import { checkRepository, localLinks, validateCommand, validateLesson } from './check.mjs'

it('只提取本地文档引用，忽略 URL 和代码块', () => {
  assert.deepEqual(localLinks('[a](../a.md#title) [web](https://example.com)\n```md\n[x](missing)\n```'), ['../a.md'])
})

it('检查 pnpm filter、脚本、exec 与占位命令', () => {
  const dir = path.resolve('fixture')
  const manifests = [{ dir, name: 'demo', scripts: { test: 'vitest run' } }]
  assert.deepEqual(validateCommand('pnpm --filter demo test', dir, manifests), [])
  assert.deepEqual(validateCommand('pnpm --filter <name> test', dir, manifests), [])
  assert.equal(validateCommand('pnpm --filter missing test', dir, manifests).length, 1)
  assert.equal(validateCommand('pnpm --filter demo vitest run', dir, manifests).length, 1)
  assert.equal(validateCommand('pnpm build', dir, manifests).length, 1)
  assert.equal(validateCommand('pnpm exec vitest run test/missing.test.ts', dir, manifests).length, 1)
})

it('接受 pnpm 内置 change，但 run 仍须对应真实脚本', () => {
  const dir = path.resolve('fixture')
  const manifest = { dir, name: 'demo', scripts: {} }
  assert.deepEqual(validateCommand('pnpm change status', dir, [manifest]), [])
  assert.deepEqual(validateCommand('pnpm --filter demo change --bump patch', dir, [manifest]), [])
  assert.equal(validateCommand('pnpm run change status', dir, [manifest]).length, 1)
  assert.equal(validateCommand('pnpm run install', dir, [manifest]).length, 1)
  manifest.scripts.change = 'repo change'
  assert.deepEqual(validateCommand('pnpm run change status', dir, [manifest]), [])
})

it.each([path.posix.resolve('/repo'), path.win32.resolve('C:\\repo')])('显式包命令不依赖宿主路径分隔符：%s', (dir) => {
  const manifests = [{ dir, name: 'demo', scripts: { test: 'vitest run' } }]
  assert.deepEqual(validateCommand('pnpm --filter demo test', dir, manifests), [])
})

it('仓库检查发现未登记规则、断链，并排除冒名测试 fixture 的 manifest', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'agents-repository-'))
  const put = (file, content) => {
    const absolute = path.resolve(root, file)
    mkdirSync(path.dirname(absolute), { recursive: true })
    writeFileSync(absolute, content)
  }
  try {
    execFileSync('git', ['init', '--quiet', root])
    put('package.json', JSON.stringify({ name: 'root', scripts: { test: 'vitest run' } }))
    put('pnpm-workspace.yaml', 'packages: [packages/*, "!**/test/**"]\n')
    put('AGENTS.md', '# 根规则\n`pnpm test`\n[领域](packages/demo/AGENTS.md)\n')
    put('packages/demo/package.json', JSON.stringify({ name: 'demo', scripts: { test: 'vitest run' } }))
    put('packages/demo/test/fixtures/package.json', JSON.stringify({ name: 'demo', scripts: {} }))
    put('packages/demo/AGENTS.md', '# 领域\n`pnpm --filter demo test`\n')
    put('docs/engineering/agent-index.md', '[root](../../AGENTS.md)\n[demo](../../packages/demo/AGENTS.md)\n')
    assert.deepEqual(checkRepository(root).errors, [])
    put('packages/demo/new/AGENTS.md', '# 未登记\n[不存在](missing.md)\n')
    const errors = checkRepository(root).errors
    assert.ok(errors.some(error => error.includes('未登记索引')))
    assert.ok(errors.some(error => error.includes('链接不存在')))
    put('extra/AGENTS.md', '# 新领域\n[编码错误](%ZZ.md)\n')
    const routeErrors = checkRepository(root).errors
    assert.ok(routeErrors.some(error => error.includes('遗漏领域路由')))
    assert.ok(routeErrors.some(error => error.includes('链接编码无效')))
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it('复盘要求状态、基线、持久回归和非空验证章节', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'agents-check-'))
  try {
    writeFileSync(path.join(root, 'regression.test.ts'), '')
    const valid = [
      '---',
      'status: partial',
      'issue: https://github.com/sonofmagic/weapp-tailwindcss/issues/1144',
      `baseline: "${'a'.repeat(40)}"`,
      'regressions: [regression.test.ts]',
      '---',
      ...['症状', '根因与纠正', '验证', '适用边界', '规则评估'].map(title => `## ${title}\n证据\n`),
    ].join('\n')
    assert.deepEqual(validateLesson(valid, root), [])
    writeFileSync(path.join(root, 'podfile.test.rb'), '')
    writeFileSync(path.join(root, 'helper.rb'), '')
    assert.deepEqual(validateLesson(valid.replace('regression.test.ts', 'podfile.test.rb'), root), [])
    for (const invalid of ['missing.test.rb', 'helper.rb', path.join(root, 'podfile.test.rb'), '../podfile.test.rb', 'C:/repo/podfile.test.rb', 'C:\\repo\\podfile.test.rb']) {
      assert.ok(validateLesson(valid.replace('regression.test.ts', JSON.stringify(invalid)), root).length, invalid)
    }
    assert.deepEqual(validateLesson(valid.replace(/\n/g, '\r\n'), root), [])
    assert.ok(validateLesson(valid.replace('regression.test.ts', 'missing.test.ts'), root).length)
    assert.ok(validateLesson(valid.replace('partial', 'superseded'), root).length)
    assert.ok(validateLesson(valid.replace('## 验证\n证据', '## 验证\n'), root).length)
    assert.ok(validateLesson('没有 frontmatter', root).length)
    assert.ok(validateLesson('---\n[invalid\n---\n', root).length)
    assert.ok(validateLesson('---\n[]\n---\n', root).length)
    assert.ok(validateLesson(valid.replace('regression.test.ts', 'C:/repo/regression.test.ts'), root).length)
    assert.ok(validateLesson(valid.replace('status: partial', 'status: superseded\nsupersededBy: [wrong]'), root).length)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
