import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import { db } from './db.js'
import { seedIfEmpty, seedLibraryIfNeeded } from './seed.js'
import { migrateLegacyIfNeeded } from './lib/migrate.js'
import { requestPersistentStorage } from './lib/storage.js'

async function boot() {
  // AVANT db.open() : une base v1 (PK auto-incrément) ferait planter
  // l'ouverture en v2 (Dexie interdit le changement de PK). On détecte,
  // on sauvegarde, on supprime → db.open() recrée une base v2 propre.
  await migrateLegacyIfNeeded()
  await db.open()
  await seedIfEmpty()
  // Bibliothèque d'ingrédients : gardée par le flag librarySeededV1 (part même
  // sur un device déjà initialisé, ne se rebat pas avec l'import). Voir seed.js.
  await seedLibraryIfNeeded()
  // Best-effort, non bloquant : on n'attend pas l'octroi iOS pour démarrer.
  requestPersistentStorage().catch(() => {})

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

boot()

// ── Service worker : auto-update SANS arracher la page en pleine saisie ────
// registerType 'autoUpdate' (vite.config) → un nouveau SW fait skipWaiting +
// clientsClaim, et la page se recharge quand il prend le contrôle. Sans ça, la
// PWA iOS installée resservait l'ancien bundle précaché (bug nutrition invisible).
//
// CONTRÔLE DU TIMING : on ne met AUCUN timer d'update (qui pourrait recharger en
// pleine compo). On ne vérifie un nouveau build qu'au RETOUR de focus/visibilité
// → le reload tombe au moment où l'utilisateur revient dans l'app, jamais pendant
// qu'il saisit. `immediate: true` enregistre sans attendre window.load.
registerSW({
  immediate: true,
  onRegisteredSW(_swScriptUrl, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      // Au retour au premier plan : on tire le sw.js. S'il a changé (déploiement),
      // le nouveau SW s'active et la page se recharge ; sinon rien (pas de reload).
      if (document.visibilityState === 'visible') registration.update()
    })
  },
})
