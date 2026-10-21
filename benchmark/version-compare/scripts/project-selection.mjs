import { benchmarkProjects } from './projects.mjs'

export function selectBenchmarkProjects(only) {
  if (only === undefined) {
    return benchmarkProjects
  }
  const requested = only.split(',').map(item => item.trim()).filter(Boolean)
  if (requested.length === 0) {
    throw new Error('--only must select at least one benchmark project')
  }
  const unknown = requested.filter(item => !benchmarkProjects.some(project => project.key === item || project.project === item))
  if (unknown.length > 0) {
    throw new Error(`unknown benchmark project key(s): ${unknown.join(', ')}`)
  }
  return benchmarkProjects.filter(project => requested.includes(project.key) || requested.includes(project.project))
}

function assertMeasurement(row, field, summaryField, runs) {
  const samples = Array.isArray(row[field]) ? Array.from(row[field]) : []
  const statistics = row.summary?.[summaryField]
  if (samples.length !== runs
    || !samples.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    || ![statistics?.median, statistics?.p95].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
    throw new Error(`benchmark matrix has incomplete ${field} measurements: ${row.version}/${row.key}`)
  }
}

export function assertBenchmarkMatrixRows(raw, selectedProjects, versions, options) {
  const keys = Array.isArray(selectedProjects) ? Array.from(selectedProjects, project => project?.key) : []
  const labels = Array.isArray(versions) ? Array.from(versions, version => version?.version) : []
  if (!keys?.length || !labels || labels.length < 2
    || !keys.every(key => typeof key === 'string' && key.length > 0)
    || !labels.every(label => typeof label === 'string' && label.length > 0)
    || new Set(keys).size !== keys.length || new Set(labels).size !== labels.length) {
    throw new Error('benchmark matrix requires unique selected projects and version identities')
  }
  if (!Array.isArray(raw?.rows)) {
    throw new TypeError('benchmark matrix rows must be an array')
  }
  if (options && (!Number.isInteger(options.buildRuns) || options.buildRuns < 0
    || !Number.isInteger(options.hmrRuns) || options.hmrRuns <= 0)) {
    throw new Error('benchmark matrix requires explicit build and HMR run counts')
  }
  const expected = new Map(keys.flatMap(key => labels.map(version => [JSON.stringify([version, key]), `${version}/${key}`])))
  const seen = new Set()
  for (const row of raw.rows) {
    const identity = JSON.stringify([row?.version, row?.key])
    if (!expected.has(identity)) {
      throw new Error(`benchmark matrix has unexpected row: ${row?.version}/${row?.key}`)
    }
    if (seen.has(identity)) {
      throw new Error(`benchmark matrix has duplicate row: ${expected.get(identity)}`)
    }
    seen.add(identity)
    if (options && !row.error) {
      const project = selectedProjects.find(project => project.key === row.key)
      if (options.buildRuns > 0 && project.buildMode !== 'unsupported') {
        assertMeasurement(row, 'buildMs', 'build', options.buildRuns)
      }
      const hmrMode = project.hmrMode ?? 'watch'
      if (hmrMode !== 'unsupported' && hmrMode !== 'fallback-build') {
        assertMeasurement(row, 'hmrMs', 'hmr', options.hmrRuns)
      }
    }
  }
  const missing = [...expected].filter(([identity]) => !seen.has(identity)).map(([, label]) => label)
  if (missing.length > 0) {
    throw new Error(`benchmark matrix is missing row(s): ${missing.join(', ')}`)
  }
}
