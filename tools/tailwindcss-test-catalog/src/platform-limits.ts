export const miniProgramRuntimeColorWeightLimit = {
  id: 'weapp-runtime-color-weight',
  candidate: 'bg-sky-500/(--my-alpha-value)',
  target: 'weapp',
  support: 'unsupported',
  stage: 'encoding',
  reason: '未知运行时权重不能等价降级为 rgba：百分比类型、范围、原色 alpha 和无效变量语义均须保留。',
  regression: 'e2e/tailwind-mini-program-alpha-limit.test.ts',
  reference: 'e2e/color-mix-alpha-browser.test.ts',
  runtimeEvidence: 'not-run',
} as const
