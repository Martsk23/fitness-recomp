import { db } from './db.js'

// Valeurs cibles de départ (alignées sur l'objectif recomp de la maquette).
const DEFAULT_SETTINGS = {
  id: 1,
  targetKcal: 2100,
  targetProtein: 165,
  targetCarb: 200,
  targetFat: 60,
  targetSugarsSimple: 20,
  preferences: {},
  updatedAt: Date.now(),
}

// Tickers par défaut : eau (compteur de verres) + compléments (cases).
const DEFAULT_TICKERS = [
  { label: 'Eau', type: 'counter', target: 8, icon: 'droplet', order: 1, active: true },
  { label: 'Créatine', type: 'checkbox', target: 1, icon: 'pill', order: 2, active: true },
  { label: 'Vitamine D', type: 'checkbox', target: 1, icon: 'pill', order: 3, active: true },
  { label: 'Oméga-3', type: 'checkbox', target: 1, icon: 'pill', order: 4, active: true },
]

// Amorce la base uniquement au premier lancement (idempotent).
// Les bibliothèques complètes (ingrédients bruts, ~38 boissons) sont régénérées
// en Phase 1/2 — ici on ne pose que le strict nécessaire au fonctionnement.
export async function seedIfEmpty() {
  const alreadySeeded = (await db.settings.count()) > 0
  if (alreadySeeded) return

  await db.transaction('rw', db.settings, db.tickerConfigs, async () => {
    await db.settings.put(DEFAULT_SETTINGS)
    await db.tickerConfigs.bulkAdd(DEFAULT_TICKERS)
  })
}
