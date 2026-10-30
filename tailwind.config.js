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
      // Escala tipográfica +4px (+0.25rem) respecto a Tailwind por defecto
      fontSize: {
        xs: ['1rem', { lineHeight: '1.5rem' }], // 12px -> 16px
        sm: ['1.125rem', { lineHeight: '1.75rem' }], // 14px -> 18px
        base: ['1.25rem', { lineHeight: '1.75rem' }], // 16px -> 20px
        lg: ['1.375rem', { lineHeight: '2rem' }], // 18px -> 22px
        xl: ['1.5rem', { lineHeight: '2rem' }], // 20px -> 24px
        '2xl': ['1.75rem', { lineHeight: '2.25rem' }], // 24px -> 28px
        '3xl': ['2.125rem', { lineHeight: '2.5rem' }], // 30px -> 34px
        '4xl': ['2.5rem', { lineHeight: '2.75rem' }], // 36px -> 40px
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
