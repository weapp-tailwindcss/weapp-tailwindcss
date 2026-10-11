/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './App.uvue',
    './pages/**/*.{uts,uvue}',
    './components/**/*.{uts,uvue}',
    './stores/**/*.{uts,uvue}',
    '!./sub-normal/**/*',
    '!./sub-independent/**/*',
    '!./uni_modules/**/*',
    '!./unpackage/**/*',
  ],
  plugins: [],
  corePlugins: {
    preflight: false,
    container: false,
  },
}
