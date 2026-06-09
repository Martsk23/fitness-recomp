import { db, nowMs, newRow, SETTINGS_KEY } from './db.js'
import { SUGARS_SIMPLE_MAX } from './lib/metabolic.js'

// Tickers par défaut : eau (compteur de verres) + compléments (cases).
// Non-perso → OK de les seeder pour tout le monde.
const DEFAULT_TICKERS = [
  { label: 'Eau', type: 'counter', target: 8, icon: 'droplet', order: 1, active: true },
  { label: 'Créatine', type: 'checkbox', target: 1, icon: 'pill', order: 2, active: true },
  { label: 'Vitamine D', type: 'checkbox', target: 1, icon: 'pill', order: 3, active: true },
  { label: 'Oméga-3', type: 'checkbox', target: 1, icon: 'pill', order: 4, active: true },
]

// Réglages de départ (Tâche 2). Plus de cibles kcal/macros en dur : elles sont
// CALCULÉES par l'onboarding depuis le profil (moteur metabolic.js). On amorce
// donc sans profil → l'app affiche l'onboarding au 1er lancement. Seule la règle
// sucres simples (DÉJÀ ACTÉE) est seedée, car non dérivée du profil.
const DEFAULT_SETTINGS = {
  id: SETTINGS_KEY,
  profile: null,
  targetsSource: 'fallback', // 'computed' une fois l'onboarding fait
  targetKcal: null,
  targetProtein: null,
  targetCarb: null,
  targetFat: null,
  targetSugarsSimple: SUGARS_SIMPLE_MAX,
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
