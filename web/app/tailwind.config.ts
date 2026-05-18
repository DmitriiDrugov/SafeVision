import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Industrial control-room palette — near-black backgrounds, electric cyan accent.
        ink: {
          950: '#06080d',
          900: '#0b0f17',
          850: '#10141d',
          800: '#161b26',
          750: '#1c2230',
          700: '#232a3a',
          600: '#2e3648',
          500: '#3f495c',
          400: '#5b6577',
          300: '#8a93a6',
          200: '#b6bdcc',
          100: '#d9dde6',
          50: '#eef0f5',
        },
        accent: {
          DEFAULT: '#00D4FF',
          50: '#e6fbff',
          100: '#b3f1ff',
          200: '#80e7ff',
          300: '#4dddff',
          400: '#26d4ff',
          500: '#00d4ff',
          600: '#00a8cc',
          700: '#007c99',
          800: '#005066',
          900: '#002833',
        },
        severity: {
          low: '#3b82f6',
          medium: '#facc15',
          high: '#f97316',
          critical: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(0, 212, 255, 0.35), 0 0 24px -4px rgba(0, 212, 255, 0.35)',
        panel: '0 1px 0 rgba(255,255,255,0.04), 0 8px 24px -8px rgba(0,0,0,0.6)',
      },
      keyframes: {
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(0, 212, 255, 0.45)' },
          '70%': { boxShadow: '0 0 0 8px rgba(0, 212, 255, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(0, 212, 255, 0)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      animation: {
        pulseRing: 'pulseRing 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        scan: 'scan 2.4s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
