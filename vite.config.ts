import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const TWO_HOURS_SECONDS = 60 * 60 * 2;

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
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['binnacle-icon.svg'],
      manifest: {
        name: 'Binnacle',
        short_name: 'Binnacle',
        description: 'A next-generation marine chart plotter for Signal K.',
        start_url: '/binnacle/',
        scope: '/binnacle/',
        display: 'standalone',
        background_color: '#cfe0ec',
        theme_color: '#cfe0ec',
        icons: [
          {
            src: 'binnacle-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/binnacle/index.html',
        // The app chunk is large (MapLibre), so raise the precache size ceiling.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            // The online vector base map: cache what the navigator has viewed.
            urlPattern: ({ url }) => url.origin === 'https://tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'binnacle-basemap',
              expiration: { maxEntries: 4000, maxAgeSeconds: THIRTY_DAYS_SECONDS },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Signal K PMTiles charts, read by many HTTP range requests.
            urlPattern: ({ url }) => url.pathname.startsWith('/signalk/pmtiles/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'binnacle-pmtiles',
              rangeRequests: true,
              expiration: { maxEntries: 200, maxAgeSeconds: THIRTY_DAYS_SECONDS },
              cacheableResponse: { statuses: [0, 200, 206] },
            },
          },
          {
            // Open-Meteo forecast and marine data: prefer fresh, fall back to the last fetch offline.
            urlPattern: ({ url }) => url.hostname.endsWith('open-meteo.com'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'binnacle-weather',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 64, maxAgeSeconds: 6 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // RainViewer radar frame index: prefer fresh frames, fall back to the last list offline.
            urlPattern: ({ url }) =>
              url.hostname.endsWith('rainviewer.com') && url.pathname.endsWith('.json'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'binnacle-radar-index',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 4, maxAgeSeconds: TWO_HOURS_SECONDS },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // RainViewer radar tiles: each frame's tiles are immutable (the timestamp is in the path),
            // so cache them for offline and repeat use. The window is short because frames roll.
            urlPattern: ({ url }) =>
              url.hostname.endsWith('rainviewer.com') && url.pathname.endsWith('.png'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'binnacle-radar-tiles',
              expiration: { maxEntries: 600, maxAgeSeconds: TWO_HOURS_SECONDS },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
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
