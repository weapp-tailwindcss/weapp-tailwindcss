import type { NativeStyleManifest } from '../types'

export function virtualModuleCode(manifest: NativeStyleManifest) {
  return `import { setEnvironment, setManifest, setStyleSheetFactory } from ${JSON.stringify('@weapp-tailwindcss/react-native/runtime')};\nimport { Appearance, Platform, StyleSheet } from 'react-native';\nsetStyleSheetFactory(StyleSheet.create);\nconst syncEnvironment = () => setEnvironment({ platform: Platform.OS, colorScheme: Appearance.getColorScheme() ?? 'light' });\nsetManifest(${JSON.stringify(manifest)});\nsyncEnvironment();\nAppearance.addChangeListener?.(({ colorScheme }) => setEnvironment({ platform: Platform.OS, colorScheme: colorScheme ?? 'light' }));\nexport default undefined;`
}
