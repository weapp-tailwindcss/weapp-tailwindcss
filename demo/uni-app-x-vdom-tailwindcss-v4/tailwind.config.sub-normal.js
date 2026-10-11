/** @type {import('tailwindcss').Config} */
export default {
  content: ['./sub-normal/**/*.{uts,uvue}'],
  theme: {
    extend: {
      colors: {
        'normal-subpackage-marker': '#2563eb',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
    container: false,
  },
}
