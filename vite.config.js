import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Test on-device : bind 0.0.0.0 (LAN) + autorise les hôtes de tunnel HTTPS.
  // Vite bloque par défaut les Host inconnus (anti DNS-rebinding).
  server: { host: true, allowedHosts: ['.trycloudflare.com', '.ngrok-free.app'] },
  preview: { host: true, allowedHosts: ['.trycloudflare.com', '.ngrok-free.app'] },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // false (PAS 'auto') : on importe registerSW de 'virtual:pwa-register' et on
      // l'appelle nous-mêmes dans main.jsx (auto-reload contrôlé + update-on-focus).
      // 'auto' injecterait EN PLUS un <script> registerSW.js → SW enregistré 2×.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Fitness Recomp',
        short_name: 'Recomp',
        description: 'Suivi recomposition corporelle — 100 % local, hors-ligne.',
        lang: 'fr',
        theme_color: '#0B0E13',
        background_color: '#05070A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // App-shell offline: SPA fallback to index.html for navigations.
        navigateFallback: '/index.html',
        // Explicites (autoUpdate les force déjà, on les rend visibles + verrouillés) :
        // un nouveau SW s'active immédiatement (skipWaiting) et prend le contrôle des
        // pages déjà ouvertes (clientsClaim) → un déploiement remplace bien le build
        // de la PWA installée, sans manip manuelle.
        skipWaiting: true,
        clientsClaim: true,
      },
      // Lets us test the PWA / service worker in `npm run dev`.
      devOptions: { enabled: true },
    }),
  ],
})
