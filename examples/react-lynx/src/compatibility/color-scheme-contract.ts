/** 原生颜色模式必须同时证明触发前、触发后和恢复后的实际文字渲染。 */
export const colorSchemeContract = {
  version: 2,
  id: 'variant-dark',
  checkpoint: 'pixel:color-scheme-v2',
  frames: ['light-probe', 'light-control', 'dark-probe', 'dark-control', 'restored-probe', 'restored-control'],
} as const
