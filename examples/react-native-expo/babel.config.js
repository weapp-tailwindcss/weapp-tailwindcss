module.exports = function (api) {
  api.cache(true)
  return {
    // 与当前 Expo SDK 使用同一 preset，避免 monorepo 提升的旧版预设污染 Metro。
    presets: [require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] })],
  }
}
