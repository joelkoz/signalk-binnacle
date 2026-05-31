import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

const alias = {
  $app: fileURLToPath(new URL('./src/app', import.meta.url)),
  $views: fileURLToPath(new URL('./src/views', import.meta.url)),
  $widgets: fileURLToPath(new URL('./src/widgets', import.meta.url)),
  $features: fileURLToPath(new URL('./src/features', import.meta.url)),
  $entities: fileURLToPath(new URL('./src/entities', import.meta.url)),
  $shared: fileURLToPath(new URL('./src/shared', import.meta.url)),
};

export default defineConfig({
  // Signal K serves the webapp at /<package-name>/, so production assets resolve under /binnacle/.
  base: process.env.NODE_ENV === 'production' ? '/binnacle/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
  },
  plugins: [svelte()],
  resolve: { alias },
  publicDir: 'static',
  build: {
    outDir: 'public',
    emptyOutDir: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.{test,spec}.ts'],
          exclude: ['src/**/*.svelte.{test,spec}.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'unit-svelte',
          environment: 'node',
          include: ['src/**/*.svelte.{test,spec}.ts'],
        },
      },
    ],
  },
});
