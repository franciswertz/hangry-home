import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const backendTarget = 'http://localhost:4000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'Hangry Home',
        short_name: 'Hangry',
        description: 'Plan meals, track staples, and keep your week in sync.',
        theme_color: '#7BCB59',
        background_color: '#FAFBF8',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/graphql': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/events': {
        target: backendTarget,
        changeOrigin: true,
        timeout: 30000,
        proxyTimeout: 30000,
      },
    },
  },
});
