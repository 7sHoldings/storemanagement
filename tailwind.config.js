/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Design System v2 — CSS variable-based
        'v2-bg': 'var(--bg-base)',
        'v2-elevated': 'var(--bg-elevated)',
        'v2-card': 'var(--bg-card)',
        'v2-hover': 'var(--bg-hover)',
        'v2-border': 'var(--border-subtle)',
        'v2-border-d': 'var(--border-default)',
        'v2-text': 'var(--text-primary)',
        'v2-sub': 'var(--text-secondary)',
        'v2-muted': 'var(--text-muted)',
        'v2-brand': 'var(--brand-primary)',
        'v2-success': 'var(--color-success)',
        'v2-warning': 'var(--color-warning)',
        'v2-danger': 'var(--color-danger)',
        'v2-info': 'var(--color-info)',
        // Existing sw-* colors preserved
        // Legacy sw-* names, now driven by the light palette in globals.css.
        sw: {
          bg: 'rgb(var(--sw-bg) / <alpha-value>)',
          card: 'rgb(var(--sw-card) / <alpha-value>)',
          card2: 'rgb(var(--sw-card2) / <alpha-value>)',
          border: 'rgb(var(--sw-border) / <alpha-value>)',
          text: 'rgb(var(--sw-text) / <alpha-value>)',
          sub: 'rgb(var(--sw-sub) / <alpha-value>)',
          dim: 'rgb(var(--sw-dim) / <alpha-value>)',
          blue: 'rgb(var(--sw-blue) / <alpha-value>)',
          blueD: 'var(--sw-blueD)',
          green: 'rgb(var(--sw-green) / <alpha-value>)',
          greenD: 'var(--sw-greenD)',
          red: 'rgb(var(--sw-red) / <alpha-value>)',
          redD: 'var(--sw-redD)',
          amber: 'rgb(var(--sw-amber) / <alpha-value>)',
          amberD: 'var(--sw-amberD)',
          cyan: 'rgb(var(--sw-cyan) / <alpha-value>)',
          purple: 'rgb(var(--sw-purple) / <alpha-value>)',
          pink: 'rgb(var(--sw-pink) / <alpha-value>)',
          pinkD: 'var(--sw-pinkD)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Inter', 'system-ui', 'sans-serif'],
        brand: ['Fredoka', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
