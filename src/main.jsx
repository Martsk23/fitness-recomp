import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { db } from './db.js'
import { seedIfEmpty } from './seed.js'
import { requestPersistentStorage } from './lib/storage.js'

async function boot() {
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
