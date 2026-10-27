export const version = '1.0.0-snapshot.nightly.fixture'
export const target = `@weapp-tailwindcss/native-linux-x64-gnu@${version}`
export const published = () => ({
  status: 'published',
  confirmed: true,
  commit: 'a'.repeat(40),
  buildId: '123-1',
  snapshot: { registry: 'https://registry.npmjs.org/' },
  packages: [
    { name: 'weapp-tailwindcss', version, published: true },
    { name: '@weapp-tailwindcss/native-linux-x64-gnu', version, published: true },
  ],
})

export function missing(reference = target, extra = {}) {
  return {
    level: 'error',
    code: 'ERR_PNPM_NO_MATCHING_VERSION',
    message: `No matching version found for ${reference} while fetching it from https://registry.npmjs.org/`,
    ...extra,
  }
}

export function failure(...records: unknown[]) {
  return { exitCode: 1, stdout: records.map(record => JSON.stringify(record)).join('\n'), stderr: '', timedOut: false }
}
