/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './App.uvue',
    './pages/**/*.{uts,uvue}',
    '!./unpackage/**/*',
  ],
  theme: { extend: {} },
  plugins: [],
  corePlugins: {
    preflight: false,
    container: false,
  },
}
