/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Map Tailwind tokens to the Mission Center theme variables.
        // This avoids global "!important" overrides and keeps classes theme-aware.
        slate: {
          50: 'rgb(var(--mc-slate-50) / <alpha-value>)',
          100: 'rgb(var(--mc-slate-100) / <alpha-value>)',
          200: 'rgb(var(--mc-slate-200) / <alpha-value>)',
          300: 'rgb(var(--mc-slate-300) / <alpha-value>)',
          400: 'rgb(var(--mc-slate-400) / <alpha-value>)',
          500: 'rgb(var(--mc-slate-500) / <alpha-value>)',
          600: 'rgb(var(--mc-slate-600) / <alpha-value>)',
          700: 'rgb(var(--mc-slate-700) / <alpha-value>)',
          800: 'rgb(var(--mc-slate-800) / <alpha-value>)',
          900: 'rgb(var(--mc-slate-900) / <alpha-value>)',
          950: 'rgb(var(--mc-slate-950) / <alpha-value>)',
        },
        rose: {
          200: 'rgb(var(--mc-rose-200) / <alpha-value>)',
          300: 'rgb(var(--mc-rose-300) / <alpha-value>)',
        },
        emerald: {
          200: 'rgb(var(--mc-emerald-200) / <alpha-value>)',
          300: 'rgb(var(--mc-emerald-300) / <alpha-value>)',
        },
        blue: {
          200: 'rgb(var(--mc-blue-200) / <alpha-value>)',
        },
        green: {
          300: 'rgb(var(--mc-green-300) / <alpha-value>)',
        },
        red: {
          200: 'rgb(var(--mc-red-200) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
