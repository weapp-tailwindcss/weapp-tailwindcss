import type { NativeManifestPublication, NativeStyleManifest } from '../types'

export function virtualModuleCode(manifest: NativeStyleManifest, publication?: NativeManifestPublication, manifestJson = JSON.stringify(manifest)) {
  const identity = publication ? `, ${JSON.stringify(publication)}` : ''
  return `import { setEnvironment, setManifest, setStyleSheetFactory } from ${JSON.stringify('@weapp-tailwindcss/react-native/runtime')};\nimport { Appearance, Platform, StyleSheet } from 'react-native';\nsetStyleSheetFactory(StyleSheet.create, StyleSheet.flatten);\nconst syncEnvironment = () => setEnvironment({ platform: Platform.OS, colorScheme: Appearance.getColorScheme() ?? 'light' });\nsetManifest(${manifestJson}${identity});\nsyncEnvironment();\nAppearance.addChangeListener?.(({ colorScheme }) => setEnvironment({ platform: Platform.OS, colorScheme: colorScheme ?? 'light' }));\nexport default undefined;`
}
