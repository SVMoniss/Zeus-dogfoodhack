/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef6fd',
          100: '#d8eafa',
          200: '#b3d4f5',
          300: '#7fb6ec',
          400: '#4a94e0',
          500: '#1f78d1',
          600: '#1b69b8',
          700: '#185fa5',
          800: '#144e86',
          900: '#0f3a63',
          DEFAULT: 'rgb(var(--df-primary) / <alpha-value>)',
          foreground: 'rgb(var(--df-primary-fg) / <alpha-value>)',
        },
        teal: {
          DEFAULT: '#22a197',
          dark: '#1a7f77',
        },
        surface: {
          DEFAULT: 'rgb(var(--df-surface) / <alpha-value>)',
          foreground: 'rgb(var(--df-fg) / <alpha-value>)',
        },
        background: 'rgb(var(--df-bg) / <alpha-value>)',
        foreground: 'rgb(var(--df-fg) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--df-card) / <alpha-value>)',
          foreground: 'rgb(var(--df-fg) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--df-muted) / <alpha-value>)',
          foreground: 'rgb(var(--df-muted-fg) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--df-accent) / <alpha-value>)',
          foreground: 'rgb(var(--df-fg) / <alpha-value>)',
        },
        border: 'rgb(var(--df-border) / <alpha-value>)',
        input: 'rgb(var(--df-border) / <alpha-value>)',
        ring: 'rgb(var(--df-primary) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '0.25rem',
        md: '0.35rem',
        lg: '0.5rem',
      },
    },
  },
  plugins: [],
}