import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { db } from './db.js'
import { seedIfEmpty } from './seed.js'
import { migrateLegacyIfNeeded } from './lib/migrate.js'
import { requestPersistentStorage } from './lib/storage.js'

async function boot() {
  // AVANT db.open() : une base v1 (PK auto-incrément) ferait planter
  // l'ouverture en v2 (Dexie interdit le changement de PK). On détecte,
  // on sauvegarde, on supprime → db.open() recrée une base v2 propre.
  await migrateLegacyIfNeeded()
  await db.open()
  await seedIfEmpty()
  // Best-effort, non bloquant : on n'attend pas l'octroi iOS pour démarrer.
  requestPersistentStorage().catch(() => {})

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

boot()
