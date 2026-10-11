import { describe, expect, it, vi } from 'vitest'

const ensureRuntimeClassSet = vi.fn()

vi.mock('@/tailwindcss/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/tailwindcss/runtime')>()
  return {
    ...actual,
    ensureRuntimeClassSet,
  }
})

describe('createCompiler explicit snapshot mode', () => {
  it('does not collect the runtime classSet during CSS, template, or JS transforms', async () => {
    const { createCompiler } = await import('@/core')
    const compiler = createCompiler()
    const snapshot = compiler.createSnapshot({
      classSet: ['w-[10px]'],
      id: 'external-tailwind-chain',
      revision: 7,
    })

    await compiler.transformCss('.w-\\[10px\\] { width: 10px }', snapshot)
    await compiler.transformTemplate('<view class="w-[10px]" />', snapshot)
    await compiler.transformJavaScript('const value = "w-[10px]"', snapshot)

    expect(ensureRuntimeClassSet).not.toHaveBeenCalled()
    await compiler.dispose()
  })
})

describe('snapshot JavaScript candidate authority', () => {
  it('transforms exact generated candidates without utility-prefix hints', async () => {
    const { createCompiler } = await import('@/core')
    const compiler = createCompiler()
    try {
      const snapshot = compiler.createSnapshot({ classSet: ['before:content-["x"]', 'custom:utility'], id: 'host', revision: 1 })
      const source = `const value = 'before:content-["x"] custom:utility absent:utility'`
      const result = await compiler.transformJavaScript(source, snapshot)
      expect(result.code).toBe(`const value = 'before_ccontent-_b_qx_q_B custom_cutility absent:utility'`)
    }
    finally {
      await compiler.dispose()
    }
  })

  it('preserves protocol-relative URLs alongside exact slash candidates', async () => {
    const { createCompiler } = await import('@/core')
    const compiler = createCompiler()
    try {
      const snapshot = compiler.createSnapshot({ classSet: ['//cdn.example.com/app.js', 'w-[1/2]'], id: 'host', revision: 1 })
      const result = await compiler.transformJavaScript('const value = \'//cdn.example.com/app.js w-[1/2]\'', snapshot)
      expect(result.code).toBe('const value = \'//cdn.example.com/app.js w-_b1_f2_B\'')
    }
    finally {
      await compiler.dispose()
    }
  })
})

it.each(['\n', '\r'])('preserves decoded line endings inside exact JS candidates: %j', async (ending) => {
  const { createCompiler } = await import('@/core')
  const compiler = createCompiler()
  try {
    const candidate = `before:content-['x${ending}y']`
    const snapshot = compiler.createSnapshot({ classSet: [candidate], id: 'host', revision: 1 })
    const result = await compiler.transformJavaScript(`const value = ${JSON.stringify(candidate)}`, snapshot)
    expect(result.code).toBe(`const value = ${JSON.stringify(`before_ccontent-_b_ax${ending}y_a_B`)}`)
  }
  finally {
    await compiler.dispose()
  }
})
