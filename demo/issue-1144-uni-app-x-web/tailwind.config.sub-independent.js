/** @type {import('tailwindcss').Config} */
export default {
  content: ['./sub-independent/**/*.{uts,uvue}'],
  theme: {
    extend: {
      colors: {
        'independent-subpackage-marker': '#dc2626',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
    container: false,
  },
}
