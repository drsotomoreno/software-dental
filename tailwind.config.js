/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dental: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        tooth: {
          sano: '#ffffff',
          caries: '#ef4444',
          obturado: '#2563eb',
          restauracion: '#1e293b',
          sellante: '#22c55e',
          ausente: '#fecaca',
          endodoncia: '#a855f7',
          corona: '#f59e0b',
          implante: '#14b8a6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
  safelist: [
    {
      pattern:
        /^(bg|border|text|ring)-(red|teal|yellow|emerald|orange|violet|blue|pink|indigo)-(100|500|700)$/,
    },
  ],
}
