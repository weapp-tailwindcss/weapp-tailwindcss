const phaseKey = phase => `${phase?.type}:${phase?.round ?? ''}`
const candidateKey = collections => JSON.stringify(Object.entries(collections ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, values]) => [name, [...values].sort()]))

/** Webpack 保留实际创建、child 与根 compilation 的独立关联契约。 */
export function verifyWebpackCompletions(events, snapshots, status) {
  const count = name => events.filter(event => event.name === name).length
  if (count('webpack.created') !== status.webpackCreatedCount || count('webpack.completed') !== status.webpackCompletedCount) {
    throw new Error('Mpx 编译次数与最后状态不一致')
  }
  const compilations = new Map()
  for (const event of events.filter(item => item.name === 'webpack.created' || item.name === 'webpack.completed')) {
    const { compilationId, isChild } = event.details
    if (event.name === 'webpack.created') {
      if (!Number.isInteger(compilationId) || compilations.has(compilationId) || typeof isChild !== 'boolean') {
        throw new Error('Webpack compilation 创建身份无效或重复')
      }
      compilations.set(compilationId, { isChild, completed: false })
    }
    else {
      const creation = compilations.get(compilationId)
      if (!creation || creation.completed || creation.isChild !== isChild) {
        throw new Error('Webpack compilation 完成身份不匹配')
      }
      creation.completed = true
    }
  }
  const selectedCompilations = new Map(events.filter(event => event.name === 'webpack.completed' && event.details.selectedForSnapshot).map(event => [event.details.compilationId, event]))
  const rootSnapshots = []
  for (const [name, inputs] of snapshots) {
    if (inputs.phase.type === 'watch-stop') {
      if (inputs.compilationId !== undefined) {
        throw new Error('停止采样不能虚构 compilation 身份')
      }
      continue
    }
    const completion = selectedCompilations.get(inputs.compilationId)
    const creation = compilations.get(inputs.compilationId)
    if (!completion || !creation || creation.isChild !== false || completion.details.isChild !== false
      || completion.details.startedPhase.type !== inputs.phase.type || completion.details.startedPhase.round !== inputs.phase.round) {
      throw new Error('阶段快照必须对应已完成的非 child 根 compilation')
    }
    rootSnapshots.push({ file: name, compilationId: inputs.compilationId })
    selectedCompilations.delete(inputs.compilationId)
  }
  if (selectedCompilations.size) {
    throw new Error('根 compilation 缺少对应阶段快照')
  }
  return { webpackCreated: count('webpack.created'), webpackCompleted: count('webpack.completed'), rootSnapshots }
}

/** Vite 只关联实际 finalizer 完成，不虚构 Webpack 创建或 child 身份。 */
export function verifyViteCompletions(events, snapshots, status) {
  for (const event of events) {
    const data = event.details
    const text = value => Boolean(value?.text?.file)
    const invalid = (event.name === 'generator.generate.start' && (!text(data.source?.css) || !data.options))
      || (event.name === 'native.generate.start' && (!text(data.source?.css) || !data.request))
      || (event.name === 'engine.compile.start' && !text(data.css))
      || (event.name === 'engine.build.success' && !text(data.css))
      || (event.name === 'generator.generate.success' && (!text(data.result?.css) || !text(data.result?.rawCss)))
    if (invalid) {
      throw new Error(`Vite 逐请求或 CSS 全文证据缺失：${event.name}`)
    }
  }
  const completed = events.filter(event => event.name === 'vite.completed')
  if (completed.length !== status.viteCompletedCount || status.compilationCount !== completed.length) {
    throw new Error('Vite 完成次数与最后状态不一致')
  }
  const selected = new Map()
  const phases = new Set()
  for (const [index, event] of completed.entries()) {
    const { finalizationId, selectedForSnapshot } = event.details
    const key = phaseKey(event.phase)
    const expected = event.phase.type !== 'watch-stop' && !phases.has(key)
    if (finalizationId !== index + 1 || selectedForSnapshot !== expected) {
      throw new Error('Vite 完成身份、首个阶段选择无效或重复')
    }
    phases.add(key)
    if (selectedForSnapshot) {
      selected.set(finalizationId, event)
    }
  }
  const finalizations = []
  const sourceSnapshots = new Map()
  for (const event of events.filter(item => item.name === 'source.snapshot')) {
    const { snapshotIndex, storeId } = event.details
    const key = `${snapshotIndex}:${storeId}`
    if (!Number.isInteger(snapshotIndex) || snapshotIndex < 1 || !Number.isInteger(storeId) || storeId < 1 || sourceSnapshots.has(key)) {
      throw new Error('来源快照身份缺失或重复')
    }
    sourceSnapshots.set(key, event)
  }
  for (const [file, inputs] of snapshots) {
    if (inputs.phase.type === 'watch-stop') {
      if (inputs.finalizationId !== undefined || inputs.compilationId !== undefined || inputs.compilationCandidates !== undefined) {
        throw new Error('停止采样不能虚构 Vite 完成身份或候选')
      }
    }
    else {
      const event = selected.get(inputs.finalizationId)
      if (!event || inputs.compilationId !== undefined || phaseKey(event.phase) !== phaseKey(inputs.phase)
        || candidateKey(event.details.collections) !== candidateKey(inputs.compilationCandidates)) {
        throw new Error('Vite 阶段快照必须对应唯一实际完成及候选')
      }
      selected.delete(inputs.finalizationId)
      finalizations.push({ file, finalizationId: inputs.finalizationId })
    }
    if (!inputs.sources?.length) {
      throw new Error('Vite 来源快照缺失')
    }
    for (const source of inputs.sources) {
      const key = `${inputs.index}:${source.storeId}`
      const event = sourceSnapshots.get(key)
      if (!event || phaseKey(event.phase) !== phaseKey(inputs.phase)) {
        throw new Error('来源全文快照与阶段或 store 身份不匹配')
      }
      sourceSnapshots.delete(key)
      const layers = event.details.layers
      const expectedLayers = Object.entries(source.maps).filter(([name]) => /^(?:sourceById|.*SourceById)$/.test(name))
      if (!Array.isArray(layers) || layers.length !== expectedLayers.length) {
        throw new Error('来源全文层缺失或重复')
      }
      for (const [layer, entries] of expectedLayers) {
        const matching = layers.filter(item => item.layer === layer)
        if (matching.length !== 1 || matching[0].files.length !== entries.length) {
          throw new Error('来源全文层或文件数量不匹配')
        }
        const remaining = new Map(entries.map(entry => [entry.key, entry]))
        for (const item of matching[0].files) {
          const entry = remaining.get(item.file)
          if (!entry || item.source?.text?.sha256 !== entry.sha256 || item.source.text.utf16Length !== entry.utf16Length) {
            throw new Error('来源全文与同次候选快照哈希不匹配')
          }
          remaining.delete(item.file)
        }
      }
    }
  }
  if (selected.size || sourceSnapshots.size) {
    throw new Error('Vite 完成或来源全文缺少对应阶段快照')
  }
  return { viteCompleted: completed.length, finalizations }
}
