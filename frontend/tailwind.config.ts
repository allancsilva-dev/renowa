import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta Renowa
        primary: {
          DEFAULT: '#2A9D8F',   // Verde Teal — sidebar, botões de ação principal
          foreground: '#FFFFFF',
          50: '#e6f5f3',
          100: '#c2e8e3',
          200: '#9adbd2',
          300: '#6fcec1',
          400: '#4dbfb0',
          500: '#2A9D8F',
          600: '#238a7d',
          700: '#1b7468',
          800: '#135e53',
          900: '#0a4840',
        },
        background: '#F4F7F6',   // Off-white — fundo geral
        sidebar: {
          DEFAULT: '#2A9D8F',
          hover: '#F4F7F6',
          'hover-text': '#0f172a',  // slate-900
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '0.5rem',
        md: 'calc(0.5rem - 2px)',
        sm: 'calc(0.5rem - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
