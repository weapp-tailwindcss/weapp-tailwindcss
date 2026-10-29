const assert = require('node:assert/strict')

/** 只消费编译图中已有身份和关联，不读取源码、物化 source 或猜测目录。 */
function assetOwnership(compilation, assets) {
  const modules = [...compilation.modules]
  const chunks = [...compilation.chunks]
  assert.ok(modules.length <= 32768 && chunks.length <= 4096, '资产归属图超过固定上限')
  assert.ok(compilation.chunkGraph?.getChunkModulesIterable && compilation.chunkGraph?.getModuleId, '资产归属缺少真实 chunkGraph')
  const moduleNumbers = new Map(modules.map((module, index) => [module, index]))
  const moduleRecords = modules.map((module, number) => {
    assert.equal(typeof module.identifier, 'function', '资产归属缺少 module identifier')
    return {
      number, identifier: module.identifier(), id: compilation.chunkGraph.getModuleId(module) ?? null,
      resource: module.resource ?? null, type: module.type ?? null, layer: module.layer ?? null,
      buildHash: module.buildInfo?.hash ?? null,
      emittedAssets: Object.keys(module.buildInfo?.assets ?? {}).sort(),
    }
  })
  const chunkRecords = chunks.map((chunk, number) => {
    const members = [...compilation.chunkGraph.getChunkModulesIterable(chunk)]
    assert.ok(members.every(module => moduleNumbers.has(module)), 'chunk 引用了 compilation 以外的 module')
    return {
      number, id: chunk.id ?? null, name: chunk.name ?? null,
      files: [...chunk.files].sort(), auxiliaryFiles: [...chunk.auxiliaryFiles].sort(),
      modules: members.map(module => moduleNumbers.get(module)).sort((a, b) => a - b),
    }
  })
  const owners = assets.map(({ name }) => ({
    name,
    chunks: chunkRecords.filter(chunk => chunk.files.includes(name) || chunk.auxiliaryFiles.includes(name)).map(chunk => chunk.number),
    modules: moduleRecords.filter(module => module.emittedAssets.includes(name)).map(module => module.number),
  }))
  const taps = hook => (hook?.taps ?? []).map(tap => ({ name: tap.name, type: tap.type, stage: tap.stage ?? 0, before: tap.before ?? null }))
  return {
    source: 'webpack-compilation-graph', modules: moduleRecords, chunks: chunkRecords, assets: owners,
    taps: { processAssets: taps(compilation.hooks.processAssets), afterProcessAssets: taps(compilation.hooks.afterProcessAssets) },
    boundary: '原始 module identifier/resource/buildHash 与显式 chunk/module 资产边；没有源码正文或隐式归属推断。',
  }
}

module.exports = { assetOwnership }
