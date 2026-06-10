import { db, newRow } from '../db.js'
import { todayKey } from '../ui.js'
import { isWarmupWorkout } from './strongImport.js'

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

// ── Réconciliation `trainingDays` vs `workouts` (D21 → tranchée D22) ──
// SEAM UNIQUE : `trained` (pour la règle d'alerte B, glycemic.js) = présence d'une
// séance MANUELLE (trainingDays) OU d'une séance IMPORTÉE RÉELLE ce jour-là.
// Option C : une séance importée purement échauffement/étirement (denylist
// strongImport.js) NE compte PAS — un jour de mobilité pure ≈ jour de repos, donc
// l'alerte haut-IG doit rester active. Le toggle manuel prime toujours pour activer.
// Aucune autre expression de précédence « trained » ailleurs dans l'app.
export function effectiveTrained({ manualPresent = false, importedWorkouts = [] } = {}) {
  if (manualPresent) return true
  return importedWorkouts.some((w) => !isWarmupWorkout(w.name))
}

/** Séances importées (workouts) pour une date — sert le seam effectiveTrained. */
export async function loadDayWorkouts(date = todayKey()) {
  return db.workouts.where('date').equals(date).toArray()
}
