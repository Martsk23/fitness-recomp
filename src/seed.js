import { db, nowMs, newRow, SETTINGS_KEY } from './db.js'

// Tickers par défaut : eau (compteur de verres) + compléments (cases).
// Non-perso → OK de les seeder pour tout le monde.
const DEFAULT_TICKERS = [
  { label: 'Eau', type: 'counter', target: 8, icon: 'droplet', order: 1, active: true },
  { label: 'Créatine', type: 'checkbox', target: 1, icon: 'pill', order: 2, active: true },
  { label: 'Vitamine D', type: 'checkbox', target: 1, icon: 'pill', order: 3, active: true },
  { label: 'Oméga-3', type: 'checkbox', target: 1, icon: 'pill', order: 4, active: true },
]

// Réglages de départ. NB : les cibles caloriques/macros perso seront
// dé-seedées et remplacées par le calcul d'onboarding (Tâche 2) ; pour
// l'instant on garde des valeurs de fonctionnement + la règle sucres.
const DEFAULT_SETTINGS = {
  id: SETTINGS_KEY,
  targetKcal: 2100,
  targetProtein: 165,
  targetCarb: 200,
  targetFat: 60,
  targetSugarsSimple: 20,
  preferences: {},
}

// Amorce la base uniquement au premier lancement (idempotent).
export async function seedIfEmpty() {
  const alreadySeeded = (await db.settings.count()) > 0
  if (alreadySeeded) return

  await db.transaction('rw', db.settings, db.tickerConfigs, async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS, updatedAt: nowMs() })
    await db.tickerConfigs.bulkAdd(DEFAULT_TICKERS.map(newRow))
  })
}
