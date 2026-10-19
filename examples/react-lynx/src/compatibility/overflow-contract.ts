/** 裁剪夹具必须有真实越界子项；几何与像素均使用此独立固定标尺。 */
export const overflowContract = {
  version: 1,
  id: 'layout-overflow',
  checkpoint: 'pixel:overflow-clip-v1',
  candidate: 'overflow-hidden',
  frameSize: 160,
  parent: { x: 12, y: 12, width: 96, height: 64 },
  child: { x: 72, y: 40, width: 48, height: 40 },
  colors: { canvas: '#f7fafb', parent: '#0ea5e9', child: '#facc15' },
  selectors: { canvas: '.probe-overflow-canvas', parent: '.probe-overflow-panel', child: '.probe-overflow-child', control: '.probe-overflow-control' },
  colorTolerance: 2,
  geometryTolerance: 0.75,
} as const
