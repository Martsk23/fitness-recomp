import Dexie from 'dexie'

// ── Base locale (IndexedDB) ────────────────────────────────────────
// Schéma v2 — clés primaires en UUID (string), assignées par l'app à
// l'insert (plus d'auto-incrément). Voir DECISIONS.md D10/D11/D12.
//
// Deux constantes DISTINCTES :
//  - DEXIE_VERSION  : version du store IndexedDB (mécanique Dexie).
//  - SCHEMA_VERSION : version du format d'export JSON (compat backups).
export const DEXIE_VERSION = 3
// Première version à PK UUID. À partir d'elle, les montées de version sont
// ADDITIVES (nouveau store / index) → Dexie les applique sans wipe. Le wipe
// destructif (D13) est réservé aux bases ANTÉRIEURES (v1, PK auto-incrément).
export const FIRST_UUID_DEXIE_VERSION = 2
// SCHEMA_VERSION reste à 2 : l'ajout de la table `dailyExpenditure` est
// rétro-compatible à l'import (table absente d'un vieux bundle ⇒ vide). Pas de
// rupture du format → on NE bumpe PAS (un bump rejetterait les backups v2).
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

// v3 — montée ADDITIVE (Tâche 4) : nouveau store `dailyExpenditure` (dépense
// énergétique totale du jour, 1 ligne par date). Les stores v2 sont conservés
// tels quels par Dexie ; seul le nouveau store est créé. Aucune base v2 n'est
// wipée (cf. migrate.js : wipe réservé à v1).
db.version(DEXIE_VERSION).stores({
  dailyExpenditure: 'id, date',
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
  'dailyExpenditure',
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
