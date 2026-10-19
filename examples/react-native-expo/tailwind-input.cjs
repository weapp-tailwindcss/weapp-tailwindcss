module.exports = {
  input: './global.css',
  sourceGlobs: ['./src/**/*.{js,jsx,ts,tsx}', './App.tsx', '../../tools/tailwindcss-test-catalog/compatibility-candidates.txt'],
  watchFiles: ['./styles', './tailwind.config.mjs', './tailwind-plugin.mjs', '../../tools/tailwindcss-test-catalog'],
}
