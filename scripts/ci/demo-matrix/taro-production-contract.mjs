import assert from 'node:assert/strict'

const projects = new Set([
  'taro-webpack-react-tailwindcss-v4',
  'taro-webpack-vue3-tailwindcss-v4',
  'taro-vite-react-tailwindcss-v4',
  'taro-vite-vue3-tailwindcss-v4',
  'issue-951-taro-vite-react-tailwindcss-v4',
])
const harmonyBrowserProjects = new Set(['taro-webpack-react-tailwindcss-v4', 'taro-webpack-vue3-tailwindcss-v4'])

/** 这些夹具的独立主题合同是 .25rem、slate-500 和 emerald-50/80。 */
export function hasTaroProductionFixture(item) {
  return projects.has(item.name) && ['h5', 'harmony-hybrid'].includes(item.target)
}

/** 默认门禁覆盖 H5 与已接通平台适配的 Webpack Harmony；Vite Harmony 仍需显式诊断。 */
export function hasTaroProductionContract(item) {
  return hasTaroProductionFixture(item) && (item.target === 'h5' || harmonyBrowserProjects.has(item.name))
}

/** 复核浏览器实测语义，拒绝缺证及可见节点上的错误样式。 */
export function assertTaroProductionEvidence(item, evidence) {
  assert.ok(evidence && Number.isFinite(evidence.rootFontSize) && evidence.rootFontSize > 0, `${item.id}: missing production browser evidence`)
  // 1200×900 的 H5 rem 脚本上限为 40；Webpack Harmony 固定 20。
  const expectedRoot = item.target === 'h5' ? 40 : 20
  assert.equal(evidence.rootFontSize, expectedRoot, `${item.id}: production root font size`)
  for (const key of ['height', 'medium', 'large', 'margin', 'color', 'opacity']) {
    const row = evidence.computed?.[key]
    assert.ok(row && Number.isFinite(row.margin) && Number.isFinite(row.boxHeight) && row.boxHeight > 0
      && Number.isFinite(row.width) && row.width > 0 && row.visible === true
      && typeof row.color === 'string' && typeof row.background === 'string', `${item.id}: missing production ${key}`)
  }
  for (const [key, multiple] of [['height', 8], ['medium', 20], ['large', 50]]) {
    const expected = evidence.rootFontSize * 0.25 * multiple
    assert.ok(Number.isFinite(evidence.computed[key].height), `${item.id}: missing production ${key} height`)
    assert.ok(Math.abs(evidence.computed[key].height - expected) < 0.1, `${item.id}: production ${key} expected ${expected}, received ${evidence.computed[key].height}`)
    assert.ok(Math.abs(evidence.computed[key].boxHeight - expected) < 0.1, `${item.id}: production ${key} box height expected ${expected}, received ${evidence.computed[key].boxHeight}`)
  }
  const expectedMargin = evidence.rootFontSize * 0.25 * 2
  assert.ok(Math.abs(evidence.computed.margin.margin - expectedMargin) < 0.1, `${item.id}: production margin expected ${expectedMargin}, received ${evidence.computed.margin.margin}`)
  // Chromium 的半透明 canvas 经过预乘再还原，绿色通道为 252。
  assert.deepEqual(evidence.reference, { color: [98, 116, 142, 255], opacity: [236, 252, 245, 204] }, `${item.id}: independent production reference`)
  assert.deepEqual(evidence.pixels, evidence.reference, `${item.id}: production colors`)
  assert.equal(evidence.computed.color.color, 'rgb(98, 116, 142)', `${item.id}: computed production color`)
  assert.equal(evidence.computed.opacity.background, 'rgba(236, 253, 245, 0.8)', `${item.id}: computed production background`)
}
