import { compilerOverrides, projectRelative } from '../lock-axis.mjs'

function lock(version, sourceVersion) {
  const reference = `${version}(patch_hash=fixture-${version})(peer@1.0.0)`
  return {
    lockfileVersion: '9.0',
    settings: { autoInstallPeers: true },
    catalogs: { tools: { example: { specifier: '^1.0.0', version: '1.0.0' } } },
    overrides: { existing: '1.0.0' },
    patchedDependencies: { [`webpack@${version}`]: { hash: `fixture-${version}`, path: `patches/webpack@${version}.patch` } },
    importers: { [projectRelative]: { devDependencies: { webpack: { specifier: version, version: reference }, example: { specifier: '^1.0.0', version: '1.0.0' }, runner: { specifier: '4.3.1', version: `@tarojs/webpack5-runner@4.3.1(webpack@${version})` } } } },
    packages: Object.fromEntries([`webpack@${version}`, `webpack-sources@${sourceVersion}`, 'example@1.0.0', '@tarojs/webpack5-runner@4.3.1', 'terser-webpack-plugin@5.6.1'].map(key => [key, { resolution: { integrity: key } }])),
    snapshots: {
      [`webpack@${reference}`]: { dependencies: { 'webpack-sources': sourceVersion, 'terser-webpack-plugin': '5.6.1' } },
      [`webpack-sources@${sourceVersion}`]: {},
      'example@1.0.0': {},
      'terser-webpack-plugin@5.6.1': {},
      [`@tarojs/webpack5-runner@4.3.1(webpack@${version})`]: { dependencies: { webpack: reference, example: '1.0.0' } },
    },
  }
}

export function pair() {
  const current = lock('5.91.0', '3.6.0')
  const baseline = lock('5.105.4', '3.5.1')
  const previous = structuredClone(baseline)
  previous.overrides = { existing: '1.0.0', ...compilerOverrides({ 'webpack-sources': '3.5.1', 'terser-webpack-plugin': '5.6.1' }) }
  previous.patchedDependencies = { ...current.patchedDependencies, ...previous.patchedDependencies }
  return { current, previous, baseline }
}
