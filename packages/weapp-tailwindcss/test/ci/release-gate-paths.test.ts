import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import micromatch from 'micromatch'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { readChangedFiles, resolveChangeScopes } from '../../../../scripts/ci/resolve-pr-scope.mjs'
import { gitFixture } from './release-metadata/fixture'

const workflowPath = fileURLToPath(new URL('../../../../.github/workflows/release-gate.yml', import.meta.url))
const workflow = parse(fs.readFileSync(workflowPath, 'utf8'))
const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('nightly 发布输入的独立 PR 门禁', () => {
  it.each([
    'scripts/release-nightly/index.mjs',
    'scripts/release-nightly/route.mjs',
    'scripts/release-nightly/native-input.mjs',
    'scripts/release-nightly/native-inputs.mjs',
    'scripts/release-nightly/consumer.mjs',
    'scripts/release-nightly/consumer-linux.sh',
    '.github/workflows/nightly-consumers.yml',
  ])('单独变更触发 Release Gate 并启用 native 校验：%s', (file) => {
    const base = { 'README.md': 'initial\n' }
    const { cwd, before, after } = gitFixture({ base, head: { ...base, [file]: 'changed\n' } })
    temporaryDirectories.push(cwd)
    const options = { cwd, eventName: 'pull_request', base: before, head: after }
    const files = readChangedFiles(options)

    expect(files).toEqual([file])
    expect(micromatch(files, workflow.on.pull_request.paths)).toEqual([file])
    expect(resolveChangeScopes(options)).toMatchObject({
      core: true,
      metadata_only: false,
      has_changes: true,
    })
  })

  it('native 校验仍由实际内容范围启用，并作为最终发布门禁的依赖', () => {
    expect(workflow.jobs.scope.uses).toBe('./.github/workflows/ci-scope.yml')
    expect(workflow.jobs['native-artifacts']).toMatchObject({
      needs: 'scope',
      if: 'needs.scope.outputs.core == \'true\'',
      uses: './.github/workflows/native.yml',
    })
    expect(workflow.jobs['release-gate'].needs).toContain('native-artifacts')
  })

  it('新增 nightly 规则不扩大到无关文档或网站源码', () => {
    expect(micromatch(['README.md', 'website/src/pages/index.tsx'], workflow.on.pull_request.paths)).toEqual([])
  })
})
