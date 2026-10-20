/** 独立报告夹具：1200×900 下 H5 根字号 40，Harmony hybrid 根字号 20。 */
export function productionEvidence(target = 'harmony-hybrid') {
  const rootFontSize = target === 'h5' ? 40 : 20
  const row = { height: 32, margin: 0, color: 'rgb(98, 116, 142)', background: 'rgba(236, 253, 245, 0.8)', width: 1200, boxHeight: 32, visible: true }
  const pixels = { color: [98, 116, 142, 255], opacity: [236, 252, 245, 204] }
  return {
    rootFontSize,
    computed: {
      height: { ...row, height: rootFontSize * 2, boxHeight: rootFontSize * 2 },
      medium: { ...row, height: rootFontSize * 5, boxHeight: rootFontSize * 5 },
      large: { ...row, height: rootFontSize * 12.5, boxHeight: rootFontSize * 12.5 },
      margin: { ...row, margin: rootFontSize * 0.5 },
      color: { ...row },
      opacity: { ...row },
    },
    pixels,
    reference: structuredClone(pixels),
  }
}
