import assert from 'node:assert/strict'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const viteIntegrationFile = 'packages/weapp-tailwindcss/test/bundlers/vite-plugin.hmr-version-matrix.test.ts'
export const viteIntegrationExclude = '**/test/bundlers/vite-plugin.hmr-version-matrix.test.ts'

export function ownershipCollections() {
  const common = ['--maxWorkers=2', '--update=none']
  return [
    ['vitest', 'run', ...common],
    ...[1, 2, 3].map(shard => ['vitest', 'run', `--shard=${shard}/3`, '--exclude', viteIntegrationExclude, ...common]),
    ['vitest', 'run', viteIntegrationFile, ...common],
  ]
}

/** 按公开 CLI 解析参数，并保留实际 CLI 追加到各项目的排除语义。 */
export async function parseOwnershipCommand(argv) {
  const { parseCLI } = await import('vitest/node')
  const { filter, options } = parseCLI([...argv])
  if (options.exclude) {
    // parseCLI 不包含 CLI 启动阶段的 exclude → cliExclude 归一化。
    options.cliExclude = [
      ...(options.cliExclude ?? []),
      ...(Array.isArray(options.exclude) ? options.exclude : [options.exclude]),
    ]
    delete options.exclude
  }
  return { filters: filter, options }
}

function fileIdentity(entry, repoRoot, paths) {
  assert.equal(typeof entry.file, 'string', '测试文件清单缺少 file')
  const file = paths.relative(repoRoot, paths.resolve(repoRoot, entry.file))
  assert.ok(file && file !== '..' && !file.startsWith(`..${paths.sep}`) && !paths.isAbsolute(file), `测试文件必须属于仓库：${entry.file}`)
  return { file, key: JSON.stringify([entry.projectName ?? '', file]) }
}

function identitySet(entries, repoRoot, paths, label) {
  assert.ok(Array.isArray(entries), `${label} 必须是测试文件数组`)
  const identities = entries.map(entry => fileIdentity(entry, repoRoot, paths))
  const keys = new Set(identities.map(entry => entry.key))
  assert.equal(keys.size, identities.length, `${label} 存在重复的项目与测试文件`)
  return { identities, keys }
}

/** 对照 Vitest 实际文件清单，保证分层前后完整覆盖且每个测试只有一个所有者。 */
export function verifyTestOwnership(all, shards, integration, repoRoot, paths = path) {
  assert.equal(shards.length, 3, '单测必须保留三个分片')
  const baseline = identitySet(all, repoRoot, paths, '默认测试集合')
  assert.ok(baseline.keys.size > 0, '默认测试集合不能为空')
  const target = paths.normalize(viteIntegrationFile)
  const targets = baseline.identities.filter(entry => entry.file === target)
  assert.equal(targets.length, 1, '默认测试集合必须包含且仅包含一个 Vite 版本集成文件')
  const selected = identitySet(integration, repoRoot, paths, 'Vite 集成集合')
  assert.deepEqual([...selected.keys], [targets[0].key], 'Vite 集成作业必须精确执行原版本矩阵文件')

  const owned = new Set(selected.keys)
  const shardCounts = shards.map((entries, index) => {
    const shard = identitySet(entries, repoRoot, paths, `单测分片 ${index + 1}`)
    for (const key of shard.keys) {
      assert.ok(!owned.has(key), `测试文件重复归属：${key}`)
      assert.ok(baseline.keys.has(key), `分层后新增了默认集合之外的测试：${key}`)
      owned.add(key)
    }
    return shard.keys.size
  })
  const missing = [...baseline.keys].filter(key => !owned.has(key))
  assert.deepEqual(missing, [], '分层后的作业遗漏默认测试文件')
  assert.equal(owned.size, baseline.keys.size, '分层前后的测试文件数量不一致')
  return { total: owned.size, shards: shardCounts, integration: selected.keys.size }
}

export async function collectTestOwnership(repoRoot) {
  const { createVitest } = await import('vitest/node')
  const collections = []
  for (const argv of ownershipCollections()) {
    const { options, filters } = await parseOwnershipCommand(argv)
    const ctx = await createVitest({ ...options, root: repoRoot, watch: false })
    try {
      // 复用 filesOnly 的真实文件发现，不加载或执行测试用例。
      let specs = await ctx.getRelevantTestSpecifications(filters.map(file => path.resolve(repoRoot, file)))
      if (ctx.config.shard) {
        // list --filesOnly 不执行分片，必须复用实际执行阶段的已解析 sequencer。
        const Sequencer = ctx.config.sequence.sequencer
        specs = await new Sequencer(ctx).shard(Array.from(specs))
      }
      collections.push(specs.map(spec => ({ file: spec.moduleId, projectName: spec.project.name })))
    }
    finally {
      await ctx.close()
    }
  }
  return verifyTestOwnership(collections[0], collections.slice(1, 4), collections[4], repoRoot)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
  console.log(JSON.stringify(await collectTestOwnership(repoRoot)))
}
