import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// This codebase uses `.js` (not `.jsx`) for files that contain JSX (matches
// Next.js's defaults). Tell Vite/esbuild to treat .js as JSX everywhere.
export default defineConfig({
  plugins: [
    react({ include: /\.(mdx|js|jsx|ts|tsx)$/ }),
  ],
  esbuild: {
    loader: 'jsx',
    include: /.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  resolve: {
    alias: {
      // Mirror jsconfig.json's `@/*` alias so test files can import like the app does.
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx,mjs}'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['lib/**', 'components/**', 'app/api/**'],
      exclude: [
        '**/*.test.{js,jsx}',
        'tests/**',
        // Big page components / shared UI library are tracked but the
        // pure-helper / single-purpose modules are the priority.
      ],
    },
  },
});
