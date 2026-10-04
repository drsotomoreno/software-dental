/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dental: {
          50: 'rgb(var(--tw-dental-50) / <alpha-value>)',
          100: 'rgb(var(--tw-dental-100) / <alpha-value>)',
          200: 'rgb(var(--tw-dental-200) / <alpha-value>)',
          300: 'rgb(var(--tw-dental-300) / <alpha-value>)',
          400: 'rgb(var(--tw-dental-400) / <alpha-value>)',
          500: 'rgb(var(--tw-dental-500) / <alpha-value>)',
          600: 'rgb(var(--tw-dental-600) / <alpha-value>)',
          700: 'rgb(var(--tw-dental-700) / <alpha-value>)',
          800: 'rgb(var(--tw-dental-800) / <alpha-value>)',
          900: 'rgb(var(--tw-dental-900) / <alpha-value>)',
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
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
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
