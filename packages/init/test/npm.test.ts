import { getDevDepsVersions, getLatestVersion, getLatestVersionInRange } from '@/npm'
import { describe, expect, it } from 'vitest'
import { fetchOptions } from './util'

describe('getLatestVersion', () => {
  it('resolves latest versions without touching the network', async () => {
    let version = await getLatestVersion('tailwindcss', fetchOptions)
    expect(version).toBe('4.2.4')
    version = await getLatestVersionInRange('tailwindcss', '4', fetchOptions)
    expect(version).toBe('4.2.4')
  })

  it('getDevDepsVersions', async () => {
    const res = await getDevDepsVersions(fetchOptions)
    expect(res).toMatchObject({
      tailwindcss: expect.stringMatching(/^\^4\./u),
      'weapp-tailwindcss': expect.stringMatching(/^\^5\./u),
    })
  })

  it('resolves legacy dependencies only when requested', async () => {
    const res = await getDevDepsVersions(fetchOptions, 'legacy')
    expect(res).toMatchObject({
      tailwindcss: expect.stringMatching(/^\^3\./u),
      postcss: expect.stringMatching(/^\^8\./u),
      autoprefixer: expect.stringMatching(/^\^10\./u),
      'weapp-tailwindcss': expect.stringMatching(/^\^4\./u),
    })
  })

  it('tailwindcss@4', async () => {
    const version = await getLatestVersionInRange('tailwindcss', '4', fetchOptions)
    expect(version?.startsWith('4.')).toBe(true)
  })

  it('tailwindcss@latest', async () => {
    const version = await getLatestVersion('tailwindcss', fetchOptions)
    expect(version).toMatch(/^\d+\.\d+\.\d+/u)
  })
})
