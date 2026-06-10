import { db, newRow } from '../db.js'
import { todayKey } from '../ui.js'

// ── Contexte « séance ce jour » (Phase 2, D21) ─────────────────────
// Table dédiée `trainingDays` : { id, date, updatedAt }, 1 ligne par date,
// index unique &date. PRÉSENCE d'une ligne = séance, ABSENCE = repos (calque
// D3/D17 : on ne stocke jamais `false`, untoggle = suppression de la ligne).
// Saisie explicite 1-tap sur le Jour (pas d'inférence). Sert la règle d'alerte
// B (haut-IG un jour de repos). La réconciliation avec la future table
// `workouts` (import Strong) est DÉFÉRÉE (D21).

/** Vrai si une séance est marquée pour la date (présence d'une ligne). */
export async function loadTraining(date = todayKey()) {
  const row = await db.trainingDays.where('date').equals(date).first()
  return !!row
}

/**
 * Marque (true) ou retire (false) la séance du jour.
 *  - true  → upsert ATOMIQUE : crée la ligne si absente, ne fait rien sinon
 *    (présence suffit, pas de valeur à mettre à jour). L'index unique `&date`
 *    (db.js) est le backstop dur contre un doublon concurrent.
 *  - false → suppression de la ligne (retour à « repos », absence = non saisi).
 */
export async function setTraining(trained, date = todayKey()) {
  if (!trained) return clearTraining(date)
  await db.transaction('rw', db.trainingDays, async () => {
    const existing = await db.trainingDays.where('date').equals(date).first()
    if (!existing) await db.trainingDays.add(newRow({ date }))
  })
}

/** Retire la séance du jour → retour à « repos » (ligne supprimée si présente). */
export async function clearTraining(date = todayKey()) {
  const existing = await db.trainingDays.where('date').equals(date).first()
  if (existing) await db.trainingDays.delete(existing.id)
}
