/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        brand: {
          50: '#fff4ef', 100: '#ffe5d9', 200: '#ffc7ad', 300: '#ffa07a', 400: '#fb7447',
          500: '#f2541f', 600: '#e03e10', 700: '#b92f0d', 800: '#932812', 900: '#772412',
        },
        ink: {
          50: '#f3f6fb', 100: '#e4eaf4', 200: '#c9d4e8', 300: '#9fb2d3', 400: '#6f88b8',
          500: '#4c679f', 600: '#3a5185', 700: '#2f416b', 800: '#1d2b4d', 900: '#0f1b36', 950: '#0a1226',
        },
      },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)' },
    },
  },
  plugins: [],
}
