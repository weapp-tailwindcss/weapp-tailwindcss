import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { writeNativeInput } from '../../../../../scripts/release-nightly/native-inputs.mjs'
import { env, fixture } from './fixture'

const roots: string[] = []
function setup() {
  const data = fixture()
  roots.push(data.root)
  return data
}

afterEach(() => {
  vi.unstubAllEnvs()
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }))
})

it('容器只信任当前 checkout 的 Git 所有权并采集准确 SHA', () => {
  const { original, context } = setup()
  const config = path.join(original, '.git', 'config')
  const before = readFileSync(config)
  vi.stubEnv('GIT_TEST_ASSUME_DIFFERENT_OWNER', '1')
  const result = writeNativeInput(original, 'aarch64-apple-darwin', { ...env, GITHUB_SHA: context.identity.commit })
  expect(result).toMatchObject({ commit: context.identity.commit, tree: context.tree, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT })
  expect(readFileSync(config)).toEqual(before)
})

it.each([undefined, 'a'.repeat(40)])('缺失或错误工作流 SHA 不覆盖原生产物清单：%s', (sha) => {
  const { original } = setup()
  const sidecar = path.join(original, 'packages', 'weapp-tailwindcss', 'native', 'bindings', 'native-input-darwin-arm64.json')
  const before = readFileSync(sidecar)
  expect(() => writeNativeInput(original, 'aarch64-apple-darwin', { ...env, GITHUB_SHA: sha })).toThrow('workflow SHA')
  expect(readFileSync(sidecar)).toEqual(before)
})
