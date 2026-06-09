import Dexie from 'dexie'

// ── Base locale (IndexedDB) ────────────────────────────────────────
// Schéma v1 — validé avant code. Toute nouvelle table OU index passe par
// une nouvelle version Dexie ET une mise à jour de TABLES + export/import.
export const db = new Dexie('fitnessRecomp')

db.version(1).stores({
  // bruts /100 g — name & category indexés pour recherche/filtre
  ingredients: '++id, name, category',
  // journal du jour — date indexée (groupage), [date+sourceType] pour le bilan,
  // sourceId pour retrouver les entrées d'un aliment/boisson donné
  journalEntries: '++id, date, [date+sourceType], sourceId',
  // pesées — une par jour visée, N permises
  weightLogs: '++id, date, datetime',
  // séances + séries — exercise & [exercise+date] pour l'analyse de perf
  workouts: '++id, date',
  sets: '++id, workoutId, exercise, [exercise+date]',
  // tickers quotidiens : config (définition) vs state (1 ligne/ticker/jour,
  // l'absence de ligne = 0 → reset journalier sans tâche planifiée)
  tickerConfigs: '++id, order',
  tickerStates: '++id, [tickerId+date], date',
  // base boissons (alcools)
  drinks: '++id, name, category',
  // réglages — singleton (id = 1)
  settings: '++id',
})

// Source unique de vérité pour l'export/import. Garder synchronisé avec stores().
export const TABLES = [
  'ingredients',
  'journalEntries',
  'weightLogs',
  'workouts',
  'sets',
  'tickerConfigs',
  'tickerStates',
  'drinks',
  'settings',
]

export const SCHEMA_VERSION = 1
