import Dexie from 'dexie'

// ── Base locale (IndexedDB) ────────────────────────────────────────
// Schéma v2 — clés primaires en UUID (string), assignées par l'app à
// l'insert (plus d'auto-incrément). Voir DECISIONS.md D10/D11/D12.
//
// Deux constantes DISTINCTES :
//  - DEXIE_VERSION  : version du store IndexedDB (mécanique Dexie).
//  - SCHEMA_VERSION : version du format d'export JSON (compat backups).
export const DEXIE_VERSION = 2
export const SCHEMA_VERSION = 2

// settings est un singleton → clé sentinelle fixe (lecture déterministe).
export const SETTINGS_KEY = 'singleton'

export const db = new Dexie('fitnessRecomp')

// PK = `id` (string UUID, fourni à l'insert). updatedAt est STOCKÉ mais
// pas indexé (l'indexation pour la sync LWW est différée à la phase sync).
db.version(DEXIE_VERSION).stores({
  ingredients: 'id, name, category',
  journalEntries: 'id, date, [date+sourceType], sourceId',
  weightLogs: 'id, date, datetime',
  workouts: 'id, date',
  sets: 'id, workoutId, exercise, [exercise+date]',
  tickerConfigs: 'id, order',
  tickerStates: 'id, [tickerId+date], date',
  drinks: 'id, name, category',
  settings: 'id',
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

// ── Helpers d'écriture ─────────────────────────────────────────────
// updatedAt estampillé à chaque write applicatif (D11). On ne passe PAS
// par un hook Dexie global : l'import doit pouvoir préserver l'updatedAt
// du fichier sans être réécrit (cf. backup.js).
export const nowMs = () => Date.now()

/** Nouvelle ligne : UUID + updatedAt = maintenant (id surchargeable). */
export function newRow(obj) {
  return { id: crypto.randomUUID(), ...obj, updatedAt: nowMs() }
}

/** Marque une ligne existante comme modifiée maintenant. */
export function touch(obj) {
  return { ...obj, updatedAt: nowMs() }
}
