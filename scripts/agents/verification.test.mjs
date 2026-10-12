import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'vitest'
import { stringify } from 'yaml'
import { checkRepository, validateLesson } from './check.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const evidence = {
  claim: '已有服务连接回归通过',
  kind: 'integration',
  status: 'passed',
  sha: '7623470bddfb3e3ada51cefbdbd6527015867220',
  environment: 'macOS / Node 24',
  command: 'CI=1 pnpm agents:test --update=none',
}

function lesson(verification, include = true) {
  const metadata = {
    status: 'partial',
    issue: 'https://github.com/sonofmagic/weapp-tailwindcss/pull/1172',
    baseline: evidence.sha,
    regressions: ['scripts/agents/check.test.mjs'],
    ...(include ? { verification } : {}),
  }
  return `---\n${stringify(metadata)}---\n${['症状', '根因与纠正', '验证', '适用边界', '规则评估'].map(title => `## ${title}\n记录\n`).join('\n')}`
}

it('兼容未采用 verification 的历史复盘', () => {
  assert.deepEqual(validateLesson(lesson(undefined, false), root), [])
})

it.each(['unit', 'integration', 'ci', 'native'])('接受 %s 的已执行证据与失败记录', (kind) => {
  const passed = { ...evidence, kind }
  const failed = { ...passed, status: 'failed', url: 'https://example.com/actions/runs/123' }
  delete failed.command
  assert.deepEqual(validateLesson(lesson([passed, failed]), root), [])
})

it.each(['\n', '\r\n'])('保留单项通过、失败与原生待验收的独立语义，换行 %j', (newline) => {
  const pending = { ...evidence, kind: 'native', status: 'pending', environment: 'Windows 11 / HBuilderX stable', reason: '没有可用交互桌面' }
  delete pending.command
  const markdown = lesson([evidence, { ...evidence, status: 'failed' }, pending]).replace(/\n/g, newline)
  assert.deepEqual(validateLesson(markdown, root), [])
})

it.each([null, {}, 'passed', [], [null], [[]], ['evidence']].map(value => [value]))('拒绝非记录数组或空证据：%j', (value) => {
  assert.ok(validateLesson(lesson(value), root).some(error => error.includes('verification')))
})

it.each([
  ['claim', undefined],
  ['claim', '  '],
  ['claim', 1],
  ['environment', []],
  ['environment', null],
  ['environment', ''],
  ['kind', 'browser'],
  ['kind', null],
  ['status', 'skipped'],
  ['status', true],
  ['sha', 'abc123'],
  ['sha', `${'a'.repeat(40)}\n`],
  ['sha', 'g'.repeat(40)],
  ['sha', 123],
  ['sha', ['a'.repeat(40)]],
  ['command', 42],
  ['command', '  '],
  ['url', []],
  ['url', 'https://'],
  ['url', 'http://example.com'],
  ['url', 'file:///evidence'],
  ['url', 'https:example.com'],
  ['reason', false],
  ['reason', ''],
  ['unexpected', 'typo'],
])('报告字段 %s 的非法值 %j', (field, value) => {
  const record = { ...evidence, [field]: value }
  if (value === undefined) {
    delete record[field]
  }
  assert.ok(validateLesson(lesson([record]), root).some(error => error.includes(`verification[1].${field}`)))
})

it.each(['passed', 'failed'])('%s 必须提供命令或 HTTPS 来源', (status) => {
  const record = { ...evidence, status }
  delete record.command
  assert.ok(validateLesson(lesson([record]), root).some(error => error.includes('verification[1]') && error.includes('command 或 url')))
})

it('有命令或 URL 也不能省略待验收原因', () => {
  assert.ok(validateLesson(lesson([{ ...evidence, status: 'pending' }]), root).some(error => error.includes('verification[1].reason')))
})

it('支持多个来源，同时定位第二条记录的字段错误', () => {
  assert.deepEqual(validateLesson(lesson([{ ...evidence, url: 'https://example.com/run' }]), root), [])
  const errors = validateLesson(lesson([evidence, { ...evidence, environment: 123 }]), root)
  assert.deepEqual(errors, ['verification[2].environment 必须是非空字符串'])
})

it('仓库检查给出文件与记录位置，不执行命令、不联网、不改写证据', () => {
  const directory = mkdtempSync(path.join(tmpdir(), '证据 & agents-'))
  try {
    const put = (file, content) => {
      const absolute = path.resolve(directory, file)
      mkdirSync(path.dirname(absolute), { recursive: true })
      writeFileSync(absolute, content)
    }
    execFileSync('git', ['init', '--quiet', directory])
    put('package.json', JSON.stringify({ name: 'root', scripts: {} }))
    put('pnpm-workspace.yaml', 'packages: []\n')
    put('AGENTS.md', '# 根规则\n')
    put('docs/engineering/agent-index.md', '[root](../../AGENTS.md)\n')
    put('scripts/agents/check.test.mjs', '')
    const file = 'docs/engineering/lessons/evidence.md'
    const marker = path.join(directory, 'must-not-execute')
    const command = `node -e 'require("node:fs").writeFileSync(${JSON.stringify(marker)}, "wrong")'`
    const markdown = lesson([{ ...evidence, command, url: 'https://127.0.0.1:1/unreachable' }, { ...evidence, sha: 'bad' }])
    put(file, markdown)
    const before = execFileSync('git', ['status', '--porcelain=v1', '-z'], { cwd: directory })
    assert.deepEqual(checkRepository(directory).errors, [`${file}：verification[2].sha 必须是完整 SHA`])
    assert.equal(readFileSync(path.join(directory, file), 'utf8'), markdown)
    assert.equal(existsSync(marker), false)
    assert.deepEqual(execFileSync('git', ['status', '--porcelain=v1', '-z'], { cwd: directory }), before)
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
